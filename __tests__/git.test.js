import { jest } from '@jest/globals'
import * as execFixture from '../__fixtures__/exec.js'

jest.unstable_mockModule('@actions/exec', () => execFixture)

const {
  getCurrentBranch,
  createBranch,
  hasYarnLockChanged,
  stageYarnLock,
  commitChanges,
  pushBranch
} = await import('../src/git.js')

describe('git.js', () => {
  afterEach(() => jest.resetAllMocks())

  describe('getCurrentBranch()', () => {
    it('returns trimmed branch name', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: 'main\n',
        stderr: '',
        exitCode: 0
      })
      expect(await getCurrentBranch()).toBe('main')
    })
  })

  describe('createBranch()', () => {
    it('calls git checkout -b with the given name', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0
      })
      await createBranch('chore/cve-upgrades-20260405')
      expect(execFixture.getExecOutput).toHaveBeenCalledWith('git', [
        'checkout',
        '-b',
        'chore/cve-upgrades-20260405'
      ])
    })
  })

  describe('hasYarnLockChanged()', () => {
    it('returns true when yarn.lock appears in diff output', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: 'yarn.lock\n',
        stderr: '',
        exitCode: 0
      })
      expect(await hasYarnLockChanged()).toBe(true)
    })

    it('returns false when diff output is empty', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0
      })
      expect(await hasYarnLockChanged()).toBe(false)
    })
  })

  describe('stageYarnLock()', () => {
    it('calls git add yarn.lock', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0
      })
      await stageYarnLock()
      expect(execFixture.getExecOutput).toHaveBeenCalledWith('git', [
        'add',
        'yarn.lock'
      ])
    })
  })

  describe('commitChanges()', () => {
    it('calls git commit with the provided message', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0
      })
      await commitChanges('chore: bump modules')
      expect(execFixture.getExecOutput).toHaveBeenCalledWith('git', [
        'commit',
        '-m',
        'chore: bump modules'
      ])
    })
  })

  describe('pushBranch()', () => {
    it('calls git push origin with the given branch name', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0
      })
      await pushBranch('chore/cve-upgrades-20260405')
      expect(execFixture.getExecOutput).toHaveBeenCalledWith('git', [
        'push',
        'origin',
        'chore/cve-upgrades-20260405'
      ])
    })
  })

  describe('workdir support', () => {
    it('passes cwd option when workdir is specified', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: 'main\n',
        stderr: '',
        exitCode: 0
      })
      await getCurrentBranch('/some/subdir')
      expect(execFixture.getExecOutput).toHaveBeenCalledWith(
        'git',
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd: '/some/subdir' }
      )
    })

    it('does not pass cwd option when workdir is empty', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: 'main\n',
        stderr: '',
        exitCode: 0
      })
      await getCurrentBranch('')
      expect(execFixture.getExecOutput).toHaveBeenCalledWith('git', [
        'rev-parse',
        '--abbrev-ref',
        'HEAD'
      ])
    })
  })
})
