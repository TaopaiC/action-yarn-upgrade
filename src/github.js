import { getOctokit, context } from '@actions/github'

/**
 * Creates a GitHub pull request and returns its URL.
 *
 * @param {Object} options
 * @param {string} options.title  - PR title.
 * @param {string} options.body   - PR body (Markdown).
 * @param {string} options.head   - The source branch (chore/cve-upgrades-*).
 * @param {string} options.base   - The target branch (original branch).
 * @param {string} options.token  - GitHub token for authentication.
 * @param {string[]} [options.labels] - Optional labels to apply to the PR.
 * @returns {Promise<string>} The HTML URL of the created pull request.
 */
export async function createPullRequest({
  title,
  body,
  head,
  base,
  token,
  labels = []
}) {
  const octokit = getOctokit(token)
  const { owner, repo } = context.repo

  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    body,
    head,
    base
  })

  if (labels.length > 0) {
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: pr.number,
      labels
    })
  }

  return pr.html_url
}
