import { jest } from '@jest/globals'
import * as githubFixture from '../__fixtures__/github.js'

jest.unstable_mockModule('@actions/github', () => githubFixture)

const { createPullRequest } = await import('../src/github.js')

describe('github.js', () => {
  afterEach(() => jest.resetAllMocks())

  it('creates a pull request and returns the HTML URL', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      data: {
        html_url: 'https://github.com/test-owner/test-repo/pull/1',
        number: 1
      }
    })
    const mockAddLabels = jest.fn().mockResolvedValue({})
    githubFixture.getOctokit.mockReturnValue({
      rest: {
        pulls: { create: mockCreate },
        issues: { addLabels: mockAddLabels }
      }
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
    expect(mockAddLabels).not.toHaveBeenCalled()
  })

  it('adds labels to the pull request when labels are provided', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      data: {
        html_url: 'https://github.com/test-owner/test-repo/pull/2',
        number: 2
      }
    })
    const mockAddLabels = jest.fn().mockResolvedValue({})
    githubFixture.getOctokit.mockReturnValue({
      rest: {
        pulls: { create: mockCreate },
        issues: { addLabels: mockAddLabels }
      }
    })

    const url = await createPullRequest({
      title: 'CHORE: bump 1 module(s) (lodash) for CVE fixes',
      body: 'Upgraded:\n- lodash: 4.17.20 → 4.17.21',
      head: 'chore/cve-upgrades-20260405',
      base: 'main',
      token: 'test-token',
      labels: ['security', 'dependencies']
    })

    expect(url).toBe('https://github.com/test-owner/test-repo/pull/2')
    expect(mockAddLabels).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      issue_number: 2,
      labels: ['security', 'dependencies']
    })
  })

  it('does not call addLabels when labels array is empty', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      data: {
        html_url: 'https://github.com/test-owner/test-repo/pull/3',
        number: 3
      }
    })
    const mockAddLabels = jest.fn().mockResolvedValue({})
    githubFixture.getOctokit.mockReturnValue({
      rest: {
        pulls: { create: mockCreate },
        issues: { addLabels: mockAddLabels }
      }
    })

    await createPullRequest({
      title: 't',
      body: 'b',
      head: 'h',
      base: 'b',
      token: 'test-token',
      labels: []
    })

    expect(mockAddLabels).not.toHaveBeenCalled()
  })

  it('propagates errors from the GitHub API', async () => {
    githubFixture.getOctokit.mockReturnValue({
      rest: {
        pulls: {
          create: jest.fn().mockRejectedValue(new Error('Bad credentials'))
        },
        issues: { addLabels: jest.fn() }
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
