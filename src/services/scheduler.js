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

// Returns ms until the next 9am in Europe/London, DST-safe.
function msUntilNext9amUK() {
  const now = new Date()
  const londonDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now)

  // Probe 9am UTC on the London calendar date, then correct for the London offset
  const correct9am = (dateStr) => {
    const probe = new Date(`${dateStr}T09:00:00Z`)
    const londonHour = parseInt(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(probe)
    )
    return new Date(probe.getTime() - (londonHour - 9) * 3_600_000)
  }

  let target = correct9am(londonDateStr)

  if (target <= now) {
    const tomorrow = new Date(now.getTime() + 86_400_000)
    const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(tomorrow)
    target = correct9am(tomorrowStr)
  }

  return target.getTime() - now.getTime()
}

export function startSlackScheduler(fn) {
  function schedule() {
    const ms = msUntilNext9amUK()
    setTimeout(async () => {
      try {
        await fn()
      } catch (err) {
        console.error('Slack scheduler: send failed —', err.message)
      }
      schedule()
    }, ms)
  }
  schedule()
}
