export const GUEST_SESSION_KEY = 'chessics_session'

export type TransferOutcome =
  | 'none'
  | 'transferred'
  | 'not_ready'
  | 'failed'

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
  let sessionToken: string | undefined
  try {
    store = storage ?? window.localStorage
    const raw = store.getItem(GUEST_SESSION_KEY)
    sessionToken = raw ? (JSON.parse(raw) as { sessionToken?: string }).sessionToken : undefined
  } catch {
    return 'none'
  }
  if (!sessionToken) return 'none'

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
  return res.status === 404 || res.status === 409 || res.status === 429 ? 'not_ready' : 'failed'
}
