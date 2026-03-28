# Needs Merging Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Needs merging" nav tab that surfaces PRs approved by a team member with no outstanding changes, placed at the top of the nav as a high-priority item.

**Architecture:** New route `/needs-merging` filters `data.prs` inline (consistent with all other routes). `buildNavCounts` gains a `needsMerging` key. A new view and nav entry complete the feature.

**Tech Stack:** Hapi.js, Nunjucks, Jest (existing stack — no new dependencies)

---

## File Map

| File | Change |
|------|--------|
| `src/public/application.css` | Add `.app-badge--green` utility class |
| `src/routes/helpers.js` | Add `needsMerging` count to `buildNavCounts` |
| `test/routes/helpers.test.js` | Update fixtures with `reviews`/`reviewState`; add `needsMerging` test |
| `src/routes/needs-merging.js` | New route for `/needs-merging` |
| `test/routes/needs-merging.test.js` | New route integration test |
| `src/views/needs-merging.html` | New view (mirrors `unreviewed.html`) |
| `src/views/layout.html` | Add nav `<li>` at top of list |
| `src/plugins/router.js` | Import and register the new route |

---

### Task 1: Add `app-badge--green` CSS class

**Files:**
- Modify: `src/public/application.css`

- [ ] **Step 1: Add the class**

Open `src/public/application.css`. After line 189 (`.app-badge--yellow { ... }`), add:

```css
.app-badge--green  { background: var(--green-bg);  color: var(--green); }
```

The `--green` and `--green-bg` CSS variables are already defined at the top of the file (lines 20–21).

- [ ] **Step 2: Commit**

```bash
git add src/public/application.css
git commit -m "feat: add app-badge--green CSS utility class"
```

---

### Task 2: Add `needsMerging` count to `buildNavCounts`

**Files:**
- Modify: `src/routes/helpers.js`
- Modify: `test/routes/helpers.test.js`

- [ ] **Step 1: Write the failing test**

In `test/routes/helpers.test.js`, update the `buildNavCounts` describe block.

Replace the existing fixtures and test with:

```js
describe('buildNavCounts', () => {
  const teamMembers = new Set(['alice', 'bob'])

  const prs = [
    // needs-re-review
    {
      author: 'alice', authorType: 'User',
      isReviewed: true, hasUnreviewedCommits: true, draft: false, isStale: false,
      reviewState: 'APPROVED',
      reviews: [{ user: { login: 'bob' }, state: 'APPROVED' }],
    },
    // unreviewed
    {
      author: 'bob', authorType: 'User',
      isReviewed: false, hasUnreviewedCommits: false, draft: false, isStale: true,
      reviewState: null,
      reviews: [],
    },
    // draft — excluded from unreviewed + needs-re-review + needs-merging
    {
      author: 'carol', authorType: 'User',
      isReviewed: false, hasUnreviewedCommits: false, draft: true, isStale: false,
      reviewState: null,
      reviews: [],
    },
    // bot — excluded from all counts
    {
      author: 'dependabot[bot]', authorType: 'Bot',
      isReviewed: false, hasUnreviewedCommits: false, draft: false, isStale: false,
      reviewState: null,
      reviews: [],
    },
    // needs-merging: approved by a team member (alice), no unreviewed commits, not draft
    {
      author: 'external-user', authorType: 'User',
      isReviewed: true, hasUnreviewedCommits: false, draft: false, isStale: false,
      reviewState: 'APPROVED',
      reviews: [{ user: { login: 'alice' }, state: 'APPROVED' }],
    },
    // NOT needs-merging: approved but by a non-team-member only
    {
      author: 'external-user', authorType: 'User',
      isReviewed: true, hasUnreviewedCommits: false, draft: false, isStale: false,
      reviewState: 'APPROVED',
      reviews: [{ user: { login: 'outsider' }, state: 'APPROVED' }],
    },
  ]

  it('counts correctly', () => {
    const counts = buildNavCounts({ prs, teamMembers })
    expect(counts.needsReReview).toBe(1)
    expect(counts.unreviewed).toBe(1)   // bob only; draft excluded
    expect(counts.team).toBe(2)         // alice + bob (carol not in team, bot excluded)
    expect(counts.all).toBe(5)          // bots excluded
    expect(counts.stale).toBe(1)        // bob only
    expect(counts.needsMerging).toBe(1) // external-user PR approved by alice (team member)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest test/routes/helpers.test.js --testNamePattern="counts correctly" --no-coverage
```

Expected: FAIL — `counts.needsMerging` is `undefined`, `expect(undefined).toBe(1)` fails. Also `counts.all` will be 3 not 5 — that's fine, the failure confirms the test is exercising new behaviour.

- [ ] **Step 3: Implement `needsMerging` in `buildNavCounts`**

In `src/routes/helpers.js`, update `buildNavCounts`:

```js
export function buildNavCounts({ prs, teamMembers }) {
  const nonBotPRs = prs.filter((pr) => pr.authorType !== 'Bot' && !pr.author.endsWith('[bot]'))

  const teamApproved = (pr) => {
    const latest = {}
    for (const r of (pr.reviews ?? [])) latest[r.user.login] = r.state
    return Object.entries(latest).some(([login, state]) => state === 'APPROVED' && teamMembers.has(login))
  }

  return {
    needsMerging: nonBotPRs.filter((pr) => pr.reviewState === 'APPROVED' && !pr.hasUnreviewedCommits && !pr.draft && teamApproved(pr)).length,
    needsReReview: nonBotPRs.filter((pr) => pr.isReviewed && pr.hasUnreviewedCommits && !pr.draft).length,
    unreviewed: nonBotPRs.filter((pr) => !pr.isReviewed && !pr.draft).length,
    team: nonBotPRs.filter((pr) => teamMembers.has(pr.author)).length,
    all: nonBotPRs.length,
    stale: nonBotPRs.filter((pr) => pr.isStale).length,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest test/routes/helpers.test.js --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/helpers.js test/routes/helpers.test.js
git commit -m "feat: add needsMerging count to buildNavCounts"
```

---

### Task 3: Create the `/needs-merging` route

**Files:**
- Create: `src/routes/needs-merging.js`
- Create: `test/routes/needs-merging.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/routes/needs-merging.test.js`:

```js
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
  author: 'external-user',
  authorType: 'User',
  createdAt: new Date('2026-03-01'),
  updatedAt: new Date('2026-03-20'),
  draft: false,
  reviews: [],
  commits: [],
  reviewCount: 1,
  reviewState: 'APPROVED',
  isStale: false,
  isReviewed: true,
  latestReviewAt: new Date('2026-03-15'),
  hasUnreviewedCommits: false,
  jiraTicket: null,
  ...overrides,
})

describe('GET /needs-merging', () => {
  let server

  beforeEach(async () => {
    server = await createServer()
    mockIsBot.mockImplementation(({ type, login }) => type === 'Bot' || login.endsWith('[bot]'))
  })

  afterEach(async () => {
    await server.stop()
  })

  it('returns 200', async () => {
    mockGetPRs.mockResolvedValue({
      fetchedAt: new Date(),
      teamMembers,
      prs: [makePR({ reviews: [{ user: { login: 'alice' }, state: 'APPROVED' }] })],
    })
    const res = await server.inject({ method: 'GET', url: '/needs-merging' })
    expect(res.statusCode).toBe(200)
  })

  it('shows a PR approved by a team member', async () => {
    mockGetPRs.mockResolvedValue({
      fetchedAt: new Date(),
      teamMembers,
      prs: [
        makePR({
          author: 'external-user',
          reviews: [{ user: { login: 'alice' }, state: 'APPROVED' }],
        }),
      ],
    })
    const res = await server.inject({ method: 'GET', url: '/needs-merging' })
    expect(res.payload).toContain('external-user')
  })

  it('excludes a PR approved only by a non-team member', async () => {
    mockGetPRs.mockResolvedValue({
      fetchedAt: new Date(),
      teamMembers,
      prs: [
        makePR({
          author: 'external-user',
          reviews: [{ user: { login: 'outsider' }, state: 'APPROVED' }],
        }),
      ],
    })
    const res = await server.inject({ method: 'GET', url: '/needs-merging' })
    expect(res.payload).not.toContain('external-user')
  })

  it('excludes PRs with unreviewed commits', async () => {
    mockGetPRs.mockResolvedValue({
      fetchedAt: new Date(),
      teamMembers,
      prs: [
        makePR({
          hasUnreviewedCommits: true,
          reviews: [{ user: { login: 'alice' }, state: 'APPROVED' }],
        }),
      ],
    })
    const res = await server.inject({ method: 'GET', url: '/needs-merging' })
    expect(res.payload).toContain('Showing <strong>0</strong>')
  })

  it('excludes draft PRs', async () => {
    mockGetPRs.mockResolvedValue({
      fetchedAt: new Date(),
      teamMembers,
      prs: [
        makePR({
          draft: true,
          reviews: [{ user: { login: 'alice' }, state: 'APPROVED' }],
        }),
      ],
    })
    const res = await server.inject({ method: 'GET', url: '/needs-merging' })
    expect(res.payload).toContain('Showing <strong>0</strong>')
  })

  it('excludes bot-authored PRs', async () => {
    mockGetPRs.mockResolvedValue({
      fetchedAt: new Date(),
      teamMembers,
      prs: [
        makePR({
          author: 'dependabot[bot]',
          authorType: 'Bot',
          reviews: [{ user: { login: 'alice' }, state: 'APPROVED' }],
        }),
      ],
    })
    const res = await server.inject({ method: 'GET', url: '/needs-merging' })
    expect(res.payload).not.toContain('dependabot')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest test/routes/needs-merging.test.js --no-coverage
```

Expected: FAIL — 404 on `/needs-merging` (route doesn't exist yet).

- [ ] **Step 3: Create the route**

Create `src/routes/needs-merging.js`:

```js
import { getPRs, isBot } from '../services/prs.js'
import { applyFilters, applySort, buildViewContext } from './helpers.js'

export default {
  method: 'GET',
  path: '/needs-merging',
  options: { validate: { options: { allowUnknown: true }, failAction: 'ignore' } },
  async handler(request, h) {
    const { repo = '', author = '', sort = 'updated', dir = 'desc', groupBy = 'jira', cooldown } = request.query
    const cooldownFlag = cooldown === '1'
    const data = await getPRs()

    const teamApproved = (pr) => {
      const latest = {}
      for (const r of pr.reviews) latest[r.user.login] = r.state
      return Object.entries(latest).some(([login, state]) => state === 'APPROVED' && data.teamMembers.has(login))
    }

    const basePRs = data.prs.filter(
      (pr) =>
        pr.reviewState === 'APPROVED' &&
        !pr.hasUnreviewedCommits &&
        !pr.draft &&
        !isBot({ type: pr.authorType, login: pr.author }) &&
        teamApproved(pr)
    )
    const prs = applySort(applyFilters(basePRs, { repo, author }), sort, dir)
    return h.view('needs-merging', buildViewContext(data, prs, prs, { repo, author, sort, dir, groupBy }, '/needs-merging', 'Needs merging', 'Pull requests that have been approved by a team member and are ready to merge.', cooldownFlag))
  },
}
```

- [ ] **Step 4: Register the route in `src/plugins/router.js`**

Add the import after the existing route imports:

```js
import needsMergingRoute from '../routes/needs-merging.js'
```

Update the `server.route(...)` call to include `needsMergingRoute`:

```js
server.route([indexRoute, allRoute, staleRoute, unreviewedRoute, needsReReviewRoute, needsMergingRoute, refreshRoute, slackSummaryRoute])
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx jest test/routes/needs-merging.test.js --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/needs-merging.js src/plugins/router.js test/routes/needs-merging.test.js
git commit -m "feat: add /needs-merging route"
```

---

### Task 4: Add the view and nav entry

**Files:**
- Create: `src/views/needs-merging.html`
- Modify: `src/views/layout.html`

- [ ] **Step 1: Create the view**

Create `src/views/needs-merging.html`:

```html
{% extends "layout.html" %}
{% from "macros/filters.html" import filterForm %}
{% from "macros/pr-table.html" import prTable, prTableGrouped %}

{% block content %}
  <div class="app-page-header">
    <p class="app-page-header__caption">{{ org }} / {{ team }} team</p>
    <h1 class="app-page-header__title">{{ title }}</h1>
    <p class="app-page-header__desc">{{ description }}</p>
    <p class="app-page-header__meta">
      Last updated {{ fetchedAtFormatted }} —
      <form method="POST" action="/refresh" style="display:inline">
        <button class="app-refresh-btn">Refresh</button>
      </form>
    </p>
  </div>

  {{ filterForm(repoItems, authorItems, query, "/needs-merging", jiraEnabled) }}

  <p class="app-table-meta">Showing <strong>{{ prs.length }}</strong> pull request{{ "s" if prs.length != 1 }}</p>

  {% if groups %}{{ prTableGrouped(groups, query, "/needs-merging", jiraBaseUrl, org) }}{% else %}{{ prTable(prs, query, "/needs-merging", org) }}{% endif %}
{% endblock %}
```

- [ ] **Step 2: Add the nav entry to `layout.html`**

In `src/views/layout.html`, insert a new `<li>` as the **first item** inside `<ul class="app-nav__list">` (before the existing "Needs re-review" `<li>`):

```html
            <li>
              <a href="/needs-merging" class="app-nav__link app-nav__link--urgent{% if currentPath == '/needs-merging' %} is-active{% endif %}">
                <svg class="app-nav__icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
                  <path d="M5.75 7.5a.75.75 0 0 1 .75.75v2.19l.72-.72a.75.75 0 1 1 1.06 1.06l-2 2a.75.75 0 0 1-1.06 0l-2-2a.75.75 0 1 1 1.06-1.06l.72.72V8.25a.75.75 0 0 1 .75-.75ZM4 4.75A.75.75 0 0 1 4.75 4h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 4 4.75ZM3.25 2a.75.75 0 0 0 0 1.5h9.5a.75.75 0 0 0 0-1.5Z"/>
                </svg>
                <span class="app-nav__label">Needs merging</span>
                {% if navCounts %}<span class="app-badge app-badge--green">{{ navCounts.needsMerging }}</span>{% endif %}
              </a>
            </li>
```

- [ ] **Step 3: Run the full test suite**

```bash
npx jest --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/views/needs-merging.html src/views/layout.html
git commit -m "feat: add needs-merging view and nav entry"
```
