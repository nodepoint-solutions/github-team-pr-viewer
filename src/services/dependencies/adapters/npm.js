export const manifestFile = 'package.json'

export function extractVersion(fileContent, packageName) {
  let parsed
  try {
    parsed = JSON.parse(fileContent)
  } catch {
    return null
  }
  return parsed.dependencies?.[packageName] ?? parsed.devDependencies?.[packageName] ?? null
}

export async function fetchLatestVersion(packageName) {
  const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`)
  if (!res.ok) throw new Error(`npm registry error ${res.status} for ${packageName}`)
  const data = await res.json()
  return data.version
}
