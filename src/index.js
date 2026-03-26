import { createServer } from './server.js'

const server = await createServer()
await server.start()

server.logger.info(`Server running at ${server.info.uri}`)
