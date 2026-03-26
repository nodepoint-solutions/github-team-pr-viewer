const COOLDOWN_MS = 30_000

let store = null

export function get() {
  return store
}

export function set(data) {
  store = data
}

export function isExpired(ttlMs) {
  if (!store) return true
  return Date.now() - store.fetchedAt.getTime() > ttlMs
}

export function isCooldown() {
  if (!store) return false
  return Date.now() - store.fetchedAt.getTime() < COOLDOWN_MS
}

export function clear() {
  store = null
}
