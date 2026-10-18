export const TOO_MANY_REQUESTS_CODE = 'too_many_requests'

export const TOO_MANY_REQUESTS_MESSAGE = 'Too many requests just now. Try again in a minute.'

export function failureMessage(status: number, otherwise: string): string {
  return status === 429 ? TOO_MANY_REQUESTS_MESSAGE : otherwise
}
