import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { getNextPage, fetchAllPages, fetchWithRetry } from '../../src/services/github.js'

const TOKEN = 'test-token'

describe('getNextPage', () => {
  it('returns null when link header is absent', () => {
    expect(getNextPage(null)).toBeNull()
  })

  it('returns null when there is no next rel', () => {
    const header = '<https://api.github.com/items?page=1>; rel="prev"'
    expect(getNextPage(header)).toBeNull()
  })

  it('returns the next URL from a link header', () => {
    const header = '<https://api.github.com/items?page=2>; rel="next", <https://api.github.com/items?page=5>; rel="last"'
    expect(getNextPage(header)).toBe('https://api.github.com/items?page=2')
  })
})

describe('fetchAllPages', () => {
  let mockFetch

  beforeEach(() => {
    mockFetch = jest.fn()
    global.fetch = mockFetch
  })

  afterEach(() => {
    delete global.fetch
  })

  it('returns items from a single page response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 1 }, { id: 2 }],
      headers: { get: () => null },
    })
    const result = await fetchAllPages('/test', TOKEN)
    expect(result).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('follows pagination and concatenates results', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 1 }],
        headers: { get: () => '<https://api.github.com/test?page=2>; rel="next"' },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 2 }],
        headers: { get: () => null },
      })
    const result = await fetchAllPages('/test', TOKEN)
    expect(result).toEqual([{ id: 1 }, { id: 2 }])
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: { get: () => null },
    })
    await expect(fetchAllPages('/missing', TOKEN)).rejects.toThrow('GitHub API error: 404')
  })
})

describe('fetchWithRetry', () => {
  let mockFetch

  beforeEach(() => {
    mockFetch = jest.fn()
    global.fetch = mockFetch
  })

  afterEach(() => {
    delete global.fetch
  })

  it('returns JSON on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [{ id: 1 }],
    })
    const result = await fetchWithRetry('/test', TOKEN)
    expect(result).toEqual([{ id: 1 }])
  })

  it('retries on 429 and succeeds on second attempt', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [{ id: 1 }] })

    const result = await fetchWithRetry('/test', TOKEN, 3, 0)
    expect(result).toEqual([{ id: 1 }])
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('throws after max retries', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429 })
    await expect(fetchWithRetry('/test', TOKEN, 2, 0)).rejects.toThrow('Rate limited')
  })
})
