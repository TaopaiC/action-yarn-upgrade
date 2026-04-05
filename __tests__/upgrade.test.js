import { jest } from '@jest/globals'
import * as execFixture from '../__fixtures__/exec.js'

jest.unstable_mockModule('@actions/exec', () => execFixture)

const { getCurrentVersion, upgradeModule } = await import('../src/upgrade.js')

/** Helper: build Yarn Berry–style info JSON */
const yarnInfoJson = (version) =>
  JSON.stringify({ data: { children: { Version: version } } })

describe('upgrade.js', () => {
  afterEach(() => jest.resetAllMocks())

  describe('getCurrentVersion()', () => {
    it('parses Yarn Berry info JSON', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: yarnInfoJson('4.17.21'),
        stderr: '',
        exitCode: 0
      })
      expect(await getCurrentVersion('lodash')).toBe('4.17.21')
    })

    it('returns empty string on invalid JSON', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: 'bad',
        stderr: '',
        exitCode: 1
      })
      expect(await getCurrentVersion('lodash')).toBe('')
    })

    it('falls back to info.version for yarn v1 format', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: JSON.stringify({ version: '2.0.0' }),
        stderr: '',
        exitCode: 0
      })
      expect(await getCurrentVersion('some-pkg')).toBe('2.0.0')
    })

    it('falls back to info.data.version when children.Version is absent', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: JSON.stringify({ data: { version: '3.1.0' } }),
        stderr: '',
        exitCode: 0
      })
      expect(await getCurrentVersion('some-pkg')).toBe('3.1.0')
    })

    it('returns empty string when info has no recognized version field', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: JSON.stringify({ name: 'some-pkg' }),
        stderr: '',
        exitCode: 0
      })
      expect(await getCurrentVersion('some-pkg')).toBe('')
    })
  })

  describe('upgradeModule()', () => {
    it('returns upgraded when yarn.lock changed', async () => {
      // Calls in order: yarn info (from), yarn add, yarn dedupe, git checkout, git diff, yarn info (to)
      execFixture.getExecOutput
        .mockResolvedValueOnce({
          stdout: yarnInfoJson('4.17.20'),
          stderr: '',
          exitCode: 0
        }) // getCurrentVersion (from)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // yarn add
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // yarn dedupe
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git checkout package.json
        .mockResolvedValueOnce({
          stdout: 'yarn.lock\n',
          stderr: '',
          exitCode: 0
        }) // git diff (changed)
        .mockResolvedValueOnce({
          stdout: yarnInfoJson('4.17.21'),
          stderr: '',
          exitCode: 0
        }) // getCurrentVersion (to)

      const result = await upgradeModule('lodash')
      expect(result).toEqual({
        moduleName: 'lodash',
        status: 'upgraded',
        fromVersion: '4.17.20',
        toVersion: '4.17.21'
      })
    })

    it('returns unchanged when yarn.lock did not change', async () => {
      execFixture.getExecOutput
        .mockResolvedValueOnce({
          stdout: yarnInfoJson('4.17.21'),
          stderr: '',
          exitCode: 0
        }) // getCurrentVersion (from)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // yarn add
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // yarn dedupe
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git checkout package.json
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git diff (no change)

      const result = await upgradeModule('lodash')
      expect(result).toEqual({ moduleName: 'lodash', status: 'unchanged' })
    })

    it('returns error and continues when yarn add throws', async () => {
      execFixture.getExecOutput
        .mockResolvedValueOnce({
          stdout: yarnInfoJson('4.17.20'),
          stderr: '',
          exitCode: 0
        }) // getCurrentVersion
        .mockRejectedValueOnce(new Error('yarn add failed')) // yarn add throws
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git checkout package.json (defensive)

      const result = await upgradeModule('lodash')
      expect(result.status).toBe('error')
      expect(result.error).toBe('yarn add failed')
    })

    it('handles unknown error type in catch block', async () => {
      execFixture.getExecOutput
        .mockResolvedValueOnce({
          stdout: yarnInfoJson('1.0.0'),
          stderr: '',
          exitCode: 0
        }) // getCurrentVersion
        .mockRejectedValueOnce('string error') // yarn add throws non-Error
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git checkout package.json (defensive)

      const result = await upgradeModule('some-pkg')
      expect(result.status).toBe('error')
      expect(result.error).toBe('string error')
    })

    it('proceeds without major version when fromVersion is empty', async () => {
      execFixture.getExecOutput
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // getCurrentVersion → empty
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // yarn add (no @^)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // yarn dedupe
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git checkout package.json
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git diff (no change)

      const result = await upgradeModule('unknown-pkg')
      expect(result).toEqual({ moduleName: 'unknown-pkg', status: 'unchanged' })
      expect(execFixture.getExecOutput).toHaveBeenCalledWith('yarn', [
        'add',
        'unknown-pkg'
      ])
    })

    it('still returns error when defensive git checkout also throws', async () => {
      execFixture.getExecOutput
        .mockResolvedValueOnce({
          stdout: yarnInfoJson('4.17.20'),
          stderr: '',
          exitCode: 0
        }) // getCurrentVersion
        .mockRejectedValueOnce(new Error('network failure')) // yarn add throws
        .mockRejectedValueOnce(new Error('git checkout failed')) // defensive git checkout also throws

      const result = await upgradeModule('lodash')
      expect(result.status).toBe('error')
      expect(result.error).toBe('network failure')
    })

    it('passes cwd option to all commands when workdir is specified', async () => {
      const workdir = '/custom/dir'
      execFixture.getExecOutput
        .mockResolvedValueOnce({
          stdout: yarnInfoJson('1.0.0'),
          stderr: '',
          exitCode: 0
        }) // getCurrentVersion (from) — with cwd
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // yarn add
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // yarn dedupe
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git checkout package.json
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git diff (no change)

      await upgradeModule('some-pkg', workdir)

      expect(execFixture.getExecOutput).toHaveBeenCalledWith(
        'yarn',
        ['info', 'some-pkg', '--json'],
        { ignoreReturnCode: true, cwd: workdir }
      )
      expect(execFixture.getExecOutput).toHaveBeenCalledWith(
        'yarn',
        ['add', 'some-pkg@^1'],
        { cwd: workdir }
      )
      expect(execFixture.getExecOutput).toHaveBeenCalledWith(
        'yarn',
        ['dedupe', 'some-pkg'],
        { cwd: workdir }
      )
      expect(execFixture.getExecOutput).toHaveBeenCalledWith(
        'git',
        ['checkout', 'package.json'],
        { cwd: workdir }
      )
    })
  })
})
