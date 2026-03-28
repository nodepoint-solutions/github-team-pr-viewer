import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'

describe('config', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, GITHUB_TOKEN: 'test-token', GITHUB_ORG: 'test-org', GITHUB_TEAM: 'test-team' }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('reads PORT from env, defaulting to 3000', async () => {
    delete process.env.PORT
    const { config } = await import('../../src/config.js?v=' + Math.random())
    expect(config.port).toBe(3000)
  })

  it('reads PORT from env when set', async () => {
    process.env.PORT = '4000'
    const { config } = await import('../../src/config.js?v=' + Math.random())
    expect(config.port).toBe(4000)
  })

  it('throws if GITHUB_TOKEN is missing', async () => {
    delete process.env.GITHUB_TOKEN
    await expect(import('../../src/config.js?v=' + Math.random())).rejects.toThrow(/GITHUB_TOKEN/)
  })

  it('throws if only JIRA_TICKET_PATTERN is set without JIRA_BASE_URL', async () => {
    process.env.JIRA_TICKET_PATTERN = 'ABC-\\d+'
    delete process.env.JIRA_BASE_URL
    await expect(import('../../src/config.js?v=' + Math.random())).rejects.toThrow(/JIRA_TICKET_PATTERN and JIRA_BASE_URL/)
  })

  it('throws if only JIRA_BASE_URL is set without JIRA_TICKET_PATTERN', async () => {
    delete process.env.JIRA_TICKET_PATTERN
    process.env.JIRA_BASE_URL = 'https://jira.example.com'
    await expect(import('../../src/config.js?v=' + Math.random())).rejects.toThrow(/JIRA_TICKET_PATTERN and JIRA_BASE_URL/)
  })

  it('enables jira when both JIRA_TICKET_PATTERN and JIRA_BASE_URL are set', async () => {
    process.env.JIRA_TICKET_PATTERN = 'ABC-\\d+'
    process.env.JIRA_BASE_URL = 'https://jira.example.com'
    const { config } = await import('../../src/config.js?v=' + Math.random())
    expect(config.jiraEnabled).toBe(true)
    expect(config.jiraTicketPattern).toBe('ABC-\\d+')
    expect(config.jiraBaseUrl).toBe('https://jira.example.com')
  })

  it('disables jira when neither var is set', async () => {
    delete process.env.JIRA_TICKET_PATTERN
    delete process.env.JIRA_BASE_URL
    const { config } = await import('../../src/config.js?v=' + Math.random())
    expect(config.jiraEnabled).toBe(false)
    expect(config.jiraTicketPattern).toBeNull()
    expect(config.jiraBaseUrl).toBeNull()
  })

  it('returns empty trackedDependencies when TRACKED_DEPENDENCIES is unset', async () => {
    delete process.env.TRACKED_DEPENDENCIES
    const { config } = await import('../../src/config.js?v=' + Math.random())
    expect(config.trackedDependencies).toEqual([])
  })

  it('parses TRACKED_DEPENDENCIES into ecosystem/packageName pairs', async () => {
    process.env.TRACKED_DEPENDENCIES = 'npm:govuk-frontend,npm:hapi,pypi:requests'
    const { config } = await import('../../src/config.js?v=' + Math.random())
    expect(config.trackedDependencies).toEqual([
      { ecosystem: 'npm', packageName: 'govuk-frontend' },
      { ecosystem: 'npm', packageName: 'hapi' },
      { ecosystem: 'pypi', packageName: 'requests' },
    ])
  })

  it('skips malformed entries in TRACKED_DEPENDENCIES', async () => {
    process.env.TRACKED_DEPENDENCIES = 'npm:valid,badentry,npm:also-valid'
    const { config } = await import('../../src/config.js?v=' + Math.random())
    expect(config.trackedDependencies).toEqual([
      { ecosystem: 'npm', packageName: 'valid' },
      { ecosystem: 'npm', packageName: 'also-valid' },
    ])
  })

  it('trims whitespace from entries in TRACKED_DEPENDENCIES', async () => {
    process.env.TRACKED_DEPENDENCIES = ' npm : govuk-frontend , npm : hapi '
    const { config } = await import('../../src/config.js?v=' + Math.random())
    expect(config.trackedDependencies).toEqual([
      { ecosystem: 'npm', packageName: 'govuk-frontend' },
      { ecosystem: 'npm', packageName: 'hapi' },
    ])
  })
})
