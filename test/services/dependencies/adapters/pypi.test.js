import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { manifestFile, extractVersion, fetchLatestVersion } from '../../../../src/services/dependencies/adapters/pypi.js'

describe('pypi adapter', () => {
  describe('manifestFile', () => {
    it('is requirements.txt', () => { expect(manifestFile).toBe('requirements.txt') })
  })

  describe('extractVersion', () => {
    it('extracts version from exact pin (==)', () => {
      expect(extractVersion('requests==2.28.0\nnumpy==1.24.0\n', 'requests')).toBe('2.28.0')
    })
    it('extracts version from >= constraint', () => {
      expect(extractVersion('requests>=2.28.0\n', 'requests')).toBe('2.28.0')
    })
    it('is case-insensitive for package name', () => {
      expect(extractVersion('Requests==2.28.0\n', 'requests')).toBe('2.28.0')
    })
    it('ignores comment lines', () => {
      expect(extractVersion('# requests==1.0.0\nrequests==2.28.0\n', 'requests')).toBe('2.28.0')
    })
    it('ignores inline comments', () => {
      expect(extractVersion('requests==2.28.0 # keep pinned\n', 'requests')).toBe('2.28.0')
    })
    it('returns null when package is absent', () => {
      expect(extractVersion('numpy==1.24.0\n', 'requests')).toBeNull()
    })
    it('returns null for empty content', () => {
      expect(extractVersion('', 'requests')).toBeNull()
    })
    it('handles package names with dots (e.g. zope.interface)', () => {
      expect(extractVersion('zope.interface==5.4.0\n', 'zope.interface')).toBe('5.4.0')
    })
  })

  describe('fetchLatestVersion', () => {
    let mockFetch
    beforeEach(() => { mockFetch = jest.fn(); global.fetch = mockFetch })
    afterEach(() => { delete global.fetch })

    it('returns the latest version from PyPI', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ info: { version: '2.31.0' } }) })
      const result = await fetchLatestVersion('requests')
      expect(result).toBe('2.31.0')
      expect(mockFetch).toHaveBeenCalledWith('https://pypi.org/pypi/requests/json')
    })
    it('throws when PyPI returns a non-ok status', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
      await expect(fetchLatestVersion('nonexistent')).rejects.toThrow('PyPI registry error 404')
    })
  })
})
