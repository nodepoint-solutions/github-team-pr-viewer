import { config } from '../config.js'
import { getPRs } from '../services/prs.js'
import { filterPRsForTab } from '../services/pr-filters.js'
import { applyFilters, applySort, buildViewContext } from './helpers.js'

export default {
  method: 'GET',
  path: '/all',
  options: { validate: { options: { allowUnknown: true }, failAction: 'ignore' } },
  async handler(request, h) {
    const { repo = '', author = '', sort = 'updated', dir = 'desc', groupBy = 'jira', cooldown } = request.query
    const cooldownFlag = cooldown === '1'
    const data = await getPRs()
    const basePRs = filterPRsForTab(data, 'all')
    const prs = applySort(applyFilters(basePRs, { repo, author }), sort, dir)
    return h.view('all', buildViewContext(data, prs, prs, { repo, author, sort, dir, groupBy }, '/all', 'All PRs', `All open pull requests across ${config.org}/${config.team} team repositories.`, cooldownFlag))
  },
}
