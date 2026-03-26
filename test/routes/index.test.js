import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'

const mockGetPRs = jest.fn()
const mockIsBot = jest.fn()

jest.unstable_mockModule('../../src/config.js', () => ({
  config: {
    port: 3000,
    githubToken: 'test',
    cacheTtlMs: 300000,
    isDevelopment: false,
  },
}))

jest.unstable_mockModule('../../src/services/prs.js', () => ({
  getPRs: mockGetPRs,
  warmCache: jest.fn().mockResolvedValue({}),
  isBot: mockIsBot,
}))

const { createServer } = await import('../../src/server.js')

const teamMembers = new Set(['alice', 'bob'])

const makePR = (overrides = {}) => ({
  number: 1,
  title: 'Test PR',
  url: 'https://github.com/DEFRA/forms-runner/pull/1',
  repo: 'forms-runner',
  author: 'alice',
  authorType: 'User',
  createdAt: new Date('2026-03-01'),
  updatedAt: new Date('2026-03-20'),
  draft: false,
  reviews: [],
  commits: [],
  reviewCount: 0,
  reviewState: null,
  isStale: false,
  isReviewed: false,
  latestReviewAt: null,
  hasUnreviewedCommits: false,
  ...overrides,
})

const mockData = {
  fetchedAt: new Date(),
  teamMembers,
  prs: [
    makePR({ author: 'alice', authorType: 'User' }),
    makePR({ number: 2, author: 'bob', authorType: 'User' }),
    makePR({ number: 3, author: 'dependabot[bot]', authorType: 'Bot' }),
    makePR({ number: 4, author: 'external-user', authorType: 'User' }),
  ],
}

describe('GET /', () => {
  let server

  beforeEach(async () => {
    server = await createServer()
    mockGetPRs.mockResolvedValue(mockData)
    mockIsBot.mockImplementation(({ type, login }) => type === 'Bot' || login.endsWith('[bot]'))
  })

  afterEach(async () => {
    await server.stop()
  })

  it('returns 200', async () => {
    const res = await server.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
  })

  it('only shows team members (excludes bots and non-members)', async () => {
    const res = await server.inject({ method: 'GET', url: '/' })
    // alice and bob are team members; dependabot[bot] and external-user are not
    expect(res.payload).toContain('alice')
    expect(res.payload).toContain('bob')
    expect(res.payload).not.toContain('dependabot')
    expect(res.payload).not.toContain('external-user')
  })

  it('filters by repo query param', async () => {
    const allPRs = [
      makePR({ number: 1, author: 'alice', repo: 'forms-runner' }),
      makePR({ number: 2, author: 'bob', repo: 'forms-designer' }),
    ]
    mockGetPRs.mockResolvedValue({ ...mockData, prs: allPRs })
    const res = await server.inject({ method: 'GET', url: '/?repo=forms-runner' })
    expect(res.statusCode).toBe(200)
    expect(res.payload).toContain('forms-runner')
    expect(res.payload).not.toContain('forms-designer')
  })

  it('filters by author query param', async () => {
    const res = await server.inject({ method: 'GET', url: '/?author=alice' })
    expect(res.statusCode).toBe(200)
    expect(res.payload).toContain('alice')
    expect(res.payload).not.toContain('bob')
  })
})
