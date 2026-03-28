const store = new Map() // key -> { value, storedAt }

export function get(key) {
  return store.get(key)?.value ?? null
}

export function set(key, value) {
  store.set(key, { value, storedAt: Date.now() })
}

export function isExpired(key, ttlMs) {
  const entry = store.get(key)
  if (!entry) return true
  return Date.now() - entry.storedAt >= ttlMs
}

export function clear() {
  store.clear()
}
