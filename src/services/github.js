const BASE_URL = 'https://api.github.com'

const HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
})

export function getNextPage(linkHeader) {
  if (!linkHeader) return null
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
  return match ? match[1] : null
}

export async function fetchAllPages(path, token, retries = 3, initialDelay = 1000) {
  const results = []
  let url = `${BASE_URL}${path}`

  while (url) {
    let res
    for (let attempt = 0; attempt <= retries; attempt++) {
      res = await fetch(url, { headers: HEADERS(token) })

      if (res.status === 429 || res.status === 403) {
        const body = await res.json().catch(() => ({}))
        const resetAt = res.headers.get('x-ratelimit-reset')
        const retryAfter = res.headers.get('retry-after')
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : resetAt
            ? Math.max(0, parseInt(resetAt, 10) * 1000 - Date.now()) + 1000
            : initialDelay * Math.pow(2, attempt)

        if (attempt === retries) {
          throw new Error(`GitHub API ${res.status} on ${path}: ${body.message ?? 'rate limited'}`)
        }
        console.warn(`GitHub API ${res.status} on ${path} — retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${retries}): ${body.message ?? ''}`)
        await sleep(delay)
        continue
      }

      break
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(`GitHub API error ${res.status} on ${path}: ${body.message ?? res.statusText}`)
    }

    const data = await res.json()
    results.push(...data)
    url = getNextPage(res.headers.get('link'))
  }

  return results
}

export async function fetchFile(path, token) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: HEADERS(token) })
  if (res.status === 404) return null
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`GitHub API error ${res.status} on ${path}: ${body.message ?? res.statusText}`)
  }
  const data = await res.json()
  return Buffer.from(data.content, 'base64').toString('utf-8')
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function fetchWithRetry(path, token, retries = 3, initialDelay = 1000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${BASE_URL}${path}`, { headers: HEADERS(token) })

    if (res.status === 429 || res.status === 403) {
      if (attempt === retries) throw new Error(`Rate limited after ${retries} retries: ${path}`)
      await sleep(initialDelay * Math.pow(2, attempt))
      continue
    }

    if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${path}`)
    return res.json()
  }
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
