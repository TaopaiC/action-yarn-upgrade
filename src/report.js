/**
 * @typedef {import('./upgrade.js').UpgradeResult} UpgradeResult
 */

/**
 * Builds the git commit message (and PR body) summarising the upgrade run.
 *
 * Returns `null` when no modules were actually upgraded, so the caller can
 * skip the commit/push/PR steps entirely.
 *
 * @param {UpgradeResult[]} results   - Array of upgrade outcomes.
 * @param {Map<string, string[]>} auditMap
 *   Maps module name → CVE IDs discovered by audit. Pass an empty Map when
 *   modules were specified manually.
 * @returns {string | null}
 */
export function buildCommitMessage(results, auditMap) {
  const upgraded = results.filter((r) => r.status === 'upgraded')
  const unchanged = results.filter((r) => r.status === 'unchanged')
  const errored = results.filter((r) => r.status === 'error')

  if (upgraded.length === 0) return null

  const lines = ['chore: bump node modules for CVE fixes', '']

  lines.push('Upgraded:')
  for (const r of upgraded) {
    const cves = auditMap.get(r.moduleName) ?? []
    const cveNote = cves.length > 0 ? ` (may resolve ${cves.join(', ')})` : ''
    lines.push(`- ${r.moduleName}: ${r.fromVersion} → ${r.toVersion}${cveNote}`)
  }

  if (unchanged.length > 0) {
    lines.push('')
    lines.push('Not upgraded (no change in yarn.lock):')
    for (const r of unchanged) {
      lines.push(`- ${r.moduleName}`)
    }
  }

  if (errored.length > 0) {
    lines.push('')
    lines.push('Failed (skipped):')
    for (const r of errored) {
      lines.push(`- ${r.moduleName}: ${r.error}`)
    }
  }

  return lines.join('\n')
}

/**
 * Builds a short human-readable summary for the action output.
 *
 * @param {UpgradeResult[]} results
 * @returns {string}
 */
export function buildSummary(results) {
  const upgraded = results.filter((r) => r.status === 'upgraded').length
  const unchanged = results.filter((r) => r.status === 'unchanged').length
  const errored = results.filter((r) => r.status === 'error').length
  const total = results.length

  return (
    `Processed ${total} module(s): ` +
    `${upgraded} upgraded, ${unchanged} unchanged, ${errored} failed.`
  )
}
