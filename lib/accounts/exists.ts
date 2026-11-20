import type { AccountPlatform } from './rules'

export type NameCheck =
  | { kind: 'found'; username: string }
  | { kind: 'not_found' }
  | { kind: 'unknown' }

const TIMEOUT_MS = 5000
const HEADERS = { 'User-Agent': 'Chessics/1.0', Accept: 'application/json' }

export async function checkName(
  platform: AccountPlatform,
  username: string,
  fetchImpl: typeof fetch = fetch
): Promise<NameCheck> {
  const url =
    platform === 'chess_com'
      ? `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}`
      : `https://lichess.org/api/user/${encodeURIComponent(username)}`
  let res: Response
  try {
    res = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
  } catch {
    return { kind: 'unknown' }
  }
  if (res.status === 404 || res.status === 410) return { kind: 'not_found' }
  if (!res.ok) return { kind: 'unknown' }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { kind: 'unknown' }
  }
  if (isClosed(body)) return { kind: 'not_found' }
  return { kind: 'found', username: displayName(platform, username, body) }
}

export function isClosed(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const b = body as { closed?: unknown; disabled?: unknown; status?: unknown }
  return b.closed === true || b.disabled === true || (typeof b.status === 'string' && b.status.startsWith('closed'))
}

export function displayName(platform: AccountPlatform, typed: string, body: unknown): string {
  if (!body || typeof body !== 'object') return typed
  const b = body as { username?: unknown; url?: unknown }
  if (platform === 'lichess') {
    return typeof b.username === 'string' && b.username.toLowerCase() === typed.toLowerCase() ? b.username : typed
  }
  if (typeof b.url === 'string') {
    const tail = b.url.split('/').filter(Boolean).pop() ?? ''
    if (tail.toLowerCase() === typed.toLowerCase()) return tail
  }
  return typed
}
