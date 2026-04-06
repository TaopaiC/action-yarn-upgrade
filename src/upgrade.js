import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getExecOutput } from '@actions/exec'
import { hasYarnLockChanged } from './git.js'

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
 * Retrieves the currently installed version of an npm module via `yarn info`.
 *
 * @param {string} moduleName
 * @param {string} [workdir=''] - Working directory for the yarn command.
 * @returns {Promise<string>} The version string (e.g. "4.17.20").
 */
export async function getCurrentVersion(moduleName, workdir = '') {
  const { stdout } = await getExecOutput(
    'yarn',
    ['info', moduleName, '--json'],
    { ignoreReturnCode: true, ...(workdir ? { cwd: workdir } : {}) }
  )

  try {
    const info = JSON.parse(stdout.trim())
    // Yarn Berry: { data: { children: { Version: '...' } } }
    // Yarn v1 / fallback: { version: '...' }
    return (
      info?.data?.children?.Version ??
      info?.version ??
      info?.data?.version ??
      ''
    )
  } catch {
    return ''
  }
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
 * @returns {string[]} Unique major version strings, e.g. `['8', '9']`.
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
      const m = line.match(/^\s+version[:\s]+"?(\d+)\./)
      if (m) majors.add(m[1])
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
    fromVersion = await getCurrentVersion(moduleName, workdir)

    // Discover all major versions currently present in yarn.lock so that each
    // major range (e.g. ^8 and ^9) is upgraded independently within its own
    // major boundary. Falls back to the current version's major (or a bare
    // module name) when the lockfile cannot be read or has no matching entries.
    const majorVersions = await getInstalledMajorVersions(moduleName, workdir)
    const versionRanges =
      majorVersions.length > 0
        ? majorVersions.map((major) => `${moduleName}@^${major}`)
        : fromVersion
          ? [`${moduleName}@^${fromVersion.split('.')[0]}`]
          : [moduleName]

    for (const range of versionRanges) {
      await getExecOutput(
        'yarn',
        ['add', range],
        ...(workdir ? [{ cwd: workdir }] : [])
      )
    }
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

    const changed = await hasYarnLockChanged(workdir)
    if (!changed) {
      return { moduleName, status: 'unchanged' }
    }

    const toVersion = await getCurrentVersion(moduleName, workdir)
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
