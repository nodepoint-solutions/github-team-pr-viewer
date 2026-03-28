const {
  PORT = '3000',
  GITHUB_TOKEN,
  GITHUB_ORG,
  GITHUB_TEAM,
  JIRA_TICKET_PATTERN,
  JIRA_BASE_URL,
  APP_URL,
  CACHE_TTL_MS = '1200000',
  NODE_ENV = 'production',
  SLACK_BOT_TOKEN,
  SLACK_CHANNEL_ID,
  TRACKED_DEPENDENCIES = '',
} = process.env

if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN environment variable is required')
if (!GITHUB_ORG) throw new Error('GITHUB_ORG environment variable is required')
if (!GITHUB_TEAM) throw new Error('GITHUB_TEAM environment variable is required')

const hasJiraPattern = Boolean(JIRA_TICKET_PATTERN)
const hasJiraUrl = Boolean(JIRA_BASE_URL)
if (hasJiraPattern !== hasJiraUrl) {
  throw new Error('JIRA_TICKET_PATTERN and JIRA_BASE_URL must both be set or both be unset')
}

const jiraEnabled = hasJiraPattern && hasJiraUrl

function parseTrackedDeps(raw) {
  if (!raw.trim()) return []
  return raw.split(',')
    .map((entry) => {
      const trimmed = entry.trim()
      const colon = trimmed.indexOf(':')
      if (colon === -1) return null
      const ecosystem = trimmed.slice(0, colon).trim()
      const packageName = trimmed.slice(colon + 1).trim()
      if (!ecosystem || !packageName) return null
      return { ecosystem, packageName }
    })
    .filter(Boolean)
}

export const config = {
  port: parseInt(PORT, 10),
  githubToken: GITHUB_TOKEN,
  org: GITHUB_ORG,
  team: GITHUB_TEAM,
  jiraEnabled,
  jiraTicketPattern: jiraEnabled ? JIRA_TICKET_PATTERN : null,
  jiraBaseUrl: jiraEnabled ? JIRA_BASE_URL : null,
  appUrl: APP_URL ?? null,
  cacheTtlMs: parseInt(CACHE_TTL_MS, 10),
  isDevelopment: NODE_ENV === 'development',
  slackBotToken: SLACK_BOT_TOKEN ?? null,
  slackChannelId: SLACK_CHANNEL_ID ?? null,
  trackedDependencies: parseTrackedDeps(TRACKED_DEPENDENCIES),
}
