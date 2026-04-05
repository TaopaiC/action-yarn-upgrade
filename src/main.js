import * as core from '@actions/core'
import { runAudit } from './audit.js'
import {
  getCurrentBranch,
  createBranch,
  stageYarnLock,
  commitChanges,
  pushBranch
} from './git.js'
import { createPullRequest } from './github.js'
import { buildCommitMessage, buildSummary } from './report.js'
import { upgradeModule } from './upgrade.js'

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

    // Record the branch the action was triggered on — this becomes the PR base.
    const baseBranch = await getCurrentBranch(workdir)
    core.debug(`Base branch: ${baseBranch}`)

    /** @type {string[]} */
    let modules
    /** @type {Map<string, string[]>} */
    let auditMap

    if (moduleListInput.trim()) {
      modules = moduleListInput
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean)
      auditMap = new Map()
      core.info(`Using manually specified modules: ${modules.join(', ')}`)
    } else {
      core.info(
        'No module_list provided — running yarn audit to detect vulnerable packages...'
      )
      const auditEntries = await runAudit(workdir)
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

    const commitMessage = buildCommitMessage(results, auditMap)
    const summary = buildSummary(results)
    let prUrl = ''

    if (commitMessage) {
      core.info('Committing yarn.lock changes...')
      await commitChanges(commitMessage, workdir)
      core.info(`Pushing branch ${prBranch}...`)
      await pushBranch(prBranch, workdir)

      core.info('Opening pull request...')
      const upgraded = results.filter((r) => r.status === 'upgraded')
      const prTitle = `chore: bump ${upgraded.length} module(s) for CVE fixes`
      prUrl = await createPullRequest({
        title: prTitle,
        body: commitMessage,
        head: prBranch,
        base: baseBranch,
        token: githubToken
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
