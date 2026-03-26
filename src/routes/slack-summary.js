import { config } from '../config.js'
import { sendSlackSummary, wasAlreadySentThisHour } from '../services/slack.js'

export default {
  method: 'POST',
  path: '/slack-summary',
  async handler(request, h) {
    if (!config.slackBotToken || !config.slackChannelId) {
      return h.redirect('/?slack=not-configured')
    }
    if (wasAlreadySentThisHour()) {
      return h.redirect('/?slack=cooldown')
    }
    sendSlackSummary().catch((err) => console.error('Manual Slack summary failed:', err.message))
    return h.redirect('/?slack=sent')
  },
}
