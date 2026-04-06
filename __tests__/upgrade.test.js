import { jest } from '@jest/globals'
import * as execFixture from '../__fixtures__/exec.js'

jest.unstable_mockModule('@actions/exec', () => execFixture)

const readFileMock = jest.fn().mockRejectedValue(new Error('ENOENT'))
jest.unstable_mockModule('node:fs/promises', () => ({ readFile: readFileMock }))

const {
  getCurrentVersions,
  extractMajorVersions,
  getInstalledMajorVersions,
  upgradeModule
} = await import('../src/upgrade.js')

/** Helper: build Yarn Berry–style info JSON */
const yarnInfoJson = (version) =>
  JSON.stringify({ data: { children: { Version: version } } })

describe('upgrade.js', () => {
  afterEach(() => jest.resetAllMocks())

  describe('getCurrentVersions()', () => {
    it('parses Yarn Berry info JSON', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: yarnInfoJson('4.17.21'),
        stderr: '',
        exitCode: 0
      })
      expect(await getCurrentVersions('lodash')).toEqual(['4.17.21'])
    })

    it('returns empty array on invalid JSON', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: 'bad',
        stderr: '',
        exitCode: 1
      })
      expect(await getCurrentVersions('lodash')).toEqual([])
    })

    it('falls back to info.version for yarn v1 format', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: JSON.stringify({ version: '2.0.0' }),
        stderr: '',
        exitCode: 0
      })
      expect(await getCurrentVersions('some-pkg')).toEqual(['2.0.0'])
    })

    it('falls back to info.data.version when children.Version is absent', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: JSON.stringify({ data: { version: '3.1.0' } }),
        stderr: '',
        exitCode: 0
      })
      expect(await getCurrentVersions('some-pkg')).toEqual(['3.1.0'])
    })

    it('returns empty array when info has no recognized version field', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: JSON.stringify({ name: 'some-pkg' }),
        stderr: '',
        exitCode: 0
      })
      expect(await getCurrentVersions('some-pkg')).toEqual([])
    })

    it('parses Yarn Berry recursive format with children.Version (no data wrapper)', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: JSON.stringify({ children: { Version: '5.0.1' } }),
        stderr: '',
        exitCode: 0
      })
      expect(await getCurrentVersions('some-pkg')).toEqual(['5.0.1'])
    })

    it('returns all versions from NDJSON output with multiple lines', async () => {
      const lines = [
        JSON.stringify({ children: { Version: '8.0.4' } }),
        JSON.stringify({ children: { Version: '9.0.1' } })
      ].join('\n')
      execFixture.getExecOutput.mockResolvedValue({
        stdout: lines,
        stderr: '',
        exitCode: 0
      })
      expect(await getCurrentVersions('minimatch')).toEqual(['8.0.4', '9.0.1'])
    })

    it('skips unparsable lines and returns version from valid line', async () => {
      const lines = ['not-json', JSON.stringify({ version: '3.0.0' })].join(
        '\n'
      )
      execFixture.getExecOutput.mockResolvedValue({
        stdout: lines,
        stderr: '',
        exitCode: 0
      })
      expect(await getCurrentVersions('some-pkg')).toEqual(['3.0.0'])
    })
  })

  describe('extractMajorVersions()', () => {
    it('returns empty array for empty content', () => {
      expect(extractMajorVersions('', 'minimatch')).toEqual([])
    })

    it('returns empty array for null/undefined content', () => {
      expect(extractMajorVersions(null, 'minimatch')).toEqual([])
      expect(extractMajorVersions(undefined, 'minimatch')).toEqual([])
    })

    it('parses a single major version from Yarn v1 lockfile', () => {
      const content = `
minimatch@^9.0.0:
  version "9.0.4"
  resolved "https://registry.npmjs.org/..."
`
      expect(extractMajorVersions(content, 'minimatch')).toEqual(['9'])
    })

    it('parses multiple major versions from Yarn v1 lockfile', () => {
      const content = `
minimatch@^8.0.0:
  version "8.0.4"
  resolved "https://registry.npmjs.org/..."

minimatch@^9.0.0, minimatch@^9.0.1:
  version "9.0.4"
  resolved "https://registry.npmjs.org/..."
`
      expect(extractMajorVersions(content, 'minimatch')).toEqual(['8', '9'])
    })

    it('parses multiple major versions from Yarn Berry lockfile', () => {
      const content = `
"minimatch@npm:^8.0.0":
  version: 8.0.4
  resolution: "minimatch@npm:8.0.4"

"minimatch@npm:^9.0.0, minimatch@npm:^9.0.1":
  version: 9.0.4
  resolution: "minimatch@npm:9.0.4"
`
      expect(extractMajorVersions(content, 'minimatch')).toEqual(['8', '9'])
    })

    it('deduplicates when the same major appears in multiple entries', () => {
      const content = `
minimatch@^9.0.0:
  version "9.0.0"

minimatch@^9.0.1:
  version "9.0.4"
`
      expect(extractMajorVersions(content, 'minimatch')).toEqual(['9'])
    })

    it('does not match other packages with similar prefix', () => {
      const content = `
minimatch-extra@^1.0.0:
  version "1.0.0"

minimatch@^9.0.0:
  version "9.0.4"
`
      expect(extractMajorVersions(content, 'minimatch')).toEqual(['9'])
    })

    it('returns empty array when module is not present in lockfile', () => {
      const content = `
lodash@^4.17.0:
  version "4.17.21"
`
      expect(extractMajorVersions(content, 'minimatch')).toEqual([])
    })

    it('handles module names with special regex characters', () => {
      const content = `
"@scope/pkg@npm:^2.0.0":
  version: 2.1.0
`
      expect(extractMajorVersions(content, '@scope/pkg')).toEqual(['2'])
    })
  })

  describe('getInstalledMajorVersions()', () => {
    afterEach(() => readFileMock.mockRejectedValue(new Error('ENOENT')))

    it('returns parsed major versions from yarn.lock', async () => {
      readFileMock.mockResolvedValue(`
minimatch@^8.0.0:
  version "8.0.4"

minimatch@^9.0.0:
  version "9.0.4"
`)
      expect(await getInstalledMajorVersions('minimatch')).toEqual(['8', '9'])
    })

    it('reads from workdir when provided', async () => {
      readFileMock.mockResolvedValue(`
minimatch@^9.0.0:
  version "9.0.4"
`)
      await getInstalledMajorVersions('minimatch', '/custom/dir')
      expect(readFileMock).toHaveBeenCalledWith('/custom/dir/yarn.lock', 'utf8')
    })

    it('reads from bare yarn.lock when workdir is empty', async () => {
      readFileMock.mockResolvedValue('')
      await getInstalledMajorVersions('minimatch')
      expect(readFileMock).toHaveBeenCalledWith('yarn.lock', 'utf8')
    })

    it('returns empty array when yarn.lock cannot be read', async () => {
      readFileMock.mockRejectedValue(new Error('ENOENT'))
      expect(await getInstalledMajorVersions('minimatch')).toEqual([])
    })
  })

  describe('upgradeModule()', () => {
    it('returns upgraded when yarn.lock changed', async () => {
      // Calls in order: yarn info (from), yarn add, yarn dedupe, git checkout, yarn install, git diff, git add yarn.lock, yarn info (to)
      execFixture.getExecOutput
        .mockResolvedValueOnce({
          stdout: yarnInfoJson('4.17.20'),
          stderr: '',
          exitCode: 0
        }) // getCurrentVersion (from)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // yarn add
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // yarn dedupe
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git checkout package.json
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // yarn install
        .mockResolvedValueOnce({
          stdout: 'yarn.lock\n',
          stderr: '',
          exitCode: 0
        }) // git diff (changed)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git add yarn.lock (stageYarnLock)
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
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // yarn install
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
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // yarn install
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
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // yarn install
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git diff (no change)

      await upgradeModule('some-pkg', workdir)

      expect(execFixture.getExecOutput).toHaveBeenCalledWith(
        'yarn',
        ['info', 'some-pkg', '--json', '--recursive'],
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
      expect(execFixture.getExecOutput).toHaveBeenCalledWith(
        'yarn',
        undefined,
        { env: { ...process.env, CI: 'false' }, cwd: workdir }
      )
    })

    it('runs yarn add once per installed major version when multiple exist', async () => {
      readFileMock.mockResolvedValue(`
minimatch@^8.0.0:
  version "8.0.4"

minimatch@^9.0.0:
  version "9.0.1"
`)
      execFixture.getExecOutput
        .mockResolvedValueOnce({
          stdout: yarnInfoJson('9.0.1'),
          stderr: '',
          exitCode: 0
        }) // getCurrentVersion (from)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // yarn add minimatch@^8
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // yarn dedupe (1st loop)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git checkout package.json (1st loop)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // yarn install (1st loop)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // yarn add minimatch@^9
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // yarn dedupe (2nd loop)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git checkout package.json (2nd loop)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // yarn install (2nd loop)
        .mockResolvedValueOnce({
          stdout: 'yarn.lock\n',
          stderr: '',
          exitCode: 0
        }) // git diff (changed)
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // git add yarn.lock (stageYarnLock)
        .mockResolvedValueOnce({
          stdout: yarnInfoJson('9.0.3'),
          stderr: '',
          exitCode: 0
        }) // getCurrentVersion (to)

      const result = await upgradeModule('minimatch')
      expect(result).toEqual({
        moduleName: 'minimatch',
        status: 'upgraded',
        fromVersion: '9.0.1',
        toVersion: '9.0.3'
      })
      expect(execFixture.getExecOutput).toHaveBeenCalledWith('yarn', [
        'add',
        'minimatch@^8'
      ])
      expect(execFixture.getExecOutput).toHaveBeenCalledWith('yarn', [
        'add',
        'minimatch@^9'
      ])
    })
  })
})
