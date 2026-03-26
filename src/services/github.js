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

export async function fetchAllPages(path, token) {
  const results = []
  let url = `${BASE_URL}${path}`

  while (url) {
    const res = await fetch(url, { headers: HEADERS(token) })
    if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${path}`)
    const data = await res.json()
    results.push(...data)
    url = getNextPage(res.headers.get('link'))
  }

  return results
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
