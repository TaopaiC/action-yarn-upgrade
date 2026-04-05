import { getExecOutput } from '@actions/exec'

/**
 * Returns the name of the current git branch.
 *
 * @returns {Promise<string>} The current branch name.
 */
export async function getCurrentBranch() {
  const { stdout } = await getExecOutput('git', [
    'rev-parse',
    '--abbrev-ref',
    'HEAD'
  ])
  return stdout.trim()
}

/**
 * Creates and checks out a new git branch.
 *
 * @param {string} branchName - The name of the branch to create.
 * @returns {Promise<void>}
 */
export async function createBranch(branchName) {
  await getExecOutput('git', ['checkout', '-b', branchName])
}

/**
 * Checks whether `yarn.lock` has uncommitted changes relative to HEAD.
 *
 * @returns {Promise<boolean>} True if yarn.lock has been modified.
 */
export async function hasYarnLockChanged() {
  const { stdout } = await getExecOutput('git', [
    'diff',
    '--name-only',
    '--',
    'yarn.lock'
  ])
  return stdout.trim().length > 0
}

/**
 * Stages yarn.lock for the next commit.
 *
 * @returns {Promise<void>}
 */
export async function stageYarnLock() {
  await getExecOutput('git', ['add', 'yarn.lock'])
}

/**
 * Creates a git commit with the given message.
 *
 * @param {string} message - The commit message.
 * @returns {Promise<void>}
 */
export async function commitChanges(message) {
  await getExecOutput('git', ['commit', '-m', message])
}

/**
 * Pushes the given branch to origin.
 *
 * @param {string} branchName - The branch to push.
 * @returns {Promise<void>}
 */
export async function pushBranch(branchName) {
  await getExecOutput('git', ['push', 'origin', branchName])
}
