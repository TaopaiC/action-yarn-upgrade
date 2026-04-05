/**
 * Mock for `@actions/github` used in unit tests.
 */
import { jest } from '@jest/globals'

export const context = {
  repo: {
    owner: 'test-owner',
    repo: 'test-repo'
  }
}

export const getOctokit = jest.fn()
