import { jest } from '@jest/globals'
import * as execFixture from '../__fixtures__/exec.js'

jest.unstable_mockModule('@actions/exec', () => execFixture)

const { parseAuditOutput, runAudit } = await import('../src/audit.js')

describe('audit.js', () => {
  afterEach(() => jest.resetAllMocks())

  describe('parseAuditOutput()', () => {
    it('returns empty array for empty string', () => {
      expect(parseAuditOutput('')).toEqual([])
    })

    it('returns empty array for invalid JSON', () => {
      expect(parseAuditOutput('not-json')).toEqual([])
    })

    it('returns empty array when no advisories key', () => {
      expect(parseAuditOutput(JSON.stringify({}))).toEqual([])
    })

    it('parses advisories correctly', () => {
      const raw = JSON.stringify({
        advisories: {
          1: { module_name: 'lodash', cves: ['CVE-2021-23337'] },
          2: { module_name: 'axios', cves: ['CVE-2021-3749'] }
        }
      })
      const result = parseAuditOutput(raw)
      expect(result).toHaveLength(2)
      expect(result).toEqual(
        expect.arrayContaining([
          { moduleName: 'lodash', cves: ['CVE-2021-23337'] },
          { moduleName: 'axios', cves: ['CVE-2021-3749'] }
        ])
      )
    })

    it('deduplicates modules and merges CVEs', () => {
      const raw = JSON.stringify({
        advisories: {
          1: { module_name: 'lodash', cves: ['CVE-A'] },
          2: { module_name: 'lodash', cves: ['CVE-B'] }
        }
      })
      const result = parseAuditOutput(raw)
      expect(result).toHaveLength(1)
      expect(result[0].moduleName).toBe('lodash')
      expect(result[0].cves).toEqual(expect.arrayContaining(['CVE-A', 'CVE-B']))
    })

    it('handles missing cves field gracefully', () => {
      const raw = JSON.stringify({
        advisories: { 1: { module_name: 'lodash' } }
      })
      const result = parseAuditOutput(raw)
      expect(result[0].cves).toEqual([])
    })
  })

  describe('runAudit()', () => {
    it('returns parsed entries on success', async () => {
      const output = JSON.stringify({
        advisories: { 1: { module_name: 'lodash', cves: ['CVE-2021-23337'] } }
      })
      execFixture.getExecOutput.mockResolvedValue({
        stdout: output,
        stderr: '',
        exitCode: 1
      })

      const result = await runAudit()
      expect(result).toEqual([
        { moduleName: 'lodash', cves: ['CVE-2021-23337'] }
      ])
    })

    it('returns empty array when no vulnerabilities', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: JSON.stringify({ advisories: {} }),
        stderr: '',
        exitCode: 0
      })
      expect(await runAudit()).toEqual([])
    })

    it('returns empty array when exec throws', async () => {
      execFixture.getExecOutput.mockRejectedValue(new Error('exec failed'))
      expect(await runAudit()).toEqual([])
    })
  })
})
