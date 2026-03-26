import { createServer } from './server.js'
import { warmCache } from './services/prs.js'
import { startScheduler } from './services/scheduler.js'

// Warm cache before accepting any requests
await warmCache()

const server = await createServer()
await server.start()

server.logger.info(`Server running at ${server.info.uri}`)

// Interval refresh — skip immediate warm since we just did one above
startScheduler({ skipInitial: true })
