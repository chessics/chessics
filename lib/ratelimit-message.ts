export const TOO_MANY_REQUESTS_CODE = 'too_many_requests'

export const TOO_MANY_REQUESTS_MESSAGE = 'Too many requests just now. Try again in a minute.'

export const DAILY_CAP_CODE = 'daily_analysis_cap'

export function dailyCapMessage(seconds: number): string {
  const usedUp = "Today's free analyses are used up."
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86400) return usedUp
  if (seconds < 3600) return `${usedUp} It opens again in less than an hour.`
  const hours = Math.round(seconds / 3600)
  return `${usedUp} It opens again in about ${hours} ${hours === 1 ? 'hour' : 'hours'}.`
}

export function failureMessage(status: number, otherwise: string): string {
  return status === 429 ? TOO_MANY_REQUESTS_MESSAGE : otherwise
}
