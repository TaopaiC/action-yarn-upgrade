import { getExecOutput } from '@actions/exec'

/**
 * @typedef {Object} AuditEntry
 * @property {string} moduleName - The name of the vulnerable npm module.
 * @property {string[]} cves - CVE identifiers associated with this module.
 */

/**
 * Runs `yarn npm audit --recursive --json` and returns a list of entries
 * mapping each vulnerable module to its associated CVEs.
 *
 * Returns an empty array when no vulnerabilities are found or the command
 * exits with a non-zero code unrelated to vulnerabilities.
 *
 * @param {string} [workdir=''] - Working directory for the yarn command.
 * @returns {Promise<AuditEntry[]>}
 */
export async function runAudit(workdir = '') {
  let stdout = ''
  try {
    // `yarn npm audit` exits with code 1 when vulnerabilities are found —
    // we capture the output regardless and parse it manually.
    const result = await getExecOutput(
      'yarn',
      ['npm', 'audit', '--recursive', '--json'],
      { ignoreReturnCode: true, ...(workdir ? { cwd: workdir } : {}) }
    )
    stdout = result.stdout
  } catch {
    return []
  }

  return parseAuditOutput(stdout)
}

/**
 * Parses the JSON output of `yarn npm audit --json`.
 *
 * Yarn Berry audit output wraps advisories under `advisories` keyed by
 * numeric ID. Each advisory has a `module_name` and a `cves` array.
 *
 * @param {string} raw - Raw stdout from the audit command.
 * @returns {AuditEntry[]}
 */
export function parseAuditOutput(raw) {
  if (!raw || !raw.trim()) return []

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }

  const advisories = parsed?.advisories ?? {}
  const entries = Object.values(advisories).map((advisory) => ({
    moduleName: advisory.module_name ?? '',
    cves: Array.isArray(advisory.cves) ? advisory.cves : []
  }))

  // Deduplicate by moduleName, merging CVE lists
  /** @type {Map<string, Set<string>>} */
  const map = new Map()
  for (const entry of entries) {
    if (!entry.moduleName) continue
    if (!map.has(entry.moduleName)) map.set(entry.moduleName, new Set())
    for (const cve of entry.cves) map.get(entry.moduleName).add(cve)
  }

  return Array.from(map.entries()).map(([moduleName, cveSet]) => ({
    moduleName,
    cves: Array.from(cveSet)
  }))
}
