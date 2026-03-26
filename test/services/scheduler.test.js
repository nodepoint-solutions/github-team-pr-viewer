import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'

jest.unstable_mockModule('../../src/config.js', () => ({
  config: { port: 3000, githubToken: 'test', cacheTtlMs: 60000, isDevelopment: false },
}))

const mockWarmCache = jest.fn().mockResolvedValue({})
jest.unstable_mockModule('../../src/services/prs.js', () => ({
  warmCache: mockWarmCache,
  getPRs: jest.fn(),
}))

const { startScheduler } = await import('../../src/services/scheduler.js')

describe('startScheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockWarmCache.mockClear()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('warms cache immediately when skipInitial is false', async () => {
    const stop = startScheduler()
    await Promise.resolve()
    expect(mockWarmCache).toHaveBeenCalledTimes(1)
    stop()
  })

  it('skips initial warm when skipInitial is true', async () => {
    const stop = startScheduler({ skipInitial: true })
    await Promise.resolve()
    expect(mockWarmCache).toHaveBeenCalledTimes(0)
    stop()
  })

  it('warms cache again after interval', async () => {
    const stop = startScheduler({ skipInitial: true })
    jest.advanceTimersByTime(60000)
    await Promise.resolve()
    expect(mockWarmCache).toHaveBeenCalledTimes(1)
    stop()
  })

  it('returned function stops the interval', async () => {
    const stop = startScheduler({ skipInitial: true })
    stop()
    jest.advanceTimersByTime(60000)
    await Promise.resolve()
    expect(mockWarmCache).toHaveBeenCalledTimes(0)
  })
})
