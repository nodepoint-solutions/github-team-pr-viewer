import { describe, it, expect, jest } from '@jest/globals'

// config.js throws at import time if GITHUB_TOKEN is absent — mock it first
jest.unstable_mockModule('../../src/config.js', () => ({
  config: { port: 3000, githubToken: 'test', cacheTtlMs: 300000, isDevelopment: false, jiraEnabled: true, jiraTicketPattern: 'DF-\\d+' },
}))

const { isBot, isMergeCommit, formatPR, runWithConcurrency, extractJiraTicket } = await import('../../src/services/prs.js')

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

describe('runWithConcurrency', () => {
  it('runs all items and returns results', async () => {
    const items = [1, 2, 3, 4, 5]
    const fn = async (x) => x * 2
    const results = await runWithConcurrency(items, fn, 2)
    expect(results).toEqual([2, 4, 6, 8, 10])
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
