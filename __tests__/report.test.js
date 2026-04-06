import { buildTitle, buildCommitMessage, buildSummary } from '../src/report.js'

describe('report.js', () => {
  describe('buildCommitMessage()', () => {
    it('returns null when no modules were upgraded', () => {
      const results = [
        { moduleName: 'lodash', status: 'unchanged' },
        { moduleName: 'axios', status: 'unchanged' }
      ]
      expect(buildCommitMessage(results, new Map(), 'CHORE')).toBeNull()
    })

    it('generates correct message for a single upgrade without CVEs', () => {
      const results = [
        {
          moduleName: 'lodash',
          status: 'upgraded',
          fromVersion: '4.17.20',
          toVersion: '4.17.21'
        }
      ]
      const msg = buildCommitMessage(results, new Map(), 'CHORE')
      expect(msg).toContain('CHORE: bump 1 module(s) (lodash) for CVE fixes')
      expect(msg).toContain('lodash: 4.17.20 → 4.17.21')
      expect(msg).not.toContain('may resolve')
    })

    it('uses the prPrefix in the commit message title', () => {
      const results = [
        {
          moduleName: 'lodash',
          status: 'upgraded',
          fromVersion: '4.17.20',
          toVersion: '4.17.21'
        }
      ]
      const msg = buildCommitMessage(results, new Map(), 'SECURITY')
      expect(msg).toContain('SECURITY: bump 1 module(s) (lodash) for CVE fixes')
    })

    it('includes CVE information from the audit map', () => {
      const results = [
        {
          moduleName: 'lodash',
          status: 'upgraded',
          fromVersion: '4.17.20',
          toVersion: '4.17.21'
        }
      ]
      const auditMap = new Map([['lodash', ['CVE-2021-23337']]])
      const msg = buildCommitMessage(results, auditMap, 'CHORE')
      expect(msg).toContain('may resolve CVE-2021-23337')
    })

    it('lists unchanged modules in a separate section', () => {
      const results = [
        {
          moduleName: 'lodash',
          status: 'upgraded',
          fromVersion: '4.17.20',
          toVersion: '4.17.21'
        },
        { moduleName: 'express', status: 'unchanged' }
      ]
      const msg = buildCommitMessage(results, new Map(), 'CHORE')
      expect(msg).toContain('Not upgraded (no change in yarn.lock):')
      expect(msg).toContain('- express')
    })

    it('lists errored modules in a separate section', () => {
      const results = [
        {
          moduleName: 'lodash',
          status: 'upgraded',
          fromVersion: '4.17.20',
          toVersion: '4.17.21'
        },
        { moduleName: 'broken', status: 'error', error: 'install failed' }
      ]
      const msg = buildCommitMessage(results, new Map(), 'CHORE')
      expect(msg).toContain('Failed (skipped):')
      expect(msg).toContain('- broken: install failed')
    })

    it('handles mixed results with multiple upgraded modules', () => {
      const results = [
        {
          moduleName: 'lodash',
          status: 'upgraded',
          fromVersion: '4.17.20',
          toVersion: '4.17.21'
        },
        {
          moduleName: 'axios',
          status: 'upgraded',
          fromVersion: '0.21.1',
          toVersion: '0.21.4'
        },
        { moduleName: 'express', status: 'unchanged' }
      ]
      const auditMap = new Map([
        ['lodash', ['CVE-2021-23337']],
        ['axios', ['CVE-2021-3749']]
      ])
      const msg = buildCommitMessage(results, auditMap, 'CHORE')
      expect(msg).toContain(
        'CHORE: bump 2 module(s) (lodash, axios) for CVE fixes'
      )
      expect(msg).toContain('lodash: 4.17.20 → 4.17.21')
      expect(msg).toContain('axios: 0.21.1 → 0.21.4')
      expect(msg).toContain('CVE-2021-23337')
      expect(msg).toContain('CVE-2021-3749')
    })
  })

  describe('buildTitle()', () => {
    it('returns null when no modules were upgraded', () => {
      const results = [{ moduleName: 'lodash', status: 'unchanged' }]
      expect(buildTitle(results, 'CHORE')).toBeNull()
    })

    it('generates title with count and module names', () => {
      const results = [
        {
          moduleName: 'lodash',
          status: 'upgraded',
          fromVersion: '4.17.20',
          toVersion: '4.17.21'
        }
      ]
      expect(buildTitle(results, 'CHORE')).toBe(
        'CHORE: bump 1 module(s) (lodash) for CVE fixes'
      )
    })

    it('uses the provided prPrefix', () => {
      const results = [
        {
          moduleName: 'lodash',
          status: 'upgraded',
          fromVersion: '4.17.20',
          toVersion: '4.17.21'
        }
      ]
      expect(buildTitle(results, 'SECURITY')).toBe(
        'SECURITY: bump 1 module(s) (lodash) for CVE fixes'
      )
    })

    it('includes all upgraded module names when multiple modules upgraded', () => {
      const results = [
        {
          moduleName: 'brace-expansion',
          status: 'upgraded',
          fromVersion: '1.1.10',
          toVersion: '1.1.11'
        },
        {
          moduleName: 'minimatch',
          status: 'upgraded',
          fromVersion: '3.1.1',
          toVersion: '3.1.2'
        },
        { moduleName: 'express', status: 'unchanged' }
      ]
      expect(buildTitle(results, 'CHORE')).toBe(
        'CHORE: bump 2 module(s) (brace-expansion, minimatch) for CVE fixes'
      )
    })
  })

  describe('buildSummary()', () => {
    it('counts correctly across all statuses', () => {
      const results = [
        {
          moduleName: 'lodash',
          status: 'upgraded',
          fromVersion: '4.17.20',
          toVersion: '4.17.21'
        },
        { moduleName: 'express', status: 'unchanged' },
        { moduleName: 'broken', status: 'error', error: 'fail' }
      ]
      const summary = buildSummary(results)
      expect(summary).toBe(
        'Processed 3 module(s): 1 upgraded, 1 unchanged, 1 failed.'
      )
    })

    it('handles empty results', () => {
      expect(buildSummary([])).toBe(
        'Processed 0 module(s): 0 upgraded, 0 unchanged, 0 failed.'
      )
    })
  })
})
