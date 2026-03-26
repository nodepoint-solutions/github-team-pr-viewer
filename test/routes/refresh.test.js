import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'

jest.unstable_mockModule('../../src/services/prs.js', () => ({
  getPRs: jest.fn().mockReturnValue({ fetchedAt: new Date(), teamMembers: new Set(), prs: [] }),
  warmCache: jest.fn().mockResolvedValue({}),
  isBot: jest.fn(() => false),
  isMergeCommit: jest.fn(() => false),
  formatPR: jest.fn(),
  runWithConcurrency: jest.fn(),
}))

jest.unstable_mockModule('../../src/services/cache.js', () => ({
  get: jest.fn(() => null), set: jest.fn(), isExpired: jest.fn(() => true),
  isCooldown: jest.fn(() => false), clear: jest.fn(),
}))

jest.unstable_mockModule('../../src/config.js', () => ({
  config: { port: 3000, githubToken: 'test', cacheTtlMs: 300000, isDevelopment: false },
}))

const cache = await import('../../src/services/cache.js')
const { createServer } = await import('../../src/server.js')

describe('POST /refresh', () => {
  let server
  beforeEach(async () => {
    jest.clearAllMocks()
    server = await createServer()
  })
  afterEach(async () => { await server.stop() })

  it('triggers warmCache and redirects to referrer', async () => {
    cache.isCooldown.mockReturnValue(false)
    const res = await server.inject({ method: 'POST', url: '/refresh', headers: { referer: '/stale' } })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/stale')
  })

  it('redirects with cooldown=1 when on cooldown', async () => {
    cache.isCooldown.mockReturnValue(true)
    const res = await server.inject({ method: 'POST', url: '/refresh', headers: { referer: '/stale' } })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/stale?cooldown=1')
    expect(cache.clear).not.toHaveBeenCalled()
  })

  it('redirects to / when no referrer', async () => {
    cache.isCooldown.mockReturnValue(false)
    const res = await server.inject({ method: 'POST', url: '/refresh' })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/')
  })
})
