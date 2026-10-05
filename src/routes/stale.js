import { getPRs } from '../services/prs.js'
import { filterPRsForTab } from '../services/pr-filters.js'
import { applyFilters, applySort, buildViewContext } from './helpers.js'

export default {
  method: 'GET',
  path: '/stale',
  options: { validate: { options: { allowUnknown: true }, failAction: 'ignore' } },
  async handler(request, h) {
    const { repo = '', author = '', sort = 'updated', dir = 'desc', groupBy = 'jira', cooldown } = request.query
    const cooldownFlag = cooldown === '1'
    const data = await getPRs()
    const basePRs = filterPRsForTab(data, 'stale')
    const prs = applySort(applyFilters(basePRs, { repo, author }), sort, dir)
    return h.view('stale', buildViewContext(data, prs, prs, { repo, author, sort, dir, groupBy }, '/stale', 'Stale PRs', 'Pull requests with no activity for more than 14 days.', cooldownFlag))
  },
}
