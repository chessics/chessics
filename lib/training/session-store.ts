export const SESSION_KEY = 'chessics_train_session'

export interface StoredSession {
  id: string
  startedAt: number
  answered: boolean
}

export type SessionStore = Pick<Storage, 'getItem' | 'setItem'>

function save(store: SessionStore | null, s: StoredSession): void {
  try {
    store?.setItem(SESSION_KEY, JSON.stringify(s))
  } catch {
  }
}

export function newSession(store: SessionStore | null, now: number, uuid: () => string): StoredSession {
  const s = { id: uuid(), startedAt: now, answered: false }
  save(store, s)
  return s
}

export function loadSession(store: SessionStore | null, now: number, uuid: () => string): StoredSession {
  try {
    const raw = store?.getItem(SESSION_KEY)
    if (raw) {
      const s = JSON.parse(raw) as Partial<StoredSession>
      if (typeof s.id === 'string' && s.id && typeof s.startedAt === 'number') {
        return { id: s.id, startedAt: s.startedAt, answered: s.answered === true }
      }
    }
  } catch {
  }
  return newSession(store, now, uuid)
}

export function markAnswered(store: SessionStore | null, s: StoredSession): StoredSession {
  if (s.answered) return s
  const next = { ...s, answered: true }
  save(store, next)
  return next
}
