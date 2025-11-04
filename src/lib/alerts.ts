import { env } from '../env.js'

export interface SlackAlert {
  text: string
  channel?: string
  username?: string
  icon_emoji?: string
}

export async function sendSlackAlert(message: string, details?: Record<string, any>): Promise<void> {
  if (!env.SLACK_WEBHOOK_URL) {
    console.warn('Slack webhook not configured, skipping alert:', message)
    return
  }

  const payload: SlackAlert = {
    text: message,
    username: 'Hitcastor API',
    icon_emoji: ':warning:',
  }

  if (details) {
    payload.text += '\n```\n' + JSON.stringify(details, null, 2) + '\n```'
  }

  try {
    const response = await fetch(env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      console.error('Failed to send Slack alert:', response.status, response.statusText)
    }
  } catch (error) {
    console.error('Error sending Slack alert:', error)
  }
}

export async function alertJobFailure(jobName: string, marketId: string, error: Error): Promise<void> {
  await sendSlackAlert(
    `❌ Job failed: ${jobName}`,
    {
      marketId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    }
  )
}

export async function alertResolutionSuccess(marketId: string, outcome: number, stage: string): Promise<void> {
  const outcomeText = outcome === 1 ? 'YES' : 'NO'
  await sendSlackAlert(
    `✅ Resolution ${stage} successful for market ${marketId}`,
    {
      marketId,
      outcome: outcomeText,
      stage,
      timestamp: new Date().toISOString(),
    }
  )
}