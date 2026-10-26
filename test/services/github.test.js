import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { fetchAllPages, fetchWithRetry, fetchFile, aggregateCheckStatus, fetchCheckRuns, resetGithubClient } from '../../src/services/github.js'

const TOKEN = 'test-token'

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(status === 304 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

const sentHeader = (call, name) => call[1].headers[name]

describe('github client', () => {
  let mockFetch

  beforeEach(() => {
    resetGithubClient()
    mockFetch = jest.fn()
    global.fetch = mockFetch
  })

  afterEach(() => {
    delete global.fetch
  })

  describe('fetchAllPages', () => {
    it('reuses every cached page, including its next link, when GitHub replies 304', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse([{ id: 1 }], { headers: { etag: '"p1"', link: '<https://api.github.com/test?page=2>; rel="next"' } }))
        .mockResolvedValueOnce(jsonResponse([{ id: 2 }], { headers: { etag: '"p2"' } }))
        .mockResolvedValueOnce(jsonResponse(null, { status: 304 }))
        .mockResolvedValueOnce(jsonResponse(null, { status: 304 }))
      await fetchAllPages('/test', TOKEN)

      const result = await fetchAllPages('/test', TOKEN)
      expect(result).toEqual([{ id: 1 }, { id: 2 }])
      expect(sentHeader(mockFetch.mock.calls[2], 'if-none-match')).toBe('"p1"')
      expect(mockFetch.mock.calls[3][0]).toBe('https://api.github.com/test?page=2')
      expect(sentHeader(mockFetch.mock.calls[3], 'if-none-match')).toBe('"p2"')
    })

    it('does not retry a permission 403', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ message: 'Resource not accessible by integration' }, { status: 403 }))
      await expect(fetchAllPages('/repos/org/repo/dependabot/alerts', TOKEN)).rejects.toMatchObject({ status: 403 })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('rate limits', () => {
    beforeEach(() => {
      jest.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      console.warn.mockRestore()
    })

    it('retries after a short secondary rate limit', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ message: 'secondary rate limit' }, { status: 429, headers: { 'retry-after': '1' } }))
        .mockResolvedValueOnce(jsonResponse({ id: 1 }))
      await expect(fetchWithRetry('/test', TOKEN)).resolves.toEqual({ id: 1 })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('fails at once, and blocks later requests, when the limit resets after the maximum wait', async () => {
      const reset = Math.floor(Date.now() / 1000) + 3600
      mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'API rate limit exceeded' }, {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) },
      }))
      await expect(fetchWithRetry('/test', TOKEN)).rejects.toMatchObject({ status: 403 })
      await expect(fetchWithRetry('/other', TOKEN)).rejects.toThrow('requests blocked until')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('sends no request queued behind a limit that resets after the maximum wait', async () => {
      const reset = Math.floor(Date.now() / 1000) + 3600
      mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'API rate limit exceeded' }, {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) },
      }))
      mockFetch.mockImplementation(async () => jsonResponse({ id: 1 }))
      const paths = Array.from({ length: 30 }, (_, i) => `/test/${i}`)
      const results = await Promise.allSettled(paths.map((path) => fetchWithRetry(path, TOKEN)))

      const sent = mockFetch.mock.calls.length
      const blocked = results.filter((r) => r.status === 'rejected' && r.reason.message.includes('requests blocked until'))
      expect(sent + blocked.length).toBe(30)
      expect(sent).toBeLessThanOrEqual(10)
    })
  })

  describe('fetchWithRetry', () => {
    it('sends no if-none-match on the first request', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1 }, { headers: { etag: '"v1"' } }))
      await fetchWithRetry('/test', TOKEN)
      expect(sentHeader(mockFetch.mock.calls[0], 'if-none-match')).toBeUndefined()
      expect(sentHeader(mockFetch.mock.calls[0], 'x-github-api-version')).toBe('2022-11-28')
    })

    it('sends the stored etag and returns the cached body on 304', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ id: 1 }, { headers: { etag: '"v1"' } }))
        .mockResolvedValueOnce(jsonResponse(null, { status: 304 }))
      await fetchWithRetry('/test', TOKEN)

      const result = await fetchWithRetry('/test', TOKEN)
      expect(result).toEqual({ id: 1 })
      expect(sentHeader(mockFetch.mock.calls[1], 'if-none-match')).toBe('"v1"')
    })

    it('replaces the cached body when GitHub returns new data', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ id: 1 }, { headers: { etag: '"v1"' } }))
        .mockResolvedValueOnce(jsonResponse({ id: 2 }, { headers: { etag: '"v2"' } }))
        .mockResolvedValueOnce(jsonResponse(null, { status: 304 }))
      await fetchWithRetry('/test', TOKEN)
      expect(await fetchWithRetry('/test', TOKEN)).toEqual({ id: 2 })

      expect(await fetchWithRetry('/test', TOKEN)).toEqual({ id: 2 })
      expect(sentHeader(mockFetch.mock.calls[2], 'if-none-match')).toBe('"v2"')
    })

    it('keeps etags separate per query string', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ state: 'open' }, { headers: { etag: '"open"' } }))
        .mockResolvedValueOnce(jsonResponse({ state: 'closed' }))
      await fetchWithRetry('/test?state=open', TOKEN)
      await fetchWithRetry('/test?state=closed', TOKEN)
      expect(sentHeader(mockFetch.mock.calls[1], 'if-none-match')).toBeUndefined()
    })
  })

  describe('fetchFile', () => {
    it('returns decoded file content when the file exists', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ content: Buffer.from('hello world').toString('base64') }))
      const result = await fetchFile('/repos/org/repo/contents/package.json', TOKEN)
      expect(result).toBe('hello world')
    })

    it('returns null when the file does not exist (404)', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'Not Found' }, { status: 404 }))
      const result = await fetchFile('/repos/org/repo/contents/package.json', TOKEN)
      expect(result).toBeNull()
    })

    it('throws on non-404 error responses', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ message: 'Bad credentials' }, { status: 401 }))
      await expect(fetchFile('/repos/org/repo/contents/package.json', TOKEN)).rejects.toMatchObject({ status: 401 })
    })
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
    resetGithubClient()
    mockFetch = jest.fn()
    global.fetch = mockFetch
  })

  afterEach(() => {
    delete global.fetch
  })

  it('returns passing when all checks succeed', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      check_runs: [
        { status: 'completed', conclusion: 'success' },
        { status: 'completed', conclusion: 'skipped' },
      ],
    }))
    const result = await fetchCheckRuns('org', 'repo', 'sha123', 'TOKEN')
    expect(result).toBe('passing')
  })

  it('returns failing when any check has failure conclusion', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      check_runs: [
        { status: 'completed', conclusion: 'success' },
        { status: 'completed', conclusion: 'failure' },
      ],
    }))
    const result = await fetchCheckRuns('org', 'repo', 'sha123', 'TOKEN')
    expect(result).toBe('failing')
  })

  it('returns pending when a check is in_progress', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      check_runs: [{ status: 'in_progress', conclusion: null }],
    }))
    const result = await fetchCheckRuns('org', 'repo', 'sha123', 'TOKEN')
    expect(result).toBe('pending')
  })

  it('returns unknown when there are no check runs', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ check_runs: [] }))
    const result = await fetchCheckRuns('org', 'repo', 'sha123', 'TOKEN')
    expect(result).toBe('unknown')
  })

  it('returns unknown on fetch error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'))
    const result = await fetchCheckRuns('org', 'repo', 'sha123', 'TOKEN')
    expect(result).toBe('unknown')
  })
})
