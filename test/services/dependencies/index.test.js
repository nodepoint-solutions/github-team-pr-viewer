import { jest, describe, it, expect, beforeEach } from '@jest/globals'

jest.unstable_mockModule('../../../src/config.js', () => ({
  config: {
    org: 'test-org',
    team: 'test-team',
    githubToken: 'test-token',
    cacheTtlMs: 300000,
    requiredTeamRole: 'admin',
    trackedDependencies: [
      { ecosystem: 'npm', packageName: 'hapi' },
    ],
  },
}))

const mockFetchAllPages = jest.fn()
const mockFetchFile = jest.fn()

jest.unstable_mockModule('../../../src/services/github.js', () => ({
  fetchAllPages: mockFetchAllPages,
  fetchFile: mockFetchFile,
}))

const mockDepCache = {
  get: jest.fn().mockReturnValue(null),
  set: jest.fn(),
  isExpired: jest.fn().mockReturnValue(true),
  clear: jest.fn(),
}

jest.unstable_mockModule('../../../src/services/dep-cache.js', () => mockDepCache)

const mockNpmAdapter = {
  manifestFile: 'package.json',
  extractVersion: jest.fn(),
  fetchLatestVersion: jest.fn(),
}

jest.unstable_mockModule('../../../src/services/dependencies/adapters/npm.js', () => mockNpmAdapter)

// Reset module registry so this file always loads the real module, even if another
// test file (e.g. scheduler.test.js) has registered a mock for the same path.
jest.resetModules()

const { warmDependencyCache, getDependencies, getSecurityAlerts } = await import('../../../src/services/dependencies/index.js')

describe('warmDependencyCache', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDepCache.isExpired.mockReturnValue(true)
    mockDepCache.get.mockReturnValue(null)
    // Default: dependabot alert calls return empty array unless overridden
    mockFetchAllPages.mockResolvedValue([])
  })

  it('returns empty result when trackedDependencies is empty', async () => {
    const { config } = await import('../../../src/config.js')
    config.trackedDependencies = []
    const result = await warmDependencyCache()
    expect(result.rows).toEqual([])
    expect(result.trackedDependencies).toEqual([])
    expect(result.driftCount).toBe(0)
    config.trackedDependencies = [{ ecosystem: 'npm', packageName: 'hapi' }]
  })

  it('marks a package as drifted when pinned !== latest', async () => {
    mockFetchAllPages.mockResolvedValueOnce([{ name: 'forms-api', permissions: { admin: true } }])
    mockNpmAdapter.fetchLatestVersion.mockResolvedValueOnce('22.0.0')
    mockFetchFile.mockResolvedValueOnce(JSON.stringify({ dependencies: { hapi: '^21.3.0' } }))
    mockNpmAdapter.extractVersion.mockReturnValueOnce('^21.3.0')
    const result = await warmDependencyCache()
    expect(result.driftCount).toBe(1)
    expect(result.rows[0].deps['npm:hapi'].isDrift).toBe(true)
    expect(result.rows[0].deps['npm:hapi'].pinned).toBe('^21.3.0')
    expect(result.rows[0].deps['npm:hapi'].latest).toBe('22.0.0')
  })

  it('marks a package as not drifted when pinned === latest', async () => {
    mockFetchAllPages.mockResolvedValueOnce([{ name: 'forms-api', permissions: { admin: true } }])
    mockNpmAdapter.fetchLatestVersion.mockResolvedValueOnce('21.3.0')
    mockFetchFile.mockResolvedValueOnce(JSON.stringify({ dependencies: { hapi: '21.3.0' } }))
    mockNpmAdapter.extractVersion.mockReturnValueOnce('21.3.0')
    const result = await warmDependencyCache()
    expect(result.driftCount).toBe(0)
    expect(result.rows[0].deps['npm:hapi'].isDrift).toBe(false)
  })

  it('excludes repos where no tracked packages are present', async () => {
    mockFetchAllPages.mockResolvedValueOnce([{ name: 'forms-api', permissions: { admin: true } }])
    mockNpmAdapter.fetchLatestVersion.mockResolvedValueOnce('21.3.0')
    mockFetchFile.mockResolvedValueOnce(null)
    const result = await warmDependencyCache()
    expect(result.rows).toHaveLength(0)
  })

  it('includes repos where at least one tracked package is present', async () => {
    mockFetchAllPages.mockResolvedValueOnce([{ name: 'forms-api', permissions: { admin: true } }])
    mockNpmAdapter.fetchLatestVersion.mockResolvedValueOnce('21.3.0')
    mockFetchFile.mockResolvedValueOnce(JSON.stringify({ dependencies: { hapi: '21.3.0' } }))
    mockNpmAdapter.extractVersion.mockReturnValueOnce('21.3.0')
    const result = await warmDependencyCache()
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].repo).toBe('forms-api')
  })

  it('sets latest to null when registry fetch fails', async () => {
    mockFetchAllPages.mockResolvedValueOnce([{ name: 'forms-api', permissions: { admin: true } }])
    mockNpmAdapter.fetchLatestVersion.mockRejectedValueOnce(new Error('network error'))
    mockFetchFile.mockResolvedValueOnce(JSON.stringify({ dependencies: { hapi: '21.3.0' } }))
    mockNpmAdapter.extractVersion.mockReturnValueOnce('21.3.0')
    const result = await warmDependencyCache()
    expect(result.rows[0].deps['npm:hapi'].latest).toBeNull()
    expect(result.rows[0].deps['npm:hapi'].isDrift).toBe(false)
  })

  it('excludes repos where the team does not have admin permissions', async () => {
    mockFetchAllPages.mockResolvedValueOnce([
      { name: 'forms-api', permissions: { admin: true } },
      { name: 'forms-runner', permissions: { admin: false } },
      { name: 'forms-shared', permissions: undefined },
    ])
    mockNpmAdapter.fetchLatestVersion.mockResolvedValueOnce('21.3.0')
    mockFetchFile.mockResolvedValueOnce(JSON.stringify({ dependencies: { hapi: '21.3.0' } }))
    mockNpmAdapter.extractVersion.mockReturnValueOnce('21.3.0')
    const result = await warmDependencyCache()
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].repo).toBe('forms-api')
  })
})

describe('getDependencies', () => {
  it('returns empty data before cache is warmed', () => {
    // Module-level depStore is populated by warmDependencyCache calls above,
    // but since modules are isolated per test file, getDependencies reflects
    // whatever warmDependencyCache last set.
    const result = getDependencies()
    expect(result).toHaveProperty('rows')
    expect(result).toHaveProperty('trackedDependencies')
    expect(result).toHaveProperty('driftCount')
  })
})

describe('getSecurityAlerts', () => {
  it('returns empty data before cache is warmed', () => {
    const data = getSecurityAlerts()
    expect(data.alerts).toEqual([])
    expect(data.alertCount).toBe(0)
  })
})

describe('warmDependencyCache — security alerts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDepCache.isExpired.mockReturnValue(true)
    mockDepCache.get.mockReturnValue(null)
  })

  it('populates securityStore with mapped alerts from all repos', async () => {
    const { config } = await import('../../../src/config.js')
    config.trackedDependencies = []

    mockFetchAllPages.mockImplementation(async (path) => {
      if (path.includes('/teams/') && path.includes('/repos')) {
        return [{ name: 'forms-runner', archived: false, permissions: { admin: true } }]
      }
      if (path.includes('/dependabot/alerts')) {
        return [{
          dependency: { package: { name: 'lodash', ecosystem: 'npm' } },
          security_advisory: { ghsa_id: 'GHSA-jf85-cpcp-j695', cve_id: 'CVE-2020-8203', summary: 'Prototype Pollution in lodash', severity: 'high' },
          security_vulnerability: { first_patched_version: { identifier: '4.17.21' } },
        }]
      }
      return []
    })

    await warmDependencyCache()
    const security = getSecurityAlerts()
    expect(security.alertCount).toBe(1)
    expect(security.alerts[0]).toMatchObject({
      repo: 'forms-runner', package: 'lodash', ecosystem: 'npm', severity: 'high',
      title: 'Prototype Pollution in lodash', ghsaId: 'GHSA-jf85-cpcp-j695',
      cveId: 'CVE-2020-8203', fixedIn: '4.17.21',
    })
  })

  it('returns empty alerts for a repo when Dependabot fetch fails', async () => {
    const { config } = await import('../../../src/config.js')
    config.trackedDependencies = []

    mockFetchAllPages.mockImplementation(async (path) => {
      if (path.includes('/teams/') && path.includes('/repos')) {
        return [{ name: 'forms-runner', archived: false, permissions: { admin: true } }]
      }
      if (path.includes('/dependabot/alerts')) {
        throw new Error('GitHub API 403 on /dependabot/alerts: Must have admin rights')
      }
      return []
    })

    await warmDependencyCache()
    const security = getSecurityAlerts()
    expect(security.alertCount).toBe(0)
    expect(security.alerts).toEqual([])
  })

  it('sets fixedIn to null when first_patched_version is absent', async () => {
    const { config } = await import('../../../src/config.js')
    config.trackedDependencies = []

    mockFetchAllPages.mockImplementation(async (path) => {
      if (path.includes('/teams/') && path.includes('/repos')) {
        return [{ name: 'forms-runner', archived: false, permissions: { admin: true } }]
      }
      if (path.includes('/dependabot/alerts')) {
        return [{
          dependency: { package: { name: 'express', ecosystem: 'npm' } },
          security_advisory: { ghsa_id: 'GHSA-xxxx-yyyy-zzzz', cve_id: null, summary: 'Some vulnerability', severity: 'medium' },
          security_vulnerability: { first_patched_version: null },
        }]
      }
      return []
    })

    await warmDependencyCache()
    const security = getSecurityAlerts()
    expect(security.alerts[0].fixedIn).toBeNull()
    expect(security.alerts[0].cveId).toBeNull()
  })
})
