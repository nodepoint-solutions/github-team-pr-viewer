import { Octokit } from '@octokit/core'
import { paginateRest } from '@octokit/plugin-paginate-rest'
import { retry } from '@octokit/plugin-retry'
import { throttling } from '@octokit/plugin-throttling'

const MAX_RATE_LIMIT_RETRIES = 2
const MAX_ETAG_ENTRIES = 5000

const GitHub = Octokit.plugin(throttling, retry, paginateRest)

// url -> last 200 response. A 304 reply does not count against the primary rate limit,
// so unchanged data costs nothing. Insertion order doubles as LRU order.
const etagCache = new Map()

// Shared across all requests, so that one rate-limited response holds back every queued request
// and GitHub's penalty window can expire.
let pausedUntil = 0

const clients = new Map()

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function resetGithubClient() {
  etagCache.clear()
  clients.clear()
  pausedUntil = 0
}

function remember(url, response) {
  etagCache.delete(url)
  etagCache.set(url, response)
  if (etagCache.size > MAX_ETAG_ENTRIES) etagCache.delete(etagCache.keys().next().value)
}

function onLimit(kind) {
  return (retryAfter, options, octokit, retryCount) => {
    pausedUntil = Math.max(pausedUntil, Date.now() + retryAfter * 1000)
    console.warn(`GitHub ${kind} on ${options.method} ${options.url} — pausing for ${retryAfter}s (attempt ${retryCount + 1}/${MAX_RATE_LIMIT_RETRIES})`)
    return retryCount < MAX_RATE_LIMIT_RETRIES
  }
}

function client(token) {
  if (clients.has(token)) return clients.get(token)

  const octokit = new GitHub({
    auth: token,
    userAgent: 'github-team-pr-viewer',
    // The gate sits at the fetch call, inside the throttling queue, so that it also holds requests
    // that were queued before the limit was hit
    request: {
      fetch: async (url, init) => {
        const wait = pausedUntil - Date.now()
        if (wait > 0) await sleep(wait)
        return globalThis.fetch(url, init)
      },
    },
    throttle: { onRateLimit: onLimit('rate limit'), onSecondaryRateLimit: onLimit('secondary rate limit') },
    // The throttling plugin owns 429s, so that a rate limit is retried once rather than by both plugins
    retry: { doNotRetry: [400, 401, 403, 404, 410, 422, 429, 451] },
  })

  octokit.hook.wrap('request', async (request, options) => {
    options.headers = { ...options.headers, 'x-github-api-version': '2022-11-28' }
    const { url } = octokit.request.endpoint(options)
    // Read before the request, so that a 304 always has the body it was validated against
    const cached = options.method === 'GET' ? etagCache.get(url) : undefined
    if (cached) options.headers['if-none-match'] = cached.headers.etag

    try {
      const response = await request(options)
      if (options.method === 'GET' && response.headers.etag) remember(url, response)
      return response
    } catch (err) {
      if (err.status === 304 && cached) {
        remember(url, cached)
        return cached
      }
      throw err
    }
  })

  clients.set(token, octokit)
  return octokit
}

export async function fetchAllPages(path, token) {
  return client(token).paginate(`GET ${path}`)
}

export async function fetchFile(path, token) {
  try {
    const { data } = await client(token).request(`GET ${path}`)
    return Buffer.from(data.content, 'base64').toString('utf-8')
  } catch (err) {
    if (err.status === 404) return null
    throw err
  }
}

export async function fetchWithRetry(path, token) {
  const { data } = await client(token).request(`GET ${path}`)
  return data
}

export function aggregateCheckStatus(checkRuns) {
  if (!checkRuns.length) return 'unknown'
  const conclusions = checkRuns.map((r) => r.conclusion)
  const statuses = checkRuns.map((r) => r.status)
  if (conclusions.some((c) => c === 'failure' || c === 'cancelled' || c === 'timed_out')) return 'failing'
  if (statuses.some((s) => s === 'in_progress' || s === 'queued' || s === 'pending')) return 'pending'
  if (conclusions.every((c) => c === 'success' || c === 'skipped' || c === 'neutral')) return 'passing'
  return 'unknown'
}

export async function fetchCheckRuns(org, repo, sha, token) {
  const data = await fetchWithRetry(
    `/repos/${org}/${repo}/commits/${sha}/check-runs?per_page=100`,
    token
  ).catch(() => null)
  return aggregateCheckStatus(data?.check_runs ?? [])
}
