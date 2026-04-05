/**
 * Mock for `@actions/exec` used in unit tests.
 */
import { jest } from '@jest/globals'

export const exec = jest.fn()
export const getExecOutput = jest.fn()
