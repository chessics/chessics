import { ACTIVE_ACCOUNT_COOKIE } from './rules'

export function activeCookie(accountId: string) {
  return {
    name: ACTIVE_ACCOUNT_COOKIE,
    value: accountId,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 365 * 86_400,
  }
}
