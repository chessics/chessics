import { isShareable } from './payload'
import { newShareSlug } from './slug'

export type CreateShareResult =
  | { kind: 'created'; slug: string }
  | { kind: 'existing'; slug: string }
  | { kind: 'revoked' }
  | { kind: 'not_found' }
  | { kind: 'not_shareable' }
  | { kind: 'answer_first' }
  | { kind: 'error'; step: string }

export const SLUG_ATTEMPTS = 3

type Err = { message?: string; code?: string } | null

interface Chain {
  eq(column: string, value: string): Chain
  limit(n: number): PromiseLike<{ data: unknown[] | null; error: Err }>
  maybeSingle(): PromiseLike<{ data: unknown; error: Err }>
}

export interface CreateShareDb {
  from(table: string): {
    select(columns: string): unknown
    insert(row: Record<string, unknown>): PromiseLike<{ error: Err }>
  }
}

type Existing = { kind: 'existing'; slug: string } | { kind: 'revoked' } | { kind: 'none' } | { kind: 'error' }

async function existingShare(db: CreateShareDb, userId: string, positionId: string): Promise<Existing> {
  const q = db.from('shared_positions').select('id, revoked_at') as Chain
  const { data, error } = await q.eq('user_id', userId).eq('position_id', positionId).maybeSingle()
  if (error) return { kind: 'error' }
  const row = data as { id: string; revoked_at: string | null } | null
  if (!row) return { kind: 'none' }
  return row.revoked_at ? { kind: 'revoked' } : { kind: 'existing', slug: row.id }
}

export async function createShare(
  db: CreateShareDb,
  userId: string,
  positionId: string,
  makeSlug: () => string = newShareSlug
): Promise<CreateShareResult> {
  const before = await existingShare(db, userId, positionId)
  if (before.kind === 'error') return { kind: 'error', step: 'lookup share' }
  if (before.kind !== 'none') return before

  const positionQuery = db.from('training_positions').select('id, eval_cp, best_move') as Chain
  const { data: position, error: positionError } = await positionQuery.eq('id', positionId).maybeSingle()
  if (positionError) return { kind: 'error', step: 'lookup position' }
  if (!position) return { kind: 'not_found' }
  if (!isShareable(position as { eval_cp: number | null; best_move: string | null })) return { kind: 'not_shareable' }

  const answeredQuery = db.from('interactions').select('id') as Chain
  const { data: answered, error: answeredError } = await answeredQuery.eq('user_id', userId).eq('position_id', positionId).limit(1)
  if (answeredError) return { kind: 'error', step: 'lookup interaction' }
  if (!answered || answered.length === 0) return { kind: 'answer_first' }

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    const slug = makeSlug()
    const { error } = await db.from('shared_positions').insert({ id: slug, position_id: positionId, user_id: userId })
    if (!error) return { kind: 'created', slug }
    if (error.code !== '23505') return { kind: 'error', step: 'insert' }
    const after = await existingShare(db, userId, positionId)
    if (after.kind === 'error') return { kind: 'error', step: 'lookup share' }
    if (after.kind !== 'none') return after
  }
  return { kind: 'error', step: 'slug' }
}
