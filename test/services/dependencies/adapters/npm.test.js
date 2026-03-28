import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { manifestFile, extractVersion, fetchLatestVersion } from '../../../../src/services/dependencies/adapters/npm.js'

describe('npm adapter', () => {
  describe('manifestFile', () => {
    it('is package.json', () => { expect(manifestFile).toBe('package.json') })
  })

  describe('extractVersion', () => {
    it('returns version from dependencies', () => {
      expect(extractVersion(JSON.stringify({ dependencies: { hapi: '^21.3.0' } }), 'hapi')).toBe('^21.3.0')
    })
    it('returns version from devDependencies', () => {
      expect(extractVersion(JSON.stringify({ devDependencies: { jest: '^29.0.0' } }), 'jest')).toBe('^29.0.0')
    })
    it('prefers dependencies over devDependencies', () => {
      expect(extractVersion(JSON.stringify({ dependencies: { pkg: '1.0.0' }, devDependencies: { pkg: '2.0.0' } }), 'pkg')).toBe('1.0.0')
    })
    it('returns null when package is absent', () => {
      expect(extractVersion(JSON.stringify({ dependencies: { other: '1.0.0' } }), 'missing')).toBeNull()
    })
    it('returns null for malformed JSON', () => {
      expect(extractVersion('not json', 'pkg')).toBeNull()
    })
    it('returns null when no dependencies key exists', () => {
      expect(extractVersion(JSON.stringify({ name: 'my-app' }), 'pkg')).toBeNull()
    })
  })

  describe('fetchLatestVersion', () => {
    let mockFetch
    beforeEach(() => { mockFetch = jest.fn(); global.fetch = mockFetch })
    afterEach(() => { delete global.fetch })

    it('returns the latest version from the npm registry', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ version: '5.3.0' }) })
      const result = await fetchLatestVersion('govuk-frontend')
      expect(result).toBe('5.3.0')
      expect(mockFetch).toHaveBeenCalledWith('https://registry.npmjs.org/govuk-frontend/latest')
    })
    it('throws when the registry returns a non-ok status', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
      await expect(fetchLatestVersion('nonexistent')).rejects.toThrow('npm registry error 404')
    })
  })
})
