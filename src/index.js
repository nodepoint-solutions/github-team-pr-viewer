import { createServer } from './server.js'
import { warmPrCache } from './services/prs.js'
import { warmDependencyCache } from './services/dependencies/index.js'
import { startScheduler, startSlackScheduler } from './services/scheduler.js'
import { sendSlackSummary } from './services/slack.js'
import { config } from './config.js'

// Start server immediately — routes return a loading screen while caches warm
const server = await createServer()
await server.start()

server.logger.info(`Server running at ${server.info.uri}`)

// Warm caches in background — loading screen is shown until fetchedAt is set
warmPrCache().catch((err) => console.error('Startup PR cache warm failed:', err.message))
warmDependencyCache().catch((err) => console.error('Startup dependency cache warm failed:', err.message))

// Interval refresh — skip immediate warm since we just did one above
startScheduler({ skipInitial: true })

// Daily Slack summary at 9am UK time
if (config.slackBotToken && config.slackChannelId) {
  startSlackScheduler(sendSlackSummary)
  server.logger.info('Slack daily summary scheduled at 09:00 Europe/London')
}
