import { getPRs } from '../services/prs.js'
import { getDependencies } from '../services/dependencies/index.js'
import { buildNavCounts, formatAge } from './helpers.js'
import { config } from '../config.js'

export default {
  method: 'GET',
  path: '/dependencies',
  async handler(request, h) {
    const prData = getPRs()
    const depData = await getDependencies()
    return h.view('dependencies', {
      title: 'Dependency Drift',
      currentPath: '/dependencies',
      navCounts: buildNavCounts(prData),
      org: config.org,
      team: config.team,
      fetchedAtFormatted: formatAge(depData.fetchedAt),
      ...depData,
    })
  },
}
