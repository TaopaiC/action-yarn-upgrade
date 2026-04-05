import { jest } from '@jest/globals'
import * as githubFixture from '../__fixtures__/github.js'

jest.unstable_mockModule('@actions/github', () => githubFixture)

const { createPullRequest } = await import('../src/github.js')

describe('github.js', () => {
  afterEach(() => jest.resetAllMocks())

  it('creates a pull request and returns the HTML URL', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      data: { html_url: 'https://github.com/test-owner/test-repo/pull/1' }
    })
    githubFixture.getOctokit.mockReturnValue({
      rest: { pulls: { create: mockCreate } }
    })

    const url = await createPullRequest({
      title: 'chore: bump modules',
      body: 'Upgraded:\n- lodash: 4.17.20 → 4.17.21',
      head: 'chore/cve-upgrades-20260405',
      base: 'main',
      token: 'test-token'
    })

    expect(url).toBe('https://github.com/test-owner/test-repo/pull/1')
    expect(githubFixture.getOctokit).toHaveBeenCalledWith('test-token')
    expect(mockCreate).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      title: 'chore: bump modules',
      body: 'Upgraded:\n- lodash: 4.17.20 → 4.17.21',
      head: 'chore/cve-upgrades-20260405',
      base: 'main'
    })
  })

  it('propagates errors from the GitHub API', async () => {
    githubFixture.getOctokit.mockReturnValue({
      rest: {
        pulls: {
          create: jest.fn().mockRejectedValue(new Error('Bad credentials'))
        }
      }
    })

    await expect(
      createPullRequest({
        title: 't',
        body: 'b',
        head: 'h',
        base: 'b',
        token: 'bad-token'
      })
    ).rejects.toThrow('Bad credentials')
  })
})
