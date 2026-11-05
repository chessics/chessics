import type { PlayRow } from './move'

export const PLAY_TABLE = 'play_sessions'

const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

export type LogResult = { logged: true } | { logged: false; reason: 'no_table' | 'error' }

interface Inserter {
  from(table: string): {
    upsert(row: PlayRow, opts: { onConflict: string; ignoreDuplicates: boolean }): PromiseLike<{ error: { code?: string; message?: string } | null }>
  }
}

let warnedMissing = false

export async function recordPlay(client: unknown, row: PlayRow): Promise<LogResult> {
  const db = client as Inserter
  let error: { code?: string; message?: string } | null
  try {
    ;({ error } = await db.from(PLAY_TABLE).upsert(row, { onConflict: 'id', ignoreDuplicates: true }))
  } catch (err) {
    console.error('[play] could not write the play-out row:', err)
    return { logged: false, reason: 'error' }
  }
  if (!error) return { logged: true }
  if (error.code && MISSING_TABLE.has(error.code)) {
    if (!warnedMissing) console.warn(`[play] ${PLAY_TABLE} does not exist yet (migration 014); play-outs are not logged`)
    warnedMissing = true
    return { logged: false, reason: 'no_table' }
  }
  console.error(`[play] could not write the play-out row: ${error.code ?? ''} ${error.message ?? ''}`)
  return { logged: false, reason: 'error' }
}

export function resetPlayLogWarningForTests(): void {
  warnedMissing = false
}
