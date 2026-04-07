import { realpathSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import * as core from '@actions/core'
import { getExecOutput } from '@actions/exec'
import { runAudit } from './audit.js'
import {
  getCurrentBranch,
  createBranch,
  stageYarnLock,
  commitChanges,
  pushBranch
} from './git.js'
import { createPullRequest } from './github.js'
import { buildCommitMessage, buildTitle, buildSummary } from './report.js'
import { upgradeModule } from './upgrade.js'

/** @type {RegExp} Matches a plain number or number with ms/s/m/h/d/w suffix. */
const NPM_MINIMAL_AGE_GATE_RE = /^(\d*\.?\d+)(ms|s|m|h|d|w)?$/

/** Valid values for the severity input. */
const VALID_SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical']

/**
 * Validates that the npmMinimalAgeGate value is a number optionally followed
 * by a time unit suffix (ms, s, m, h, d, w).
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isValidNpmMinimalAgeGate(value) {
  return NPM_MINIMAL_AGE_GATE_RE.test(value)
}

/**
 * Validates that a string is a legal npm package name.
 * Accepts plain names and scoped names (@scope/package).
 *
 * @param {string} name
 * @returns {boolean}
 */
function isValidPackageName(name) {
  return /^(@[a-z0-9][a-z0-9-._~]*\/)?[a-z0-9][a-z0-9-._~]*$/.test(name)
}

/**
 * Validates that workdir is within GITHUB_WORKSPACE to prevent path traversal.
 *
 * Handles both absolute and relative workdir values, and resolves symlinks via
 * realpathSync to prevent symlink-based escapes. Falls back to path.resolve()
 * when the path does not yet exist (e.g. synthetic paths in unit tests).
 *
 * When GITHUB_WORKSPACE is not set (e.g. local development) the check is
 * skipped so local testing is not broken.
 *
 * @param {string} workdir - The working directory input value.
 * @throws {Error} When workdir resolves to a path outside GITHUB_WORKSPACE.
 */
export function validateWorkdir(workdir) {
  if (!workdir) return

  const workspace = process.env.GITHUB_WORKSPACE
  if (!workspace) return

  // resolve(workspace, workdir) handles relative paths; absolute paths are unchanged
  const absoluteWorkdir = resolve(workspace, workdir)

  // realpathSync follows symlinks; fall back to the resolved path when the
  // directory does not yet exist
  let realWorkdir, realWorkspace
  try {
    realWorkdir = realpathSync(absoluteWorkdir)
  } catch {
    realWorkdir = absoluteWorkdir
  }
  try {
    realWorkspace = realpathSync(workspace)
  } catch {
    realWorkspace = resolve(workspace)
  }

  if (
    realWorkdir !== realWorkspace &&
    !realWorkdir.startsWith(realWorkspace + sep)
  ) {
    throw new Error(
      `workdir "${workdir}" resolves outside GITHUB_WORKSPACE "${realWorkspace}"`
    )
  }
}

/**
 * Generates a timestamp-based branch name for the CVE upgrade PR.
 *
 * @returns {string}
 */
function generateBranchName() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `chore/cve-upgrades-${stamp}`
}

/**
 * The main function for the action.
 *
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run() {
  try {
    const moduleListInput = core.getInput('module_list')
    const githubToken = core.getInput('github_token', { required: true })
    const workdir = core.getInput('workdir')
    validateWorkdir(workdir)
    const baseBranchInput = core.getInput('base_branch')
    const prPrefix = core.getInput('pr_prefix') || 'CHORE'
    const labelsInput = core.getInput('labels')
    const npmMinimalAgeGate = core.getInput('npmMinimalAgeGate')
    const severity = core.getInput('severity')

    if (severity && !VALID_SEVERITIES.includes(severity)) {
      core.setFailed(
        `Invalid severity value: "${severity}". Valid values are: ${VALID_SEVERITIES.join(', ')}.`
      )
      return
    }

    if (npmMinimalAgeGate) {
      if (!isValidNpmMinimalAgeGate(npmMinimalAgeGate)) {
        core.setFailed(
          `Invalid npmMinimalAgeGate value: "${npmMinimalAgeGate}". Expected a number with optional time unit suffix (ms, s, m, h, d, w).`
        )
        return
      }
      core.info(`Setting yarn npmMinimalAgeGate to: ${npmMinimalAgeGate}`)
      await getExecOutput(
        'yarn',
        ['config', 'set', 'npmMinimalAgeGate', npmMinimalAgeGate],
        { ...(workdir ? { cwd: workdir } : {}) }
      )
    }

    /** @type {string[]} */
    let modules
    /** @type {Map<string, string[]>} */
    let auditMap

    if (moduleListInput.trim()) {
      modules = moduleListInput
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean)

      const invalidModules = modules.filter((m) => !isValidPackageName(m))
      if (invalidModules.length > 0) {
        core.setFailed(
          `Invalid npm package name(s) in module_list: ${invalidModules.join(', ')}`
        )
        return
      }

      auditMap = new Map()
      core.info(`Using manually specified modules: ${modules.join(', ')}`)
    } else {
      core.info(
        'No module_list provided — running yarn audit to detect vulnerable packages...'
      )
      const auditEntries = await runAudit(workdir, severity)
      modules = auditEntries.map((e) => e.moduleName)
      auditMap = new Map(auditEntries.map((e) => [e.moduleName, e.cves]))
      core.info(
        auditEntries.length > 0
          ? `Audit found ${auditEntries.length} vulnerable module(s): ${modules.join(', ')}`
          : 'No vulnerabilities found by audit. Nothing to upgrade.'
      )
    }

    if (modules.length === 0) {
      const summary =
        'Processed 0 module(s): 0 upgraded, 0 unchanged, 0 failed.'
      core.setOutput('report', summary)
      core.setOutput('pr_url', '')
      core.info(summary)
      return
    }

    // Use the explicit base_branch input when provided; otherwise detect from git.
    const baseBranch =
      baseBranchInput.trim() || (await getCurrentBranch(workdir))
    core.debug(`Base branch: ${baseBranch}`)

    // Create a dedicated branch for the upgrade changes.
    const prBranch = generateBranchName()
    core.info(`Creating branch: ${prBranch}`)
    await createBranch(prBranch, workdir)

    // Upgrade each module sequentially; errors are caught inside upgradeModule.
    const results = []
    for (const moduleName of modules) {
      core.info(`Upgrading ${moduleName}...`)
      const result = await upgradeModule(moduleName, workdir)
      if (result.status === 'upgraded') {
        await stageYarnLock(workdir)
        core.info(
          `  ✔ ${moduleName}: ${result.fromVersion} → ${result.toVersion}`
        )
      } else if (result.status === 'unchanged') {
        core.info(`  – ${moduleName}: no change in yarn.lock`)
      } else {
        core.warning(`  ✘ ${moduleName}: ${result.error}`)
      }
      results.push(result)
    }

    const commitMessage = buildCommitMessage(results, auditMap, prPrefix)
    const summary = buildSummary(results)
    let prUrl = ''

    if (commitMessage) {
      core.info('Committing yarn.lock changes...')
      await commitChanges(commitMessage, workdir)
      core.info(`Pushing branch ${prBranch}...`)
      await pushBranch(prBranch, workdir)

      core.info('Opening pull request...')
      const prTitle = buildTitle(results, prPrefix)
      const labels = labelsInput
        ? labelsInput
            .split(',')
            .map((l) => l.trim())
            .filter(Boolean)
        : []
      prUrl = await createPullRequest({
        title: prTitle,
        body: commitMessage,
        head: prBranch,
        base: baseBranch,
        token: githubToken,
        labels
      })
      core.info(`Pull request created: ${prUrl}`)
    } else {
      core.info('No modules were upgraded — skipping commit and PR.')
    }

    core.setOutput('report', summary)
    core.setOutput('pr_url', prUrl)
    core.info(summary)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}
