import { isBot } from './prs.js'

const isHuman = (pr) => !isBot({ type: pr.authorType, login: pr.author })

function isApprovedByTeam(pr, teamMembers) {
  const latest = {}
  for (const r of pr.reviews ?? []) latest[r.user.login] = r.state
  return Object.entries(latest).some(([login, state]) => state === 'APPROVED' && teamMembers.has(login))
}

// One rule per tab. The tab's page, its nav badge and the Slack summary all
// read the rule from here, so they always show the same set of PRs.
const TAB_FILTERS = {
  needsMerging: (pr, teamMembers) =>
    isHuman(pr) && !pr.draft && pr.reviewState === 'APPROVED' && !pr.hasUnreviewedCommits && isApprovedByTeam(pr, teamMembers),
  needsReReview: (pr) => isHuman(pr) && !pr.draft && pr.isReviewed && pr.hasUnreviewedCommits,
  team: (pr, teamMembers) => isHuman(pr) && !pr.draft && !pr.isReviewed && teamMembers.has(pr.author),
  unreviewed: (pr) => isHuman(pr) && !pr.draft && !pr.isReviewed,
  all: (pr) => isHuman(pr) && !pr.draft,
  stale: (pr) => isHuman(pr) && !pr.draft && pr.isStale,
  drafts: (pr) => isHuman(pr) && pr.draft,
}

export function filterPRsForTab({ prs, teamMembers }, tab) {
  return prs.filter((pr) => TAB_FILTERS[tab](pr, teamMembers))
}

export function countPRsPerTab(data) {
  return Object.fromEntries(Object.keys(TAB_FILTERS).map((tab) => [tab, filterPRsForTab(data, tab).length]))
}
