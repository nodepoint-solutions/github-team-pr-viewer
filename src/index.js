import { createServer } from './server.js'
import { startScheduler, startSlackScheduler } from './services/scheduler.js'
import { sendSlackSummary } from './services/slack.js'
import { config } from './config.js'

// Start server immediately — routes return a loading screen while caches warm
const server = await createServer()
await server.start()

server.logger.info(`Server running at ${server.info.uri}`)

// Scheduler handles the initial warm and all subsequent refreshes,
// with exponential backoff on failure in both cases
startScheduler()

// Daily Slack summary at 9am UK time
if (config.slackBotToken && config.slackChannelId) {
  startSlackScheduler(sendSlackSummary)
  server.logger.info('Slack daily summary scheduled at 09:00 Europe/London')
}
