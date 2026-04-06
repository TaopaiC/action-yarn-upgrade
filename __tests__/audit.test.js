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

    it('skips advisories with no module_name', () => {
      const raw = JSON.stringify({
        advisories: {
          1: { cves: ['CVE-2021-0001'] },
          2: { module_name: 'lodash', cves: ['CVE-2021-23337'] }
        }
      })
      const result = parseAuditOutput(raw)
      expect(result).toHaveLength(1)
      expect(result[0].moduleName).toBe('lodash')
    })

    describe('NDJSON format (yarn npm audit --recursive --json)', () => {
      it('parses a single NDJSON line', () => {
        const raw = JSON.stringify({
          value: 'lodash',
          children: {
            ID: 1234,
            Issue: 'Prototype pollution',
            URL: 'https://github.com/advisories/GHSA-jf85-cpcp-j695',
            Severity: 'high',
            'Vulnerable Versions': '<4.17.21',
            'Tree Versions': ['4.17.20'],
            Dependents: ['myapp@workspace:.']
          }
        })
        const result = parseAuditOutput(raw)
        expect(result).toEqual([
          { moduleName: 'lodash', cves: ['GHSA-jf85-cpcp-j695'] }
        ])
      })

      it('deduplicates modules across multiple NDJSON lines', () => {
        const lines = [
          {
            value: 'lodash',
            children: {
              URL: 'https://github.com/advisories/GHSA-aaa1-bbbb-cccc-dddd'
            }
          },
          {
            value: 'lodash',
            children: {
              URL: 'https://github.com/advisories/GHSA-eeee-ffff-gggg-hhhh'
            }
          }
        ]
          .map((o) => JSON.stringify(o))
          .join('\n')

        const result = parseAuditOutput(lines)
        expect(result).toHaveLength(1)
        expect(result[0].moduleName).toBe('lodash')
        expect(result[0].cves).toEqual(
          expect.arrayContaining([
            'GHSA-aaa1-bbbb-cccc-dddd',
            'GHSA-eeee-ffff-gggg-hhhh'
          ])
        )
      })

      it('handles NDJSON entries with no URL gracefully', () => {
        const raw = JSON.stringify({ value: 'lodash', children: {} })
        const result = parseAuditOutput(raw)
        expect(result).toEqual([{ moduleName: 'lodash', cves: [] }])
      })

      it('skips NDJSON lines with no value field', () => {
        const lines = [
          JSON.stringify({
            children: {
              URL: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc-dddd'
            }
          }),
          JSON.stringify({
            value: 'axios',
            children: {
              URL: 'https://github.com/advisories/GHSA-1234-5678-abcd-efgh'
            }
          })
        ].join('\n')
        const result = parseAuditOutput(lines)
        expect(result).toHaveLength(1)
        expect(result[0].moduleName).toBe('axios')
      })

      it('skips invalid JSON lines in NDJSON output', () => {
        const lines = [
          'not-valid-json',
          JSON.stringify({
            value: 'axios',
            children: {
              URL: 'https://github.com/advisories/GHSA-1234-5678-abcd-efgh'
            }
          })
        ].join('\n')
        const result = parseAuditOutput(lines)
        expect(result).toHaveLength(1)
        expect(result[0].moduleName).toBe('axios')
      })

      // Integration test: reproduces the exact output from GitHub issue #13
      // where yarn npm audit reported vulnerabilities but the action logged
      // "No vulnerabilities found by audit".
      it('parses the real-world yarn audit output from issue #13', () => {
        const raw = [
          '{"value":"minimatch","children":{"ID":1113465,"Issue":"minimatch has a ReDoS via repeated wildcards with non-matching literal in pattern","URL":"https://github.com/advisories/GHSA-3ppc-4f35-3m26","Severity":"high","Vulnerable Versions":">=9.0.0 <9.0.6","Tree Versions":["9.0.0"],"Dependents":["test@workspace:."]}}',
          '{"value":"minimatch","children":{"ID":1113544,"Issue":"minimatch ReDoS: matchOne() combinatorial backtracking via multiple non-adjacent GLOBSTAR segments","URL":"https://github.com/advisories/GHSA-7r86-cg39-jmmj","Severity":"high","Vulnerable Versions":">=9.0.0 <9.0.7","Tree Versions":["9.0.0"],"Dependents":["test@workspace:."]}}',
          '{"value":"minimatch","children":{"ID":1113552,"Issue":"minimatch ReDoS: nested *() extglobs generate catastrophically backtracking regular expressions","URL":"https://github.com/advisories/GHSA-23c5-xmqv-rm74","Severity":"high","Vulnerable Versions":">=9.0.0 <9.0.7","Tree Versions":["9.0.0"],"Dependents":["test@workspace:."]}}'
        ].join('\n')

        const result = parseAuditOutput(raw)

        expect(result).toHaveLength(1)
        expect(result[0].moduleName).toBe('minimatch')
        expect(result[0].cves).toHaveLength(3)
        expect(result[0].cves).toEqual(
          expect.arrayContaining([
            'GHSA-3ppc-4f35-3m26',
            'GHSA-7r86-cg39-jmmj',
            'GHSA-23c5-xmqv-rm74'
          ])
        )
      })
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

    it('passes cwd option when workdir is specified', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: JSON.stringify({ advisories: {} }),
        stderr: '',
        exitCode: 0
      })
      await runAudit('/custom/dir')
      expect(execFixture.getExecOutput).toHaveBeenCalledWith(
        'yarn',
        ['npm', 'audit', '--recursive', '--json'],
        { ignoreReturnCode: true, cwd: '/custom/dir' }
      )
    })

    it('does not pass cwd option when workdir is empty', async () => {
      execFixture.getExecOutput.mockResolvedValue({
        stdout: JSON.stringify({ advisories: {} }),
        stderr: '',
        exitCode: 0
      })
      await runAudit('')
      expect(execFixture.getExecOutput).toHaveBeenCalledWith(
        'yarn',
        ['npm', 'audit', '--recursive', '--json'],
        { ignoreReturnCode: true }
      )
    })
  })
})
