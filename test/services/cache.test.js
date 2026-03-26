import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'

// Use dynamic import so we can re-import a fresh module per test block
async function freshCache() {
  return import('../../src/services/cache.js?v=' + Date.now())
}

describe('cache', () => {
  describe('get/set/isExpired', () => {
    it('returns null before anything is stored', async () => {
      const cache = await freshCache()
      expect(cache.get()).toBeNull()
    })

    it('returns stored data after set()', async () => {
      const cache = await freshCache()
      const data = { fetchedAt: new Date(), prs: [] }
      cache.set(data)
      expect(cache.get()).toBe(data)
    })

    it('isExpired() returns true when no data stored', async () => {
      const cache = await freshCache()
      expect(cache.isExpired(60_000)).toBe(true)
    })

    it('isExpired() returns false when data is fresh', async () => {
      const cache = await freshCache()
      cache.set({ fetchedAt: new Date(), prs: [] })
      expect(cache.isExpired(60_000)).toBe(false)
    })

    it('isExpired() returns true when data is older than TTL', async () => {
      const cache = await freshCache()
      const old = new Date(Date.now() - 70_000)
      cache.set({ fetchedAt: old, prs: [] })
      expect(cache.isExpired(60_000)).toBe(true)
    })
  })

  describe('isCooldown', () => {
    it('returns false when no data stored', async () => {
      const cache = await freshCache()
      expect(cache.isCooldown()).toBe(false)
    })

    it('returns true when data was fetched less than 30s ago', async () => {
      const cache = await freshCache()
      cache.set({ fetchedAt: new Date(), prs: [] })
      expect(cache.isCooldown()).toBe(true)
    })

    it('returns false when data was fetched more than 30s ago', async () => {
      const cache = await freshCache()
      const old = new Date(Date.now() - 31_000)
      cache.set({ fetchedAt: old, prs: [] })
      expect(cache.isCooldown()).toBe(false)
    })
  })

  describe('clear', () => {
    it('removes stored data', async () => {
      const cache = await freshCache()
      cache.set({ fetchedAt: new Date(), prs: [] })
      cache.clear()
      expect(cache.get()).toBeNull()
    })
  })
})
