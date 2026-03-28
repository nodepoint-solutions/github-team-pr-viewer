import hapi from '@hapi/hapi'
import hapiPino from 'hapi-pino'
import vision from '@hapi/vision'
import nunjucks from 'nunjucks'
import { fileURLToPath } from 'url'
import { join } from 'path'
import { config } from './config.js'
import { getPRs } from './services/prs.js'
import routerPlugin from './plugins/router.js'
import errorsPlugin from './plugins/errors.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const viewsPath = join(__dirname, 'views')

export async function createServer() {
  const server = hapi.server({
    port: config.port,
    router: { stripTrailingSlash: true },
    routes: {
      security: { xss: 'enabled', noSniff: true, xframe: true },
    },
  })

  await server.register({
    plugin: hapiPino,
    options: {
      logEvents: config.isDevelopment ? ['response', 'request-error'] : ['request-error'],
      redact: ['req.headers.authorization'],
    },
  })

  // Register vision at root level — all plugin realms can walk up and find it
  await server.register(vision)

  const env = nunjucks.configure([viewsPath], {
    autoescape: true,
    watch: config.isDevelopment,
    noCache: config.isDevelopment,
  })

  server.views({
    engines: {
      html: {
        compile(src) {
          const template = nunjucks.compile(src, env)
          return (context) => template.render(context)
        },
      },
    },
    path: viewsPath,
    isCached: !config.isDevelopment,
  })

  // Show loading screen on all GET routes while the cache is being warmed on startup
  server.ext('onPreHandler', (request, h) => {
    if (request.method !== 'get') return h.continue
    if (request.path.startsWith('/assets/')) return h.continue
    if (getPRs().fetchedAt !== null) return h.continue
    return h.view('loading', { org: config.org, team: config.team }).takeover()
  })

  await server.register(routerPlugin)
  await server.register(errorsPlugin)

  return server
}
