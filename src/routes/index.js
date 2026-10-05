import { getPRs } from '../services/prs.js'
import { filterPRsForTab } from '../services/pr-filters.js'
import { applyFilters, applySort, buildViewContext } from './helpers.js'
import { config } from '../config.js'

export default {
  method: 'GET',
  path: '/',
  async handler(request, h) {
    const { repo = '', author = '', sort = 'updated', dir = 'desc', groupBy = 'jira', cooldown, slack } = request.query
    const cooldownFlag = cooldown === '1'
    const slackEnabled = !!(config.slackBotToken && config.slackChannelId)
    const data = await getPRs()

    const basePRs = filterPRsForTab(data, 'team')

    const prs = applySort(applyFilters(basePRs, { repo, author }), sort, dir)

    return h.view('index', buildViewContext(data, prs, prs, { repo, author, sort, dir, groupBy }, '/', 'Needs review - Team PRs', `Pull requests opened by members of the ${config.org}/${config.team} team that need review.`, cooldownFlag, slack ?? null, slackEnabled))
  },
}
