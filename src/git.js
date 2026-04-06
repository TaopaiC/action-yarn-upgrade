import { getExecOutput } from '@actions/exec'

/**
 * Returns the name of the current git branch.
 *
 * Falls back to the `GITHUB_REF_NAME` environment variable when git reports a
 * detached HEAD (e.g. in GitHub Actions `pull_request` event checkouts).
 *
 * @param {string} [workdir=''] - Working directory for the git command.
 * @returns {Promise<string>} The current branch name.
 */
export async function getCurrentBranch(workdir = '') {
  const { stdout } = await getExecOutput(
    'git',
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    ...(workdir ? [{ cwd: workdir }] : [])
  )
  const branch = stdout.trim()
  // In detached HEAD state (e.g. pull_request event), fall back to the env var
  // set by GitHub Actions which always contains the triggering branch name.
  return branch === 'HEAD' ? (process.env.GITHUB_REF_NAME ?? branch) : branch
}

/**
 * Creates and checks out a new git branch.
 *
 * @param {string} branchName - The name of the branch to create.
 * @param {string} [workdir=''] - Working directory for the git command.
 * @returns {Promise<void>}
 */
export async function createBranch(branchName, workdir = '') {
  await getExecOutput(
    'git',
    ['checkout', '-b', branchName],
    ...(workdir ? [{ cwd: workdir }] : [])
  )
}

/**
 * Checks whether `yarn.lock` has uncommitted changes relative to HEAD.
 *
 * @param {string} [workdir=''] - Working directory for the git command.
 * @returns {Promise<boolean>} True if yarn.lock has been modified.
 */
export async function hasYarnLockChanged(workdir = '') {
  const { stdout } = await getExecOutput(
    'git',
    ['diff', '--name-only', '--', 'yarn.lock'],
    ...(workdir ? [{ cwd: workdir }] : [])
  )
  return stdout.trim().length > 0
}

/**
 * Stages yarn.lock for the next commit.
 *
 * @param {string} [workdir=''] - Working directory for the git command.
 * @returns {Promise<void>}
 */
export async function stageYarnLock(workdir = '') {
  await getExecOutput(
    'git',
    ['add', 'yarn.lock'],
    ...(workdir ? [{ cwd: workdir }] : [])
  )
}

/**
 * Creates a git commit with the given message.
 *
 * @param {string} message - The commit message.
 * @param {string} [workdir=''] - Working directory for the git command.
 * @returns {Promise<void>}
 */
export async function commitChanges(message, workdir = '') {
  await getExecOutput(
    'git',
    ['commit', '-m', message],
    ...(workdir ? [{ cwd: workdir }] : [])
  )
}

/**
 * Pushes the given branch to origin.
 *
 * @param {string} branchName - The branch to push.
 * @param {string} [workdir=''] - Working directory for the git command.
 * @returns {Promise<void>}
 */
export async function pushBranch(branchName, workdir = '') {
  await getExecOutput(
    'git',
    ['push', 'origin', branchName],
    ...(workdir ? [{ cwd: workdir }] : [])
  )
}
