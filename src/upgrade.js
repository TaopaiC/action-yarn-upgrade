import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getExecOutput } from '@actions/exec'
import { hasYarnLockChanged, stageYarnLock } from './git.js'

/**
 * @typedef {'upgraded' | 'unchanged' | 'error'} UpgradeStatus
 *
 * @typedef {Object} UpgradeResult
 * @property {string} moduleName - The name of the module.
 * @property {UpgradeStatus} status - Outcome of the upgrade attempt.
 * @property {string} [fromVersion] - Version before upgrade (only when upgraded).
 * @property {string} [toVersion]   - Version after upgrade  (only when upgraded).
 * @property {string} [error]       - Error message (only when status is 'error').
 */

/**
 * Retrieves all currently installed versions of an npm module via
 * `yarn info --recursive`.
 *
 * With `--recursive` the output is NDJSON (one JSON object per line), where
 * each line represents one resolved instance of the module. All recognised
 * version strings across every line are collected and returned.
 *
 * @param {string} moduleName
 * @param {string} [workdir=''] - Working directory for the yarn command.
 * @returns {Promise<string[]>} All installed version strings (e.g. `['8.0.4', '9.0.1']`).
 */
export async function getCurrentVersions(moduleName, workdir = '') {
  const { stdout } = await getExecOutput(
    'yarn',
    ['info', moduleName, '--json', '--recursive'],
    { ignoreReturnCode: true, ...(workdir ? { cwd: workdir } : {}) }
  )

  // Output is NDJSON when --recursive returns multiple results; collect the
  // version string from every parseable line.
  const versions = []
  for (const line of stdout.trim().split('\n')) {
    if (!line) continue
    try {
      const info = JSON.parse(line)
      // Yarn Berry recursive: { children: { Version: '...' } }
      // Yarn Berry standard:  { data: { children: { Version: '...' } } }
      // Yarn v1 / fallback:   { version: '...' } or { data: { version: '...' } }
      const version =
        info?.data?.children?.Version ??
        info?.children?.Version ??
        info?.version ??
        info?.data?.version ??
        ''
      if (version) versions.push(version)
    } catch {
      // skip unparsable lines
    }
  }

  return versions
}

/**
 * Parses yarn.lock content and returns unique major version numbers (as
 * strings) for the given module.
 *
 * Supports both Yarn v1 classic (`version "X.Y.Z"`) and Yarn Berry
 * (`version: X.Y.Z`) lockfile formats.
 *
 * @param {string} lockfileContent - Raw contents of yarn.lock.
 * @param {string} moduleName - The npm module name to look up.
 * @returns {string[]} Unique version key strings. For non-zero majors this is
 *   just the major (e.g. `['8', '9']`); for zero-major packages it includes
 *   the minor so the `^` range stays within the same minor line
 *   (e.g. `['0.8', '0.9']`).
 */
export function extractMajorVersions(lockfileContent, moduleName) {
  if (!lockfileContent) return []

  const majors = new Set()
  const lines = lockfileContent.split('\n')
  const escapedName = moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Matches top-level lockfile entry headers that reference this module.
  // Yarn v1:     minimatch@^8.0.0:
  // Yarn Berry:  "minimatch@npm:^8.0.0":
  const entryRe = new RegExp(`(?:^|")${escapedName}@`)
  let inSection = false

  for (const line of lines) {
    // Top-level lines (not indented) delimit lockfile sections.
    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      inSection = entryRe.test(line)
    }
    if (inSection) {
      // Yarn v1:    `  version "8.0.4"`
      // Yarn Berry: `  version: 8.0.4`
      const m = line.match(/^\s+version[:\s]+"?(\d+)\.(\d+)\./)
      if (m) {
        // For zero-major packages (0.x.y) the minor is the effective breaking
        // version, so we pin the range to major.minor (e.g. "0.8") rather than
        // just major ("0") to avoid crossing minor boundaries.
        majors.add(m[1] === '0' ? `${m[1]}.${m[2]}` : m[1])
      }
    }
  }

  return [...majors]
}

/**
 * Reads `yarn.lock` from the working directory and returns the unique set of
 * installed major versions for the given module.
 *
 * Returns an empty array when the lockfile cannot be read or contains no
 * matching entries.
 *
 * @param {string} moduleName
 * @param {string} [workdir=''] - Working directory containing yarn.lock.
 * @returns {Promise<string[]>}
 */
export async function getInstalledMajorVersions(moduleName, workdir = '') {
  const lockfilePath = workdir ? join(workdir, 'yarn.lock') : 'yarn.lock'
  try {
    const content = await readFile(lockfilePath, 'utf8')
    return extractMajorVersions(content, moduleName)
  } catch {
    return []
  }
}

/**
 * Attempts to upgrade a single module to the latest compatible patch/minor
 * version (no major bumps) and detects whether yarn.lock actually changed.
 *
 * Steps:
 *  1. Record the current installed version.
 *  2. Run `yarn add <module>@^<major>` to upgrade within the same major.
 *  3. Run `yarn dedupe <module>` to collapse duplicate resolutions.
 *  4. Restore `package.json` to avoid committing direct-dependency string changes.
 *  5. Check whether yarn.lock was modified. If yes → record new version.
 *
 * @param {string} moduleName
 * @param {string} [workdir=''] - Working directory for yarn and git commands.
 * @returns {Promise<UpgradeResult>}
 */
export async function upgradeModule(moduleName, workdir = '') {
  let fromVersion = ''
  try {
    const fromVersions = await getCurrentVersions(moduleName, workdir)
    fromVersion = fromVersions.join(', ')

    // Discover all major versions currently present in yarn.lock so that each
    // major range (e.g. ^8 and ^9) is upgraded independently within its own
    // major boundary. Falls back to the unique majors derived from the live
    // installed versions, or a bare module name when none are available.
    const majorVersions = await getInstalledMajorVersions(moduleName, workdir)
    const versionRanges =
      majorVersions.length > 0
        ? majorVersions.map((major) => `${moduleName}@^${major}`)
        : fromVersions.length > 0
          ? [
              ...new Set(
                fromVersions.map((v) => {
                  const parts = v.split('.')
                  return parts[0] === '0' ? `${parts[0]}.${parts[1]}` : parts[0]
                })
              )
            ].map((version) => `${moduleName}@^${version}`)
          : [moduleName]

    for (const range of versionRanges) {
      await getExecOutput(
        'yarn',
        ['add', range],
        ...(workdir ? [{ cwd: workdir }] : [])
      )
      await getExecOutput(
        'yarn',
        ['dedupe', moduleName],
        ...(workdir ? [{ cwd: workdir }] : [])
      )
      // Restore package.json — we only want yarn.lock changes committed
      await getExecOutput(
        'git',
        ['checkout', 'package.json'],
        ...(workdir ? [{ cwd: workdir }] : [])
      )
      // Run a bare install to sync node_modules with the restored package.json.
      // CI=false prevents interactive warnings from being treated as errors.
      await getExecOutput('yarn', undefined, {
        env: { ...process.env, CI: 'false' },
        ...(workdir ? { cwd: workdir } : {})
      })
    }

    const changed = await hasYarnLockChanged(workdir)
    if (!changed) {
      return { moduleName, status: 'unchanged' }
    }

    // Stage yarn.lock so the next module's hasYarnLockChanged() check starts
    // from this point rather than accumulating all previous changes.
    await stageYarnLock(workdir)

    const toVersions = await getCurrentVersions(moduleName, workdir)
    const toVersion = toVersions.join(', ')
    return { moduleName, status: 'upgraded', fromVersion, toVersion }
  } catch (err) {
    // Restore package.json defensively even on error
    try {
      await getExecOutput(
        'git',
        ['checkout', 'package.json'],
        ...(workdir ? [{ cwd: workdir }] : [])
      )
    } catch {
      // best-effort
    }
    return {
      moduleName,
      status: 'error',
      error: err instanceof Error ? err.message : String(err)
    }
  }
}
