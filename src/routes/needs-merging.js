import { getPRs } from '../services/prs.js'
import { filterPRsForTab } from '../services/pr-filters.js'
import { applyFilters, applySort, buildViewContext } from './helpers.js'

export default {
  method: 'GET',
  path: '/needs-merging',
  options: { validate: { options: { allowUnknown: true }, failAction: 'ignore' } },
  async handler(request, h) {
    const { repo = '', author = '', sort = 'updated', dir = 'desc', groupBy = 'jira', cooldown } = request.query
    const cooldownFlag = cooldown === '1'
    const data = await getPRs()

    const basePRs = filterPRsForTab(data, 'needsMerging')
    const prs = applySort(applyFilters(basePRs, { repo, author }), sort, dir)
    return h.view('needs-merging', buildViewContext(data, prs, prs, { repo, author, sort, dir, groupBy }, '/needs-merging', 'Needs merging', 'Pull requests that have been approved by a team member and are ready to merge.', cooldownFlag))
  },
}
