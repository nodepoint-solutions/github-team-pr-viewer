import { createServer } from './server.js'
import { startScheduler, startSlackScheduler, isTodayInDaysUK } from './services/scheduler.js'
import { sendSlackSummary, sendSecuritySlackSummary } from './services/slack.js'
import { config } from './config.js'

// Start server immediately — routes return a loading screen while caches warm
const server = await createServer()
await server.start()

server.logger.info(`Server running at ${server.info.uri}`)

// Scheduler handles the initial warm and all subsequent refreshes,
// with exponential backoff on failure in both cases
startScheduler()

// Slack summaries at 9am UK time — days controlled by SLACK_PR_DAYS / SLACK_SECURITY_DAYS
if (config.slackBotToken && config.slackChannelId) {
  startSlackScheduler(async () => {
    if (isTodayInDaysUK(config.slackPrDays)) {
      await sendSlackSummary()
    }
    if (isTodayInDaysUK(config.slackSecurityDays)) {
      await sendSecuritySlackSummary()
    }
  })
  server.logger.info('Slack summary scheduled at 09:00 Europe/London')
}
