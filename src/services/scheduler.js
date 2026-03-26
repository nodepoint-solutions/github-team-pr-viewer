import { warmCache } from './prs.js'
import { config } from '../config.js'

export function startScheduler({ skipInitial = false } = {}) {
  let running = false

  const warm = async () => {
    if (running) return
    running = true
    try {
      await warmCache()
    } catch (err) {
      console.error('Scheduler: cache warm failed —', err.message)
    } finally {
      running = false
    }
  }

  if (!skipInitial) warm()

  const id = setInterval(warm, config.cacheTtlMs)

  return () => clearInterval(id)
}
