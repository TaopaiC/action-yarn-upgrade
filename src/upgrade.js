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
 * @returns {Promise<string>} The version string (e.g. "4.17.20").
 */
export async function getCurrentVersion(moduleName) {
  const { stdout } = await getExecOutput(
    'yarn',
    ['info', moduleName, '--json'],
    { ignoreReturnCode: true }
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
 * @returns {Promise<UpgradeResult>}
 */
export async function upgradeModule(moduleName) {
  let fromVersion = ''
  try {
    fromVersion = await getCurrentVersion(moduleName)
    const majorVersion = fromVersion ? fromVersion.split('.')[0] : ''
    const versionRange = majorVersion
      ? `${moduleName}@^${majorVersion}`
      : moduleName

    await getExecOutput('yarn', ['add', versionRange])
    await getExecOutput('yarn', ['dedupe', moduleName])
    // Restore package.json — we only want yarn.lock changes committed
    await getExecOutput('git', ['checkout', 'package.json'])

    const changed = await hasYarnLockChanged()
    if (!changed) {
      return { moduleName, status: 'unchanged' }
    }

    const toVersion = await getCurrentVersion(moduleName)
    return { moduleName, status: 'upgraded', fromVersion, toVersion }
  } catch (err) {
    // Restore package.json defensively even on error
    try {
      await getExecOutput('git', ['checkout', 'package.json'])
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
