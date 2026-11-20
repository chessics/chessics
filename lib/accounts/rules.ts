export type AccountPlatform = 'chess_com' | 'lichess'

export interface LinkedAccount {
  id: string
  platform: AccountPlatform
  username: string
  created_at: string
}

export const ACTIVE_ACCOUNT_COOKIE = 'chessics_account'

export const MAX_LINKED_ACCOUNTS = 6

const NAME_PATTERN = /^[A-Za-z0-9_-]{2,30}$/

export const PLATFORM_LABEL: Record<AccountPlatform, string> = { chess_com: 'Chess.com', lichess: 'Lichess' }

export function isAccountPlatform(v: unknown): v is AccountPlatform {
  return v === 'chess_com' || v === 'lichess'
}

export function cleanUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.trim()
  return NAME_PATTERN.test(name) ? name : null
}

export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function findAccount(
  accounts: readonly LinkedAccount[],
  platform: string,
  username: string
): LinkedAccount | null {
  return accounts.find((a) => a.platform === platform && sameName(a.username, username)) ?? null
}

export function pickActive(accounts: readonly LinkedAccount[], cookieValue: string | null | undefined): LinkedAccount | null {
  if (accounts.length === 0) return null
  const named = cookieValue ? accounts.find((a) => a.id === cookieValue) : undefined
  if (named) return named
  return [...accounts].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0]
}

export function syncTarget(
  accounts: readonly LinkedAccount[],
  platform: AccountPlatform,
  username: string
): { kind: 'linked'; account: LinkedAccount } | { kind: 'link_first' } | { kind: 'foreign' } {
  const linked = findAccount(accounts, platform, username)
  if (linked) return { kind: 'linked', account: linked }
  if (!accounts.some((a) => a.platform === platform)) return { kind: 'link_first' }
  return { kind: 'foreign' }
}

export function accountLabel(a: Pick<LinkedAccount, 'platform' | 'username'>): string {
  return `${a.username} · ${PLATFORM_LABEL[a.platform]}`
}

export function onAccount<Q>(query: Q, accountId: string | null | undefined, column = 'account_id'): Q {
  if (accountId === undefined) return query
  const q = query as unknown as { eq: (col: string, v: string) => Q }
  return q.eq(column, accountId ?? NO_ACCOUNT)
}

export const NO_ACCOUNT = '00000000-0000-0000-0000-000000000000'
