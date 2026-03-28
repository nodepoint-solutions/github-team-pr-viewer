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

// Retry PR cache warm with exponential backoff. Scheduler starts only after this
// loop exits (success or exhausted) so the two never run concurrently.
const MAX_ATTEMPTS = 8
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    await warmPrCache()
    break
  } catch (err) {
    if (attempt === MAX_ATTEMPTS) {
      console.error(`Startup PR cache warm failed after ${MAX_ATTEMPTS} attempts — scheduler will retry:`, err.message)
      break
    }
    const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 60_000)
    console.error(`Startup PR cache warm attempt ${attempt} failed, retrying in ${delayMs / 1000}s:`, err.message)
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
}

// Dependency cache warms independently — not critical for loading screen to clear
warmDependencyCache().catch((err) => console.error('Startup dependency cache warm failed:', err.message))

// Scheduler starts after the retry loop — skipInitial since we just attempted a warm
startScheduler({ skipInitial: true })

// Daily Slack summary at 9am UK time
if (config.slackBotToken && config.slackChannelId) {
  startSlackScheduler(sendSlackSummary)
  server.logger.info('Slack daily summary scheduled at 09:00 Europe/London')
}
