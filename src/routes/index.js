import { getPRs, isBot } from '../services/prs.js'
import { applyFilters, applySort, buildViewContext } from './helpers.js'

export default {
  method: 'GET',
  path: '/',
  async handler(request, h) {
    const { repo = '', author = '', sort = 'updated', dir = 'desc', cooldown } = request.query
    const cooldownFlag = cooldown === '1'
    const data = await getPRs()

    const basePRs = data.prs.filter(
      (pr) => data.teamMembers.has(pr.author) && !isBot({ type: pr.authorType, login: pr.author })
    )

    const prs = applySort(applyFilters(basePRs, { repo, author }), sort, dir)

    return h.view('index', buildViewContext(data, prs, prs, { repo, author, sort, dir }, '/', 'Team PRs', 'Pull requests opened by members of the DEFRA/forms team.', cooldownFlag))
  },
}
