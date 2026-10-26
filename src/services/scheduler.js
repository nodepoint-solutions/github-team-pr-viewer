import { warmPrCache } from './prs.js'
import { warmDependencyCache } from './dependencies/index.js'
import { config } from '../config.js'

// Request-level retries and rate-limit waits sit in the GitHub client, so this only covers
// failures of a whole warm, such as the team lookup failing
const MAX_ATTEMPTS = 3
const DAY_NAMES = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

async function withRetry(name, warmFn) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await warmFn()
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) {
        console.error(`${name} cache warm failed after ${MAX_ATTEMPTS} attempts:`, err.message)
        return
      }
      const delayMs = 1000 * Math.pow(4, attempt)
      console.error(`${name} cache warm attempt ${attempt} failed, retrying in ${delayMs / 1000}s:`, err.message)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

export function startScheduler({ skipInitial = false } = {}) {
  let running = false

  const warm = async () => {
    if (running) return
    running = true
    try {
      // Each cache retries on its own, so that a retry fetches only the cache that failed
      await Promise.all([withRetry('PR', warmPrCache), withRetry('Dependency', warmDependencyCache)])
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

export function isTodayInDaysUK(days) {
  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London',
    weekday: 'short',
  }).format(new Date())
  return days.has(DAY_NAMES[dayName])
}
