# Needs Merging Tab — Design Spec

**Date:** 2026-03-28

## Overview

Add a "Needs merging" tab to the PR viewer navbar that surfaces open PRs which have been approved by a team member and are ready to merge. It sits at the top of the nav as a high-priority item.

## Filter Logic

A PR appears on this page when all of the following are true:

- `reviewState === 'APPROVED'` — no reviewer's latest state is `CHANGES_REQUESTED`
- At least one team member's latest review state is `'APPROVED'`
- `!hasUnreviewedCommits` — excludes PRs already on "Needs re-review"
- `!draft`
- `!isBot` (author is not a bot)

The team-member approval check is done inline in the route handler by iterating `pr.reviews` and building a `latestPerReviewer` map, consistent with how other routes apply team-based filters.

## Components

### `src/routes/needs-merging.js` (new)

- Path: `GET /needs-merging`
- Applies the filter above against `data.prs`
- Calls `buildViewContext` with title `"Needs merging"` and path `/needs-merging`

### `src/views/needs-merging.html` (new)

- Extends `layout.html`, imports `filterForm` and `prTable`/`prTableGrouped` macros
- Identical structure to `unreviewed.html`

### `src/routes/helpers.js` (modified)

- `buildNavCounts`: add `needsMerging` key using the exact same filter predicate as the route. `buildNavCounts` already receives `teamMembers` via destructuring, so the team-member approval sub-check can be applied directly.

### `src/views/layout.html` (modified)

- Add new nav `<li>` at the **top** of the list (above "Needs re-review")
- Class: `app-nav__link app-nav__link--urgent`
- Badge: `<span class="app-badge app-badge--green">{{ navCounts.needsMerging }}</span>`

### `src/public/application.css` (modified)

- Add `.app-badge--green { background: var(--green-bg); color: var(--green); }` alongside existing badge variants

### `src/plugins/router.js` (modified)

- Register the new `needs-merging` route

## Nav Badge Colour

Green (`--green` / `--green-bg`) — already defined as CSS variables, used elsewhere in the app. No new colour tokens needed; only the badge utility class is new.

## Excluded Scope

- No changes to `formatPR` or `warmCache` in `prs.js`
- No new shared helpers or abstractions
- No Slack summary changes
