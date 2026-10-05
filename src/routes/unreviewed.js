import { getPRs } from '../services/prs.js'
import { filterPRsForTab } from '../services/pr-filters.js'
import { applyFilters, applySort, buildViewContext } from './helpers.js'

export default {
  method: 'GET',
  path: '/unreviewed',
  options: { validate: { options: { allowUnknown: true }, failAction: 'ignore' } },
  async handler(request, h) {
    const { repo = '', author = '', sort = 'updated', dir = 'desc', groupBy = 'jira', cooldown } = request.query
    const cooldownFlag = cooldown === '1'
    const data = await getPRs()
    const basePRs = filterPRsForTab(data, 'unreviewed')
    const prs = applySort(applyFilters(basePRs, { repo, author }), sort, dir)
    return h.view('unreviewed', buildViewContext(data, prs, prs, { repo, author, sort, dir, groupBy }, '/unreviewed', 'Needs review - All PRs', 'All pull requests across the org that have not received any review.', cooldownFlag))
  },
}
