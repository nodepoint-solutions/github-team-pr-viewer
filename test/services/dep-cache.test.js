import { describe, it, expect, beforeEach } from '@jest/globals'
import * as depCache from '../../src/services/dep-cache.js'

describe('dep-cache', () => {
  beforeEach(() => {
    depCache.clear()
  })

  it('returns null for an unknown key', () => {
    expect(depCache.get('missing')).toBeNull()
  })

  it('stores and retrieves a value', () => {
    depCache.set('key', '1.2.3')
    expect(depCache.get('key')).toBe('1.2.3')
  })

  it('stores null values', () => {
    depCache.set('key', null)
    expect(depCache.get('key')).toBeNull()
  })

  it('marks an unknown key as expired', () => {
    expect(depCache.isExpired('missing', 60000)).toBe(true)
  })

  it('marks a recently set key as not expired', () => {
    depCache.set('key', 'value')
    expect(depCache.isExpired('key', 60000)).toBe(false)
  })

  it('marks a key as expired when ttl has elapsed', async () => {
    depCache.set('key', 'value')
    // Simulate TTL of 0 — already expired
    expect(depCache.isExpired('key', 0)).toBe(true)
  })

  it('clears all entries', () => {
    depCache.set('a', '1')
    depCache.set('b', '2')
    depCache.clear()
    expect(depCache.get('a')).toBeNull()
    expect(depCache.get('b')).toBeNull()
  })
})
