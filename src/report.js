/**
 * @typedef {import('./upgrade.js').UpgradeResult} UpgradeResult
 */

/**
 * Builds the title used for both the git commit and the pull request.
 *
 * Returns `null` when no modules were actually upgraded.
 *
 * @param {UpgradeResult[]} results - Array of upgrade outcomes.
 * @param {string} prPrefix - The prefix for the title (e.g., 'CHORE', 'SECURITY').
 * @returns {string | null}
 */
export function buildTitle(results, prPrefix) {
  const upgraded = results.filter((r) => r.status === 'upgraded')
  if (upgraded.length === 0) return null
  const moduleNames = upgraded.map((r) => r.moduleName).join(', ')
  return `${prPrefix}: bump ${upgraded.length} module(s) (${moduleNames}) for CVE fixes`
}

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
 * @param {string} prPrefix - The prefix used in the commit/PR title.
 * @returns {string | null}
 */
export function buildCommitMessage(results, auditMap, prPrefix) {
  const upgraded = results.filter((r) => r.status === 'upgraded')
  const unchanged = results.filter((r) => r.status === 'unchanged')
  const errored = results.filter((r) => r.status === 'error')

  if (upgraded.length === 0) return null

  const lines = [buildTitle(results, prPrefix), '']

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
