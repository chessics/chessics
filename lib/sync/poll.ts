import { TOO_MANY_REQUESTS_CODE, TOO_MANY_REQUESTS_MESSAGE } from '@/lib/ratelimit-message'

export const POLL_INTERVAL_MS = 2000

export const LOST_AFTER_404S = 3

export const UNREACHABLE_AFTER_FAILURES = 15

export type PollVerdict = 'continue' | 'lost' | 'unreachable'

export function pollVerdict(status: number | null, failures: number, notFound: number): PollVerdict {
  if (status === 200) return 'continue'
  if (status === 404 && notFound >= LOST_AFTER_404S) return 'lost'
  if (failures >= UNREACHABLE_AFTER_FAILURES) return 'unreachable'
  return 'continue'
}

export function statusSaysLost(body: unknown): boolean {
  return typeof body === 'object' && body !== null && (body as { lost?: unknown }).lost === true
}

export type GiveUpReason = 'analysis_lost' | 'status_unreachable'

export interface StatusPoller<T> {
  fetchStatus: () => Promise<Response>
  onStatus: (body: T) => void
  onGiveUp: (reason: GiveUpReason) => void
}

export function createStatusPoller<T>(p: StatusPoller<T>): () => Promise<void> {
  let failures = 0
  let notFound = 0
  let stopped = false

  const fail = (status: number | null) => {
    failures++
    notFound = status === 404 ? notFound + 1 : 0
    const verdict = pollVerdict(status, failures, notFound)
    if (verdict === 'continue') return
    stopped = true
    p.onGiveUp(verdict === 'lost' ? 'analysis_lost' : 'status_unreachable')
  }

  return async () => {
    if (stopped) return
    let res: Response
    try {
      res = await p.fetchStatus()
    } catch {
      return fail(null)
    }
    if (!res.ok) return fail(res.status)
    let body: T
    try {
      body = (await res.json()) as T
    } catch {
      return fail(null)
    }
    failures = 0
    notFound = 0
    if (statusSaysLost(body)) {
      stopped = true
      p.onGiveUp('analysis_lost')
      return
    }
    p.onStatus(body)
  }
}

const MESSAGES: Record<string, string> = {
  analysis_failed: "The analysis didn't finish. Run it again.",
  analysis_lost: 'The analysis stopped reporting progress and was lost. Run it again.',
  status_unreachable: "We couldn't reach the analysis status for 30 seconds. Run it again in a minute.",
  network_error: 'The connection dropped before the sync started. Try again.',
  sync_failed: "The sync didn't start. Try again.",
  [TOO_MANY_REQUESTS_CODE]: TOO_MANY_REQUESTS_MESSAGE,
  sign_up_for_larger_batches: 'Sign up to analyse 25, 50 or 100 games at a time.',
  no_rapid_blitz_games: 'That account has no rapid or blitz games to analyse yet.',
  no_games: 'That account has no games to analyse yet.',
  all_games_analysed: 'Every game in your library is analysed. Play a few more and come back.',
  not_your_username: 'That name is not the one on your account. Analyse it from the home page instead.',
  no_recent_rapid_blitz_games: "That account's recent months have no rapid or blitz games to analyse.",
  'Username not found': 'That username was not found. Check the spelling and the site.',
  'Rate limited, try again shortly': 'The chess site is rate limiting us. Try again in a minute.',
  'Failed to fetch games': "We couldn't fetch your games from the chess site. Try again.",
  'Failed to save games': "Your games were fetched but couldn't be saved. Try again.",
  'Failed to queue analysis job': "The analysis couldn't be queued. Try again in a minute.",
  'Failed to store guest games': "Your games were fetched but couldn't be stored. Try again.",
}

export function landingErrorMessage(code: string | null): string | null {
  if (!code) return null
  return MESSAGES[code] ?? 'Something went wrong. Try again.'
}
