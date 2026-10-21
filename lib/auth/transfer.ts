export const GUEST_SESSION_KEY = 'chessics_session'

export type TransferOutcome =
  | 'none'
  | 'transferred'
  | 'not_ready'
  | 'gone'
  | 'failed'

export const GONE_CHECK_STATUSES: readonly string[] = ['failed', 'lost', 'not_found']

type SessionStorage = Pick<Storage, 'getItem' | 'removeItem'>

let inFlight: Promise<TransferOutcome> | null = null

export function transferGuestSession(
  storage?: SessionStorage,
  doFetch: typeof fetch = fetch
): Promise<TransferOutcome> {
  if (!inFlight) inFlight = run(storage, doFetch).finally(() => (inFlight = null))
  return inFlight
}

async function run(storage: SessionStorage | undefined, doFetch: typeof fetch): Promise<TransferOutcome> {
  let store: SessionStorage
  let saved: { sessionToken?: string; jobId?: string; authed?: boolean } | null
  try {
    store = storage ?? window.localStorage
    const raw = store.getItem(GUEST_SESSION_KEY)
    saved = raw ? (JSON.parse(raw) as typeof saved) : null
  } catch {
    return 'none'
  }
  const sessionToken = saved?.sessionToken
  if (!sessionToken) return 'none'
  if (saved?.authed === true) return 'none'

  let res: Response
  try {
    res = await doFetch('/api/auth/transfer-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken }),
    })
  } catch {
    return 'failed'
  }

  if (res.ok) {
    try {
      store.removeItem(GUEST_SESSION_KEY)
    } catch {
    }
    return 'transferred'
  }
  if (res.status === 404) {
    if (!(await nothingIsComing(sessionToken, saved?.jobId, doFetch))) return 'not_ready'
    try {
      store.removeItem(GUEST_SESSION_KEY)
    } catch {
    }
    return 'gone'
  }
  return res.status === 409 || res.status === 429 ? 'not_ready' : 'failed'
}

async function nothingIsComing(
  sessionToken: string,
  jobId: string | undefined,
  doFetch: typeof fetch
): Promise<boolean> {
  const params = new URLSearchParams({ sessionToken })
  if (jobId) params.set('jobId', jobId)
  try {
    const res = await doFetch(`/api/guest/check?${params}`)
    if (!res.ok) return false
    const body = (await res.json()) as { status?: unknown }
    return typeof body?.status === 'string' && GONE_CHECK_STATUSES.includes(body.status)
  } catch {
    return false
  }
}
