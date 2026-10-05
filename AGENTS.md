# AGENTS.md

Guidance for AI coding agents working on this codebase.

## Overview

Self-hosted GitHub team PR dashboard. Pulls data from the GitHub REST API, caches it in memory, and renders it via Hapi + Nunjucks. No database. No build step.

**Stack:** Node.js 22+ · Hapi 21 · Nunjucks · Jest · ESM only (`"type": "module"`)

---

## Architecture

```
src/
  routes/       # One file per tab/page — handler + filter logic
  services/
    github.js   # Low-level API client (pagination, retries, rate limit backoff)
    prs.js      # Cache warming, PR formatting
    pr-filters.js # One rule per tab, shared by pages, nav badges and Slack
    cache.js    # Singleton in-memory PR store
    dep-cache.js# Keyed cache for dependency manifest + registry lookups
    scheduler.js# Background warm loop + daily Slack summary
    slack.js    # Slack message formatting and posting
    dependencies/ # Dependency drift logic + npm/pypi adapters
  plugins/
    router.js   # Registers all routes
    errors.js   # Global 404/5xx handler
  views/
    layout.html # Base template with sidebar nav
    macros/
      pr-table.html  # prTable and prTableGrouped macros
      filters.html   # filterForm macro
```

All PR data lives in one `{ fetchedAt, teamMembers, prs }` object. All routes read from it — no per-request API calls.

---

## Adding a New Tab

There are six touch points. Follow this order:

### 1. Route handler — `src/routes/your-tab.js`

```js
import { getPRs } from '../services/prs.js'
import { filterPRsForTab } from '../services/pr-filters.js'
import { applyFilters, applySort, buildViewContext } from './helpers.js'

export default {
  method: 'GET',
  path: '/your-tab',
  options: { validate: { options: { allowUnknown: true }, failAction: 'ignore' } },
  async handler(request, h) {
    const { repo = '', author = '', sort = 'updated', dir = 'desc', groupBy = 'jira' } = request.query
    const data = await getPRs()
    const basePRs = filterPRsForTab(data, 'yourTab')
    const prs = applySort(applyFilters(basePRs, { repo, author }), sort, dir)
    return h.view('your-tab', buildViewContext(data, prs, prs, { repo, author, sort, dir, groupBy }, '/your-tab', 'Title', 'Description'))
  },
}
```

### 2. Register in `src/plugins/router.js`

Add the import and include in the `server.route([...])` array.

### 3. View template — `src/views/your-tab.html`

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

  {{ filterForm(repoItems, authorItems, query, "/your-tab", jiraEnabled) }}
  <p class="app-table-meta">Showing <strong>{{ prs.length }}</strong> pull request{{ "s" if prs.length != 1 }}</p>

  {% if groups %}
    {{ prTableGrouped(groups, query, "/your-tab", jiraBaseUrl, org) }}
  {% else %}
    {{ prTable(prs, query, "/your-tab", org) }}
  {% endif %}
{% endblock %}
```

### 4. Nav link — `src/views/layout.html`

Inside `<nav class="app-nav">`:

```html
<li>
  <a href="/your-tab" class="app-nav__link{% if currentPath == '/your-tab' %} is-active{% endif %}">
    <svg class="app-nav__icon" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <!-- Octicon or similar 16px SVG -->
    </svg>
    <span class="app-nav__label">Label</span>
    {% if navCounts %}<span class="app-badge app-badge--blue">{{ navCounts.yourTab }}</span>{% endif %}
  </a>
</li>
```

Badge colour options: `app-badge--blue`, `app-badge--yellow`, `app-badge--red`.

### 5. Tab rule — `src/services/pr-filters.js`

Add to `TAB_FILTERS`:

```js
yourTab: (pr, teamMembers) => isHuman(pr) && !pr.draft && /* your rule */,
```

The route reads this rule through `filterPRsForTab(data, 'yourTab')`. `buildNavCounts()` counts every key in `TAB_FILTERS`, so `navCounts.yourTab` always matches the page.

### 6. Tests — `test/routes/your-tab.test.js`

```js
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'

const mockGetPRs = jest.fn()
jest.unstable_mockModule('../../src/config.js', () => ({
  config: { port: 3000, githubToken: 'test', cacheTtlMs: 300000, isDevelopment: false, org: 'test-org', team: 'test-team' },
}))
jest.unstable_mockModule('../../src/services/prs.js', () => ({
  getPRs: mockGetPRs,
  warmPrCache: jest.fn().mockResolvedValue({}),
  isBot: jest.fn(({ type, login }) => type === 'Bot' || login.endsWith('[bot]')),
}))

const { createServer } = await import('../../src/server.js')

describe('GET /your-tab', () => {
  let server
  beforeEach(async () => { server = await createServer(); mockGetPRs.mockReturnValue(mockData) })
  afterEach(async () => { await server.stop() })

  it('returns 200', async () => {
    const res = await server.inject({ method: 'GET', url: '/your-tab' })
    expect(res.statusCode).toBe(200)
  })
})
```

Key: `jest.unstable_mockModule()` must appear before any `import` of the module being mocked. Always stop the server in `afterEach`.

---

## GitHub API

### Client (`src/services/github.js`)

| Function | Use |
|---|---|
| `fetchAllPages(path, token)` | Paginated list endpoints (members, repos, PRs, reviews) |
| `fetchFile(path, token)` | Single file content (base64-decoded, null on 404) |
| `fetchWithRetry(path, token)` | Single endpoint with backoff (check runs) |

All functions retry on 429/403 using `retry-after` or `x-ratelimit-reset` headers, with exponential backoff up to 60s.

### Token scopes required per feature

| Feature | Scope |
|---|---|
| All core tabs | `read:org`, `repo` |
| Security / Dependabot tab | `security_events` (or `repo` for private repos) |

If `security_events` is missing, the Security tab shows nothing and logs a warning. All other features still work.

### Cache warming flow (`src/services/prs.js`)

1. Fetch team members → fetch team repos → filter non-archived + required role (`REQUIRED_TEAM_ROLE`, default `admin`)
2. Per repo: fetch open PRs
3. Per PR (max 10 concurrent): fetch reviews + commits + check runs
4. Format and store in cache singleton

Individual repo failures are tolerated. If all repos fail, old cache is preserved.

---

## Testing

```bash
npm test                # all tests
npm test -- --watch     # watch mode
```

- Tests live in `test/routes/` and `test/services/`
- Mock `global.fetch` for service tests
- Use `server.inject()` for route tests — no real HTTP
- Assert on `res.statusCode` and `res.payload` (HTML string)
- Never import server or services at the top level — always after `jest.unstable_mockModule()` calls

---

## Environment Variables

### Required

| Variable | Purpose |
|---|---|
| `GITHUB_TOKEN` | PAT with `read:org` and `repo` scopes |
| `GITHUB_ORG` | GitHub organisation slug |
| `GITHUB_TEAM` | Team slug within the org |

### Optional

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Server port |
| `CACHE_TTL_MS` | `1200000` | Cache refresh interval (ms) |
| `REQUIRED_TEAM_ROLE` | `admin` | Min team role for repo inclusion (`pull`/`triage`/`push`/`maintain`/`admin`) |
| `JIRA_TICKET_PATTERN` | — | Regex to extract Jira keys from PR titles/branches (pair with `JIRA_BASE_URL`) |
| `JIRA_BASE_URL` | — | Base URL for Jira links, no trailing slash |
| `SLACK_BOT_TOKEN` | — | `xoxb-...` token for Slack summaries |
| `SLACK_CHANNEL_ID` | — | Channel ID for Slack posts |
| `APP_URL` | — | Public URL shown in Slack message footers |
| `TRACKED_DEPENDENCIES` | — | Comma-separated `ecosystem:package` pairs (e.g. `npm:express,pypi:requests`) |
| `NODE_ENV` | `production` | Set to `development` for template hot-reload and dev logging |

`JIRA_TICKET_PATTERN` and `JIRA_BASE_URL` must both be set or both be absent.

---

## Key Constraints

- **ESM only** — no `require()`. Use `import`/`export` throughout.
- **No build step** — source runs directly in Node 22+.
- **No database** — all state is in-memory. Data is lost on restart and re-fetched.
- **Single process** — cache is a module-level singleton; not safe for multi-process deployment.
- **No ORM** — data is transformed in JS after fetching from the API.
- **Nunjucks macros use positional args** — match the existing call signature exactly when invoking `prTable`, `prTableGrouped`, or `filterForm`.
