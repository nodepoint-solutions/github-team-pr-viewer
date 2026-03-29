import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { getNextPage, fetchAllPages, fetchWithRetry, fetchFile, aggregateCheckStatus, fetchCheckRuns } from '../../src/services/github.js'

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
      statusText: 'Not Found',
      json: async () => ({ message: 'Not Found' }),
      headers: { get: () => null },
    })
    await expect(fetchAllPages('/missing', TOKEN)).rejects.toThrow('GitHub API error 404')
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

describe('fetchFile', () => {
  let mockFetch

  beforeEach(() => {
    mockFetch = jest.fn()
    global.fetch = mockFetch
  })

  afterEach(() => {
    delete global.fetch
  })

  it('returns decoded file content when the file exists', async () => {
    const content = 'hello world'
    const encoded = Buffer.from(content).toString('base64')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ content: encoded }),
    })
    const result = await fetchFile('/repos/org/repo/contents/package.json', 'token')
    expect(result).toBe('hello world')
  })

  it('returns null when the file does not exist (404)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
    const result = await fetchFile('/repos/org/repo/contents/package.json', 'token')
    expect(result).toBeNull()
  })

  it('throws on non-404 error responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ message: 'Server error' }),
    })
    await expect(fetchFile('/repos/org/repo/contents/package.json', 'token')).rejects.toThrow('GitHub API error 500')
  })
})

describe('aggregateCheckStatus', () => {
  it('returns unknown for empty array', () => {
    expect(aggregateCheckStatus([])).toBe('unknown')
  })

  it('returns passing when all checks are success or skipped', () => {
    expect(aggregateCheckStatus([
      { status: 'completed', conclusion: 'success' },
      { status: 'completed', conclusion: 'skipped' },
    ])).toBe('passing')
  })

  it('returns passing when conclusion is neutral', () => {
    expect(aggregateCheckStatus([
      { status: 'completed', conclusion: 'neutral' },
    ])).toBe('passing')
  })

  it('returns failing when any check has failure conclusion', () => {
    expect(aggregateCheckStatus([
      { status: 'completed', conclusion: 'success' },
      { status: 'completed', conclusion: 'failure' },
    ])).toBe('failing')
  })

  it('returns failing for cancelled conclusion', () => {
    expect(aggregateCheckStatus([
      { status: 'completed', conclusion: 'cancelled' },
    ])).toBe('failing')
  })

  it('returns failing for timed_out conclusion', () => {
    expect(aggregateCheckStatus([
      { status: 'completed', conclusion: 'timed_out' },
    ])).toBe('failing')
  })

  it('returns pending when any check is in_progress', () => {
    expect(aggregateCheckStatus([
      { status: 'in_progress', conclusion: null },
    ])).toBe('pending')
  })

  it('returns pending when any check is queued (with no failures)', () => {
    expect(aggregateCheckStatus([
      { status: 'completed', conclusion: 'success' },
      { status: 'queued', conclusion: null },
    ])).toBe('pending')
  })

  it('failing takes precedence over pending', () => {
    expect(aggregateCheckStatus([
      { status: 'in_progress', conclusion: null },
      { status: 'completed', conclusion: 'failure' },
    ])).toBe('failing')
  })
})

describe('fetchCheckRuns', () => {
  let mockFetch

  beforeEach(() => {
    mockFetch = jest.fn()
    global.fetch = mockFetch
  })

  afterEach(() => {
    delete global.fetch
  })

  it('returns passing when all checks succeed', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        check_runs: [
          { status: 'completed', conclusion: 'success' },
          { status: 'completed', conclusion: 'skipped' },
        ],
      }),
    })
    const result = await fetchCheckRuns('org', 'repo', 'sha123', 'TOKEN')
    expect(result).toBe('passing')
  })

  it('returns failing when any check has failure conclusion', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        check_runs: [
          { status: 'completed', conclusion: 'success' },
          { status: 'completed', conclusion: 'failure' },
        ],
      }),
    })
    const result = await fetchCheckRuns('org', 'repo', 'sha123', 'TOKEN')
    expect(result).toBe('failing')
  })

  it('returns pending when a check is in_progress', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        check_runs: [{ status: 'in_progress', conclusion: null }],
      }),
    })
    const result = await fetchCheckRuns('org', 'repo', 'sha123', 'TOKEN')
    expect(result).toBe('pending')
  })

  it('returns unknown when there are no check runs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ check_runs: [] }),
    })
    const result = await fetchCheckRuns('org', 'repo', 'sha123', 'TOKEN')
    expect(result).toBe('unknown')
  })

  it('returns unknown on fetch error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'))
    const result = await fetchCheckRuns('org', 'repo', 'sha123', 'TOKEN')
    expect(result).toBe('unknown')
  })
})
