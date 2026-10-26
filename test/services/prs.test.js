import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// config.js throws at import time if GITHUB_TOKEN is absent — mock it first
jest.unstable_mockModule('../../src/config.js', () => ({
  config: { port: 3000, githubToken: 'test', cacheTtlMs: 300000, isDevelopment: false, jiraEnabled: true, jiraTicketPattern: 'DF-\\d+', org: 'test-org', team: 'test-team', requiredTeamRole: 'admin' },
}))

const mockFetchAllPages = jest.fn()
const mockFetchWithRetry = jest.fn()
jest.unstable_mockModule('../../src/services/github.js', () => ({
  fetchAllPages: mockFetchAllPages,
  fetchWithRetry: mockFetchWithRetry,
  fetchCheckRuns: jest.fn().mockResolvedValue('passing'),
}))

const cache = await import('../../src/services/cache.js')
const { isBot, isMergeCommit, formatPR, extractJiraTicket, warmPrCache } = await import('../../src/services/prs.js')

describe('isBot', () => {
  it('returns true for user.type === Bot', () => {
    expect(isBot({ type: 'Bot', login: 'dependabot' })).toBe(true)
  })

  it('returns true for login ending in [bot]', () => {
    expect(isBot({ type: 'User', login: 'renovate[bot]' })).toBe(true)
  })

  it('returns false for a normal user', () => {
    expect(isBot({ type: 'User', login: 'alice' })).toBe(false)
  })
})

describe('isMergeCommit', () => {
  it('returns true when commit has more than one parent', () => {
    expect(isMergeCommit({ parents: [{}, {}] })).toBe(true)
  })

  it('returns false when commit has one parent', () => {
    expect(isMergeCommit({ parents: [{}] })).toBe(false)
  })
})

describe('formatPR', () => {
  const baseRawPR = {
    number: 42,
    title: 'Fix the thing',
    html_url: 'https://github.com/DEFRA/forms-runner/pull/42',
    base: { repo: { name: 'forms-runner' } },
    user: { login: 'alice', type: 'User' },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    draft: false,
    additions: 120,
    deletions: 45,
  }

  it('maps basic fields correctly', () => {
    const pr = formatPR(baseRawPR, [], [])
    expect(pr.number).toBe(42)
    expect(pr.title).toBe('Fix the thing')
    expect(pr.repo).toBe('forms-runner')
    expect(pr.author).toBe('alice')
    expect(pr.draft).toBe(false)
  })

  it('excludes bot reviews', () => {
    const reviews = [
      { user: { login: 'alice', type: 'User' }, state: 'APPROVED', submitted_at: '2026-02-01T00:00:00Z' },
      { user: { login: 'dependabot', type: 'Bot' }, state: 'COMMENTED', submitted_at: '2026-02-02T00:00:00Z' },
    ]
    const pr = formatPR(baseRawPR, reviews, [])
    expect(pr.reviews).toHaveLength(1)
    expect(pr.reviews[0].user.login).toBe('alice')
  })

  it('excludes merge commits', () => {
    const commits = [
      { parents: [{}], commit: { committer: { date: '2026-02-01T00:00:00Z' } } },
      { parents: [{}, {}], commit: { committer: { date: '2026-02-02T00:00:00Z' } } },
    ]
    const pr = formatPR(baseRawPR, [], commits)
    expect(pr.commits).toHaveLength(1)
  })

  it('sets isReviewed true when non-bot reviews exist', () => {
    const reviews = [
      { user: { login: 'bob', type: 'User' }, state: 'APPROVED', submitted_at: '2026-02-01T00:00:00Z' },
    ]
    const pr = formatPR(baseRawPR, reviews, [])
    expect(pr.isReviewed).toBe(true)
  })

  it('sets latestReviewAt to max review timestamp', () => {
    const reviews = [
      { user: { login: 'alice', type: 'User' }, state: 'COMMENTED', submitted_at: '2026-02-01T00:00:00Z' },
      { user: { login: 'bob', type: 'User' }, state: 'APPROVED', submitted_at: '2026-02-10T00:00:00Z' },
    ]
    const pr = formatPR(baseRawPR, reviews, [])
    expect(pr.latestReviewAt).toEqual(new Date('2026-02-10T00:00:00Z'))
  })

  it('sets hasUnreviewedCommits true when commit is after latest review', () => {
    const reviews = [
      { user: { login: 'bob', type: 'User' }, state: 'APPROVED', submitted_at: '2026-02-10T00:00:00Z' },
    ]
    const commits = [
      { parents: [{}], commit: { committer: { date: '2026-02-15T00:00:00Z' } } },
    ]
    const pr = formatPR(baseRawPR, reviews, commits)
    expect(pr.hasUnreviewedCommits).toBe(true)
  })

  it('sets hasUnreviewedCommits false when all commits predate latest review', () => {
    const reviews = [
      { user: { login: 'bob', type: 'User' }, state: 'APPROVED', submitted_at: '2026-02-10T00:00:00Z' },
    ]
    const commits = [
      { parents: [{}], commit: { committer: { date: '2026-02-05T00:00:00Z' } } },
    ]
    const pr = formatPR(baseRawPR, reviews, commits)
    expect(pr.hasUnreviewedCommits).toBe(false)
  })

  it('computes reviewState CHANGES_REQUESTED when any reviewer requested changes', () => {
    const reviews = [
      { user: { login: 'alice', type: 'User' }, state: 'CHANGES_REQUESTED', submitted_at: '2026-02-01T00:00:00Z' },
      { user: { login: 'bob', type: 'User' }, state: 'APPROVED', submitted_at: '2026-02-02T00:00:00Z' },
    ]
    const pr = formatPR(baseRawPR, reviews, [])
    expect(pr.reviewState).toBe('CHANGES_REQUESTED')
  })

  it('computes reviewState APPROVED when all reviewers approved', () => {
    const reviews = [
      { user: { login: 'alice', type: 'User' }, state: 'APPROVED', submitted_at: '2026-02-01T00:00:00Z' },
      { user: { login: 'bob', type: 'User' }, state: 'APPROVED', submitted_at: '2026-02-02T00:00:00Z' },
    ]
    const pr = formatPR(baseRawPR, reviews, [])
    expect(pr.reviewState).toBe('APPROVED')
  })

  it('sets isStale true when updatedAt is more than 14 days ago', () => {
    const staleRawPR = {
      ...baseRawPR,
      updated_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    }
    const pr = formatPR(staleRawPR, [], [])
    expect(pr.isStale).toBe(true)
  })

  it('includes additions and deletions from the raw PR', () => {
    const pr = formatPR(baseRawPR, [], [])
    expect(pr.additions).toBe(120)
    expect(pr.deletions).toBe(45)
  })

  it('sets isStale false when updatedAt is recent', () => {
    const freshRawPR = {
      ...baseRawPR,
      updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    }
    const pr = formatPR(freshRawPR, [], [])
    expect(pr.isStale).toBe(false)
  })
})

describe('extractJiraTicket', () => {
  it('extracts DF- ticket from title', () => {
    expect(extractJiraTicket({ title: 'DF-123 fix the thing', body: null, head: { ref: 'main' } })).toBe('DF-123')
  })
  it('extracts from body when not in title', () => {
    expect(extractJiraTicket({ title: 'fix bug', body: 'relates to df-456', head: { ref: 'main' } })).toBe('DF-456')
  })
  it('extracts from branch name', () => {
    expect(extractJiraTicket({ title: 'fix', body: null, head: { ref: 'feature/df-789-thing' } })).toBe('DF-789')
  })
  it('returns null when no ticket found', () => {
    expect(extractJiraTicket({ title: 'no ticket here', body: null, head: { ref: 'main' } })).toBeNull()
  })
  it('handles missing body and head gracefully', () => {
    expect(extractJiraTicket({ title: 'DF-999 test' })).toBe('DF-999')
  })
})

describe('warmPrCache', () => {
  const rawPR = (number) => ({
    number,
    title: `PR ${number}`,
    html_url: `https://github.com/test-org/api/pull/${number}`,
    base: { repo: { name: 'api' } },
    head: { sha: `sha${number}`, ref: 'main' },
    user: { login: 'alice', type: 'User' },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    draft: false,
  })

  beforeEach(() => {
    cache.clear()
    mockFetchAllPages.mockReset()
    mockFetchWithRetry.mockReset()
    mockFetchAllPages.mockImplementation(async (path) => {
      if (path.includes('/members')) return [{ login: 'alice' }]
      if (path.includes('/teams/test-team/repos')) return [{ name: 'api', permissions: { admin: true } }]
      if (path.endsWith('/pulls?state=open&per_page=100')) return [rawPR(1), rawPR(2)]
      if (path.includes('/pulls/2/reviews')) throw new Error('GitHub API error 500')
      return []
    })
    mockFetchWithRetry.mockResolvedValue({ state: 'open', additions: 1, deletions: 1 })
  })

  it('drops a PR whose details fail when it has no previous entry', async () => {
    const data = await warmPrCache()
    expect(data.prs.map((pr) => pr.number)).toEqual([1])
  })

  it('rebuilds a PR whose details fail from its fresh list entry and previous details', async () => {
    const review = { user: { login: 'bob', type: 'User' }, state: 'APPROVED', submitted_at: '2026-01-02T00:00:00Z' }
    const previousPR = { ...formatPR({ ...rawPR(2), additions: 7, deletions: 3 }, [review], []), title: 'previous', draft: true, ciStatus: 'failing' }
    cache.set({ fetchedAt: new Date(), teamMembers: new Set(), prs: [previousPR] })

    const data = await warmPrCache()
    const pr = data.prs.find((p) => p.number === 2)
    expect(data.prs.map((p) => p.number)).toEqual([1, 2])
    expect(pr).toMatchObject({ title: 'PR 2', draft: false, additions: 7, deletions: 3, reviewState: 'APPROVED', ciStatus: 'failing' })
  })

  it('drops a PR whose details return 404, even with a previous entry', async () => {
    cache.set({ fetchedAt: new Date(), teamMembers: new Set(), prs: [formatPR(rawPR(2), [], [])] })
    const listOnly = mockFetchAllPages.getMockImplementation()
    mockFetchAllPages.mockImplementation(async (path) => (path.includes('/pulls/2/reviews') ? [] : listOnly(path)))
    mockFetchWithRetry.mockImplementation(async (path) => {
      if (path.endsWith('/pulls/2')) throw Object.assign(new Error('Not Found'), { status: 404 })
      return { state: 'open', additions: 1, deletions: 1 }
    })

    const data = await warmPrCache()
    expect(data.prs.map((p) => p.number)).toEqual([1])
  })

  it('drops a PR that closed after the list call', async () => {
    mockFetchWithRetry.mockImplementation(async (path) =>
      path.endsWith('/pulls/1') ? { state: 'closed', merged: true, additions: 1, deletions: 1 } : { state: 'open', additions: 1, deletions: 1 }
    )

    const data = await warmPrCache()
    expect(data.prs.map((p) => p.number)).toEqual([])
  })

  it('throws and keeps the old cache when every PR detail fetch fails', async () => {
    const old = { fetchedAt: new Date('2026-01-01'), teamMembers: new Set(), prs: [] }
    cache.set(old)
    mockFetchWithRetry.mockRejectedValue(new Error('GitHub API error 500'))

    await expect(warmPrCache()).rejects.toThrow('All PR detail fetches failed')
    expect(cache.get()).toBe(old)
  })
})
