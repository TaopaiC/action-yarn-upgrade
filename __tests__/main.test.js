/**
 * Unit tests for src/main.js
 *
 * All external dependencies are mocked via fixtures so that no real git,
 * yarn, or GitHub API calls are made.
 */
import { jest } from '@jest/globals'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as core from '../__fixtures__/core.js'
import * as execFixture from '../__fixtures__/exec.js'
import * as githubFixture from '../__fixtures__/github.js'

// --- module mocks (must be declared before dynamic import) ---
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/exec', () => execFixture)
jest.unstable_mockModule('@actions/github', () => githubFixture)

const auditMock = { runAudit: jest.fn() }
const gitMock = {
  getCurrentBranch: jest.fn(),
  createBranch: jest.fn(),
  stageYarnLock: jest.fn(),
  commitChanges: jest.fn(),
  pushBranch: jest.fn()
}
const githubMock = { createPullRequest: jest.fn() }
const upgradeMock = { upgradeModule: jest.fn() }
const reportMock = {
  buildTitle: jest.fn(),
  buildCommitMessage: jest.fn(),
  buildSummary: jest.fn()
}

jest.unstable_mockModule('../src/audit.js', () => auditMock)
jest.unstable_mockModule('../src/git.js', () => gitMock)
jest.unstable_mockModule('../src/github.js', () => githubMock)
jest.unstable_mockModule('../src/upgrade.js', () => upgradeMock)
jest.unstable_mockModule('../src/report.js', () => reportMock)

const { run, validateWorkdir, isValidNpmMinimalAgeGate } =
  await import('../src/main.js')

describe('main.js', () => {
  beforeEach(() => {
    core.getInput.mockImplementation((name) => {
      if (name === 'module_list') return ''
      if (name === 'github_token') return 'test-token'
      return ''
    })
    execFixture.getExecOutput.mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0
    })
    gitMock.getCurrentBranch.mockResolvedValue('main')
    gitMock.createBranch.mockResolvedValue()
    gitMock.stageYarnLock.mockResolvedValue()
    gitMock.commitChanges.mockResolvedValue()
    gitMock.pushBranch.mockResolvedValue()
    auditMock.runAudit.mockResolvedValue([])
    upgradeMock.upgradeModule.mockResolvedValue({
      moduleName: 'lodash',
      status: 'unchanged'
    })
    reportMock.buildCommitMessage.mockReturnValue(null)
    reportMock.buildTitle.mockReturnValue(null)
    reportMock.buildSummary.mockReturnValue(
      'Processed 0 module(s): 0 upgraded, 0 unchanged, 0 failed.'
    )
    githubMock.createPullRequest.mockResolvedValue(
      'https://github.com/owner/repo/pull/1'
    )
  })

  afterEach(() => jest.resetAllMocks())

  it('exits early with empty outputs when audit finds no vulnerabilities', async () => {
    auditMock.runAudit.mockResolvedValue([])
    await run()
    expect(core.setOutput).toHaveBeenCalledWith('report', expect.any(String))
    expect(core.setOutput).toHaveBeenCalledWith('pr_url', '')
    expect(gitMock.createBranch).not.toHaveBeenCalled()
  })

  it('uses manually specified module_list instead of running audit', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'module_list') return 'lodash, axios'
      if (name === 'github_token') return 'test-token'
      return ''
    })
    upgradeMock.upgradeModule.mockResolvedValue({
      moduleName: 'lodash',
      status: 'unchanged'
    })
    reportMock.buildSummary.mockReturnValue(
      'Processed 2 module(s): 0 upgraded, 2 unchanged, 0 failed.'
    )

    await run()
    expect(auditMock.runAudit).not.toHaveBeenCalled()
    expect(upgradeMock.upgradeModule).toHaveBeenCalledTimes(2)
  })

  it('stages yarn.lock and creates a PR when modules are upgraded', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'module_list') return 'lodash'
      if (name === 'github_token') return 'test-token'
      return ''
    })
    upgradeMock.upgradeModule.mockResolvedValue({
      moduleName: 'lodash',
      status: 'upgraded',
      fromVersion: '4.17.20',
      toVersion: '4.17.21'
    })
    reportMock.buildCommitMessage.mockReturnValue(
      'CHORE: bump 1 module(s) (lodash) for CVE fixes\n\nUpgraded:\n- lodash: 4.17.20 → 4.17.21'
    )
    reportMock.buildTitle.mockReturnValue(
      'CHORE: bump 1 module(s) (lodash) for CVE fixes'
    )
    reportMock.buildSummary.mockReturnValue(
      'Processed 1 module(s): 1 upgraded, 0 unchanged, 0 failed.'
    )

    await run()

    expect(gitMock.stageYarnLock).toHaveBeenCalled()
    expect(gitMock.commitChanges).toHaveBeenCalled()
    expect(gitMock.pushBranch).toHaveBeenCalled()
    expect(githubMock.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ base: 'main', token: 'test-token' })
    )
    expect(core.setOutput).toHaveBeenCalledWith(
      'pr_url',
      'https://github.com/owner/repo/pull/1'
    )
  })

  it('calls core.warning when a module returns error status', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'module_list') return 'lodash'
      if (name === 'github_token') return 'test-token'
      return ''
    })
    upgradeMock.upgradeModule.mockResolvedValue({
      moduleName: 'lodash',
      status: 'error',
      error: 'yarn add failed'
    })
    reportMock.buildCommitMessage.mockReturnValue(null)
    reportMock.buildSummary.mockReturnValue(
      'Processed 1 module(s): 0 upgraded, 0 unchanged, 1 failed.'
    )

    await run()

    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('lodash'))
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('yarn add failed')
    )
    expect(gitMock.commitChanges).not.toHaveBeenCalled()
  })

  it('does not create a PR when no modules were upgraded', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'module_list') return 'lodash'
      if (name === 'github_token') return 'test-token'
      return ''
    })
    upgradeMock.upgradeModule.mockResolvedValue({
      moduleName: 'lodash',
      status: 'unchanged'
    })
    reportMock.buildCommitMessage.mockReturnValue(null)
    reportMock.buildSummary.mockReturnValue(
      'Processed 1 module(s): 0 upgraded, 1 unchanged, 0 failed.'
    )

    await run()

    expect(gitMock.commitChanges).not.toHaveBeenCalled()
    expect(githubMock.createPullRequest).not.toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith('pr_url', '')
  })

  it('calls core.setFailed when an unexpected error is thrown', async () => {
    auditMock.runAudit.mockResolvedValue([{ moduleName: 'lodash', cves: [] }])
    gitMock.getCurrentBranch.mockRejectedValue(new Error('git error'))
    await run()
    expect(core.setFailed).toHaveBeenCalledWith('git error')
  })

  it('logs audit findings when runAudit finds vulnerabilities', async () => {
    auditMock.runAudit.mockResolvedValue([
      { moduleName: 'lodash', cves: ['CVE-2021-23337'] }
    ])
    upgradeMock.upgradeModule.mockResolvedValue({
      moduleName: 'lodash',
      status: 'unchanged'
    })
    reportMock.buildSummary.mockReturnValue(
      'Processed 1 module(s): 0 upgraded, 1 unchanged, 0 failed.'
    )

    await run()

    expect(auditMock.runAudit).toHaveBeenCalled()
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('1 vulnerable module(s)')
    )
    expect(upgradeMock.upgradeModule).toHaveBeenCalledWith('lodash', '')
  })

  it('does not call setFailed when thrown value is not an Error instance', async () => {
    gitMock.getCurrentBranch.mockRejectedValue('non-error string')
    await run()
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('passes workdir to all underlying functions when workdir input is set', async () => {
    const originalWorkspace = process.env.GITHUB_WORKSPACE
    process.env.GITHUB_WORKSPACE = '/some'
    core.getInput.mockImplementation((name) => {
      if (name === 'module_list') return 'lodash'
      if (name === 'github_token') return 'test-token'
      if (name === 'workdir') return '/some/subdir'
      return ''
    })
    upgradeMock.upgradeModule.mockResolvedValue({
      moduleName: 'lodash',
      status: 'upgraded',
      fromVersion: '4.17.20',
      toVersion: '4.17.21'
    })
    reportMock.buildCommitMessage.mockReturnValue(
      'CHORE: bump 1 module(s) (lodash) for CVE fixes'
    )
    reportMock.buildTitle.mockReturnValue(
      'CHORE: bump 1 module(s) (lodash) for CVE fixes'
    )
    reportMock.buildSummary.mockReturnValue(
      'Processed 1 module(s): 1 upgraded, 0 unchanged, 0 failed.'
    )

    await run()

    expect(gitMock.getCurrentBranch).toHaveBeenCalledWith('/some/subdir')
    expect(gitMock.createBranch).toHaveBeenCalledWith(
      expect.any(String),
      '/some/subdir'
    )
    expect(upgradeMock.upgradeModule).toHaveBeenCalledWith(
      'lodash',
      '/some/subdir'
    )
    expect(gitMock.stageYarnLock).toHaveBeenCalledWith('/some/subdir')
    expect(gitMock.commitChanges).toHaveBeenCalledWith(
      expect.any(String),
      '/some/subdir'
    )
    expect(gitMock.pushBranch).toHaveBeenCalledWith(
      expect.any(String),
      '/some/subdir'
    )
    process.env.GITHUB_WORKSPACE = originalWorkspace
  })

  it('uses base_branch input as PR base when provided', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'module_list') return 'lodash'
      if (name === 'github_token') return 'test-token'
      if (name === 'base_branch') return 'release/v2'
      return ''
    })
    upgradeMock.upgradeModule.mockResolvedValue({
      moduleName: 'lodash',
      status: 'upgraded',
      fromVersion: '4.17.20',
      toVersion: '4.17.21'
    })
    reportMock.buildCommitMessage.mockReturnValue(
      'CHORE: bump 1 module(s) (lodash) for CVE fixes'
    )
    reportMock.buildTitle.mockReturnValue(
      'CHORE: bump 1 module(s) (lodash) for CVE fixes'
    )
    reportMock.buildSummary.mockReturnValue(
      'Processed 1 module(s): 1 upgraded, 0 unchanged, 0 failed.'
    )

    await run()

    expect(gitMock.getCurrentBranch).not.toHaveBeenCalled()
    expect(githubMock.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ base: 'release/v2' })
    )
  })

  it('falls back to getCurrentBranch when base_branch input is empty', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'module_list') return 'lodash'
      if (name === 'github_token') return 'test-token'
      return ''
    })
    upgradeMock.upgradeModule.mockResolvedValue({
      moduleName: 'lodash',
      status: 'upgraded',
      fromVersion: '4.17.20',
      toVersion: '4.17.21'
    })
    reportMock.buildCommitMessage.mockReturnValue(
      'CHORE: bump 1 module(s) (lodash) for CVE fixes'
    )
    reportMock.buildTitle.mockReturnValue(
      'CHORE: bump 1 module(s) (lodash) for CVE fixes'
    )
    reportMock.buildSummary.mockReturnValue(
      'Processed 1 module(s): 1 upgraded, 0 unchanged, 0 failed.'
    )

    await run()

    expect(gitMock.getCurrentBranch).toHaveBeenCalled()
    expect(githubMock.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ base: 'main' })
    )
  })

  it('uses pr_prefix input in PR title and includes upgraded module names', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'module_list') return 'lodash'
      if (name === 'github_token') return 'test-token'
      if (name === 'pr_prefix') return 'SECURITY'
      return ''
    })
    upgradeMock.upgradeModule.mockResolvedValue({
      moduleName: 'lodash',
      status: 'upgraded',
      fromVersion: '4.17.20',
      toVersion: '4.17.21'
    })
    reportMock.buildCommitMessage.mockReturnValue(
      'SECURITY: bump 1 module(s) (lodash) for CVE fixes'
    )
    reportMock.buildTitle.mockReturnValue(
      'SECURITY: bump 1 module(s) (lodash) for CVE fixes'
    )
    reportMock.buildSummary.mockReturnValue(
      'Processed 1 module(s): 1 upgraded, 0 unchanged, 0 failed.'
    )

    await run()

    expect(githubMock.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'SECURITY: bump 1 module(s) (lodash) for CVE fixes'
      })
    )
  })

  it('defaults PR title prefix to CHORE when pr_prefix input is empty', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'module_list') return 'axios'
      if (name === 'github_token') return 'test-token'
      return ''
    })
    upgradeMock.upgradeModule.mockResolvedValue({
      moduleName: 'axios',
      status: 'upgraded',
      fromVersion: '1.0.0',
      toVersion: '1.1.0'
    })
    reportMock.buildCommitMessage.mockReturnValue(
      'CHORE: bump 1 module(s) (axios) for CVE fixes'
    )
    reportMock.buildTitle.mockReturnValue(
      'CHORE: bump 1 module(s) (axios) for CVE fixes'
    )
    reportMock.buildSummary.mockReturnValue(
      'Processed 1 module(s): 1 upgraded, 0 unchanged, 0 failed.'
    )

    await run()

    expect(githubMock.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'CHORE: bump 1 module(s) (axios) for CVE fixes'
      })
    )
  })

  it('passes parsed labels array to createPullRequest', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'module_list') return 'lodash'
      if (name === 'github_token') return 'test-token'
      if (name === 'labels') return 'security, dependencies'
      return ''
    })
    upgradeMock.upgradeModule.mockResolvedValue({
      moduleName: 'lodash',
      status: 'upgraded',
      fromVersion: '4.17.20',
      toVersion: '4.17.21'
    })
    reportMock.buildCommitMessage.mockReturnValue(
      'CHORE: bump 1 module(s) (lodash) for CVE fixes'
    )
    reportMock.buildTitle.mockReturnValue(
      'CHORE: bump 1 module(s) (lodash) for CVE fixes'
    )
    reportMock.buildSummary.mockReturnValue(
      'Processed 1 module(s): 1 upgraded, 0 unchanged, 0 failed.'
    )

    await run()

    expect(githubMock.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        labels: ['security', 'dependencies']
      })
    )
  })

  it('calls core.setFailed when workdir is outside GITHUB_WORKSPACE', async () => {
    const originalWorkspace = process.env.GITHUB_WORKSPACE
    process.env.GITHUB_WORKSPACE = '/github/workspace'

    try {
      core.getInput.mockImplementation((name) => {
        if (name === 'workdir') return '/etc/secrets'
        if (name === 'github_token') return 'test-token'
        return ''
      })

      await run()

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('outside GITHUB_WORKSPACE')
      )
    } finally {
      process.env.GITHUB_WORKSPACE = originalWorkspace
    }
  })

  it('passes empty labels array when labels input is empty', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'module_list') return 'lodash'
      if (name === 'github_token') return 'test-token'
      return ''
    })
    upgradeMock.upgradeModule.mockResolvedValue({
      moduleName: 'lodash',
      status: 'upgraded',
      fromVersion: '4.17.20',
      toVersion: '4.17.21'
    })
    reportMock.buildCommitMessage.mockReturnValue(
      'CHORE: bump 1 module(s) (lodash) for CVE fixes'
    )
    reportMock.buildTitle.mockReturnValue(
      'CHORE: bump 1 module(s) (lodash) for CVE fixes'
    )
    reportMock.buildSummary.mockReturnValue(
      'Processed 1 module(s): 1 upgraded, 0 unchanged, 0 failed.'
    )

    await run()

    expect(githubMock.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ labels: [] })
    )
  })

  describe('module_list package name validation', () => {
    it('calls setFailed and skips upgrade when a module name starts with --flag', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'module_list') return '--flag'
        if (name === 'github_token') return 'test-token'
        return ''
      })

      await run()

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('--flag')
      )
      expect(upgradeMock.upgradeModule).not.toHaveBeenCalled()
    })

    it('calls setFailed and skips upgrade when a module name contains shell metacharacters', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'module_list') return 'lodash; rm -rf /'
        if (name === 'github_token') return 'test-token'
        return ''
      })

      await run()

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Invalid npm package name')
      )
      expect(upgradeMock.upgradeModule).not.toHaveBeenCalled()
    })

    it('calls setFailed when a module name contains uppercase letters', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'module_list') return 'Lodash'
        if (name === 'github_token') return 'test-token'
        return ''
      })

      await run()

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Lodash')
      )
      expect(upgradeMock.upgradeModule).not.toHaveBeenCalled()
    })

    it('calls setFailed listing only the invalid names when mixed with valid ones', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'module_list') return 'lodash, --flag, axios'
        if (name === 'github_token') return 'test-token'
        return ''
      })

      await run()

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('--flag')
      )
      expect(upgradeMock.upgradeModule).not.toHaveBeenCalled()
    })

    it('accepts a valid scoped package name', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'module_list') return '@scope/package'
        if (name === 'github_token') return 'test-token'
        return ''
      })
      upgradeMock.upgradeModule.mockResolvedValue({
        moduleName: '@scope/package',
        status: 'unchanged'
      })
      reportMock.buildSummary.mockReturnValue(
        'Processed 1 module(s): 0 upgraded, 1 unchanged, 0 failed.'
      )

      await run()

      expect(core.setFailed).not.toHaveBeenCalled()
      expect(upgradeMock.upgradeModule).toHaveBeenCalledWith(
        '@scope/package',
        ''
      )
    })
  })

  describe('severity input', () => {
    it('calls setFailed when severity is an invalid value', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'github_token') return 'test-token'
        if (name === 'severity') return 'extreme'
        return ''
      })

      await run()

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Invalid severity value')
      )
      expect(auditMock.runAudit).not.toHaveBeenCalled()
    })

    it.each(['info', 'low', 'moderate', 'high', 'critical'])(
      'accepts valid severity value "%s" and passes it to runAudit',
      async (severityValue) => {
        core.getInput.mockImplementation((name) => {
          if (name === 'github_token') return 'test-token'
          if (name === 'severity') return severityValue
          return ''
        })
        auditMock.runAudit.mockResolvedValue([])

        await run()

        expect(core.setFailed).not.toHaveBeenCalled()
        expect(auditMock.runAudit).toHaveBeenCalledWith('', severityValue)
      }
    )

    it('passes empty severity to runAudit when severity input is not set', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'github_token') return 'test-token'
        return ''
      })
      auditMock.runAudit.mockResolvedValue([])

      await run()

      expect(auditMock.runAudit).toHaveBeenCalledWith('', '')
    })
  })
})

describe('validateWorkdir', () => {
  const originalWorkspace = process.env.GITHUB_WORKSPACE

  afterEach(() => {
    if (originalWorkspace === undefined) {
      delete process.env.GITHUB_WORKSPACE
    } else {
      process.env.GITHUB_WORKSPACE = originalWorkspace
    }
  })

  it('does nothing when workdir is empty', () => {
    process.env.GITHUB_WORKSPACE = '/github/workspace'
    expect(() => validateWorkdir('')).not.toThrow()
  })

  it('does nothing when GITHUB_WORKSPACE is not set', () => {
    delete process.env.GITHUB_WORKSPACE
    expect(() => validateWorkdir('/any/path')).not.toThrow()
  })

  it('does not throw when workdir equals GITHUB_WORKSPACE', () => {
    process.env.GITHUB_WORKSPACE = '/github/workspace'
    expect(() => validateWorkdir('/github/workspace')).not.toThrow()
  })

  it('does not throw when workdir is a subdirectory of GITHUB_WORKSPACE', () => {
    process.env.GITHUB_WORKSPACE = '/github/workspace'
    expect(() =>
      validateWorkdir('/github/workspace/packages/app')
    ).not.toThrow()
  })

  it('throws when workdir is outside GITHUB_WORKSPACE', () => {
    process.env.GITHUB_WORKSPACE = '/github/workspace'
    expect(() => validateWorkdir('/etc/secrets')).toThrow(
      'outside GITHUB_WORKSPACE'
    )
  })

  it('throws when workdir uses path traversal to escape GITHUB_WORKSPACE', () => {
    process.env.GITHUB_WORKSPACE = '/github/workspace'
    expect(() =>
      validateWorkdir('/github/workspace/../../etc/secrets')
    ).toThrow('outside GITHUB_WORKSPACE')
  })

  it('does not confuse a path that shares a prefix but is not a subdirectory', () => {
    process.env.GITHUB_WORKSPACE = '/github/workspace'
    expect(() => validateWorkdir('/github/workspace-evil')).toThrow(
      'outside GITHUB_WORKSPACE'
    )
  })

  it('does not throw when workdir is a relative path inside GITHUB_WORKSPACE', () => {
    process.env.GITHUB_WORKSPACE = '/github/workspace'
    expect(() => validateWorkdir('packages/app')).not.toThrow()
  })

  it('throws when a relative workdir traverses outside GITHUB_WORKSPACE', () => {
    process.env.GITHUB_WORKSPACE = '/github/workspace'
    expect(() => validateWorkdir('../../etc/secrets')).toThrow(
      'outside GITHUB_WORKSPACE'
    )
  })

  it('throws when workdir is a symlink pointing outside GITHUB_WORKSPACE', () => {
    const tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'test-ws-'))
    const tmpOutside = fs.mkdtempSync(path.join(os.tmpdir(), 'test-out-'))
    const symlinkPath = path.join(tmpWorkspace, 'evil-link')
    fs.symlinkSync(tmpOutside, symlinkPath)
    try {
      process.env.GITHUB_WORKSPACE = tmpWorkspace
      expect(() => validateWorkdir(symlinkPath)).toThrow(
        'outside GITHUB_WORKSPACE'
      )
    } finally {
      fs.unlinkSync(symlinkPath)
      fs.rmSync(tmpOutside, { recursive: true })
      fs.rmSync(tmpWorkspace, { recursive: true })
    }
  })
})

describe('isValidNpmMinimalAgeGate', () => {
  it.each([
    ['72', true],
    ['3.5', true],
    ['.5', true],
    ['0', true],
    ['100ms', true],
    ['30s', true],
    ['5m', true],
    ['24h', true],
    ['7d', true],
    ['2w', true],
    ['1.5h', true],
    ['.5d', true]
  ])('accepts valid value %s', (value, expected) => {
    expect(isValidNpmMinimalAgeGate(value)).toBe(expected)
  })

  it.each([
    [''],
    ['abc'],
    ['72x'],
    ['h'],
    ['1 h'],
    ['1h2d'],
    ['--flag'],
    ['1; rm -rf /']
  ])('rejects invalid value %s', (value) => {
    expect(isValidNpmMinimalAgeGate(value)).toBe(false)
  })
})

describe('run() with npmMinimalAgeGate input', () => {
  beforeEach(() => {
    execFixture.getExecOutput.mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0
    })
    gitMock.getCurrentBranch.mockResolvedValue('main')
    gitMock.createBranch.mockResolvedValue()
    gitMock.stageYarnLock.mockResolvedValue()
    gitMock.commitChanges.mockResolvedValue()
    gitMock.pushBranch.mockResolvedValue()
    auditMock.runAudit.mockResolvedValue([])
    reportMock.buildCommitMessage.mockReturnValue(null)
    reportMock.buildSummary.mockReturnValue(
      'Processed 0 module(s): 0 upgraded, 0 unchanged, 0 failed.'
    )
  })

  afterEach(() => jest.resetAllMocks())

  it('skips yarn config set when npmMinimalAgeGate is empty', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'github_token') return 'test-token'
      return ''
    })

    await run()

    expect(execFixture.getExecOutput).not.toHaveBeenCalledWith(
      'yarn',
      expect.arrayContaining(['config', 'set', 'npmMinimalAgeGate']),
      expect.anything()
    )
  })

  it('runs yarn config set with the provided value before upgrading', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'github_token') return 'test-token'
      if (name === 'npmMinimalAgeGate') return '72h'
      return ''
    })

    await run()

    expect(execFixture.getExecOutput).toHaveBeenCalledWith(
      'yarn',
      ['config', 'set', 'npmMinimalAgeGate', '72h'],
      expect.any(Object)
    )
  })

  it('passes workdir as cwd when running yarn config set', async () => {
    const originalWorkspace = process.env.GITHUB_WORKSPACE
    process.env.GITHUB_WORKSPACE = '/some'
    core.getInput.mockImplementation((name) => {
      if (name === 'github_token') return 'test-token'
      if (name === 'workdir') return '/some/subdir'
      if (name === 'npmMinimalAgeGate') return '7d'
      return ''
    })

    await run()

    expect(execFixture.getExecOutput).toHaveBeenCalledWith(
      'yarn',
      ['config', 'set', 'npmMinimalAgeGate', '7d'],
      { cwd: '/some/subdir' }
    )
    process.env.GITHUB_WORKSPACE = originalWorkspace
  })

  it('calls setFailed and skips upgrade when npmMinimalAgeGate is invalid', async () => {
    core.getInput.mockImplementation((name) => {
      if (name === 'github_token') return 'test-token'
      if (name === 'npmMinimalAgeGate') return 'invalid-value'
      return ''
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Invalid npmMinimalAgeGate value')
    )
    expect(execFixture.getExecOutput).not.toHaveBeenCalledWith(
      'yarn',
      expect.arrayContaining(['config', 'set', 'npmMinimalAgeGate']),
      expect.anything()
    )
    expect(auditMock.runAudit).not.toHaveBeenCalled()
  })
})
