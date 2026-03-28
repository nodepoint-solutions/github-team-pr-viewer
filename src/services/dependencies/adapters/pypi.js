export const manifestFile = 'requirements.txt'

export function extractVersion(fileContent, packageName) {
  const lines = fileContent.split('\n')
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^${escaped}[=<>!~]+(.+)$`, 'i')
  for (const line of lines) {
    const trimmed = line.split('#')[0].trim()
    const match = trimmed.match(pattern)
    if (match) return match[1].trim()
  }
  return null
}

export async function fetchLatestVersion(packageName) {
  const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`)
  if (!res.ok) throw new Error(`PyPI registry error ${res.status} for ${packageName}`)
  const data = await res.json()
  return data.info.version
}
