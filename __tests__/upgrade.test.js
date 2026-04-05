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
  })
})
