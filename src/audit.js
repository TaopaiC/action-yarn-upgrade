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
 * Supports two output formats:
 * 1. Classic npm audit JSON with an `advisories` object keyed by numeric ID,
 *    where each advisory has a `module_name` and a `cves` array.
 * 2. Yarn Berry NDJSON format, where each line is a JSON object with `value`
 *    (module name) and `children` (advisory details including URL). GHSA IDs
 *    are extracted from the advisory URL and used in place of CVE identifiers.
 *
 * @param {string} raw - Raw stdout from the audit command.
 * @returns {AuditEntry[]}
 */
export function parseAuditOutput(raw) {
  if (!raw || !raw.trim()) return []

  // Attempt single-JSON parse first (classic npm audit format).
  let entries
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.advisories !== undefined) {
      // Classic npm audit format — advisories keyed by numeric ID.
      entries = Object.values(parsed.advisories).map((advisory) => ({
        moduleName: advisory.module_name ?? '',
        cves: Array.isArray(advisory.cves) ? advisory.cves : []
      }))
    } else {
      // Parsed successfully but no `advisories` key — could be a single-line
      // NDJSON entry. Delegate to the NDJSON parser which handles both cases.
      entries = parseNdjsonAuditOutput(raw)
    }
  } catch {
    // Multi-line NDJSON (yarn npm audit --recursive --json) throws on
    // JSON.parse because the whole string is not a single JSON value.
    entries = parseNdjsonAuditOutput(raw)
  }

  return deduplicateEntries(entries)
}

/**
 * Parses NDJSON output from `yarn npm audit --recursive --json`.
 *
 * Each line is a JSON object shaped as:
 * `{ value: "<module>", children: { URL: "https://github.com/advisories/GHSA-…", … } }`
 *
 * The GHSA ID is extracted from the advisory URL and stored as the CVE
 * identifier, since the NDJSON format does not include traditional CVE IDs.
 *
 * @param {string} raw
 * @returns {AuditEntry[]}
 */
function parseNdjsonAuditOutput(raw) {
  const entries = []
  for (const line of raw.trim().split('\n')) {
    if (!line.trim()) continue
    try {
      const obj = JSON.parse(line)
      const moduleName = obj.value ?? ''
      if (!moduleName) continue
      const url = obj.children?.URL ?? ''
      const ghsaMatch = url.match(/\/advisories\/(GHSA-[^/\s]+)/)
      entries.push({ moduleName, cves: ghsaMatch ? [ghsaMatch[1]] : [] })
    } catch {
      // Skip lines that are not valid JSON.
    }
  }
  return entries
}

/**
 * Deduplicates audit entries by module name, merging CVE/GHSA identifier sets.
 *
 * @param {AuditEntry[]} entries
 * @returns {AuditEntry[]}
 */
function deduplicateEntries(entries) {
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
