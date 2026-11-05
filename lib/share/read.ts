import { one, type OneOrMany } from '@/lib/supabase/embed'
import { isShareSlug } from './slug'
import { isShareable, SHARE_PUBLIC_SELECT, toPublicShare, type PublicShare, type PublicShareRow } from './payload'
import type { ShareAnswerSource } from './answer'

export const SHARE_ANSWER_SELECT =
  'id, training_positions!inner(fen, side_to_move, root_move_san, best_move, best_move_san, eval_cp)'

export type ShareRead<T> = { kind: 'found'; value: T } | { kind: 'missing' } | { kind: 'error' }

interface Filterable<R> {
  eq(column: string, value: string): Filterable<R>
  is(column: string, value: null): Filterable<R>
  gt(column: string, value: number): Filterable<R>
  not(column: string, operator: string, value: null): Filterable<R>
  maybeSingle(): PromiseLike<{ data: R | null; error: { message?: string; code?: string } | null }>
}

export interface ShareDb {
  from(table: 'shared_positions'): { select(columns: string): unknown }
}

function live<R>(q: Filterable<R>, slug: string): Filterable<R> {
  return q
    .eq('id', slug)
    .is('revoked_at', null)
    .gt('training_positions.eval_cp', 0)
    .not('training_positions.best_move', 'is', null)
}

async function readOne<R>(db: ShareDb, slug: string, select: string): Promise<ShareRead<R>> {
  if (!isShareSlug(slug)) return { kind: 'missing' }
  try {
    const query = db.from('shared_positions').select(select) as Filterable<R>
    const { data, error } = await live(query, slug).maybeSingle()
    if (error) return { kind: 'error' }
    return data ? { kind: 'found', value: data } : { kind: 'missing' }
  } catch {
    return { kind: 'error' }
  }
}

export async function loadPublicShare(db: ShareDb, slug: string): Promise<ShareRead<PublicShare>> {
  const r = await readOne<PublicShareRow>(db, slug, SHARE_PUBLIC_SELECT)
  if (r.kind !== 'found') return r
  const share = toPublicShare(r.value)
  return share ? { kind: 'found', value: share } : { kind: 'missing' }
}

interface AnswerRow {
  id: string
  training_positions: OneOrMany<{
    fen: string
    side_to_move: string
    root_move_san: string
    best_move: string | null
    best_move_san: string | null
    eval_cp: number | null
  }>
}

export async function loadShareAnswerSource(db: ShareDb, slug: string): Promise<ShareRead<ShareAnswerSource>> {
  const r = await readOne<AnswerRow>(db, slug, SHARE_ANSWER_SELECT)
  if (r.kind !== 'found') return r
  const p = one(r.value.training_positions)
  if (!p || !isShareable(p) || typeof p.fen !== 'string' || typeof p.root_move_san !== 'string') return { kind: 'missing' }
  return {
    kind: 'found',
    value: {
      fen: p.fen,
      side_to_move: p.side_to_move === 'black' ? 'black' : 'white',
      root_move_san: p.root_move_san,
      best_move: p.best_move as string,
      best_move_san: p.best_move_san,
      eval_cp: p.eval_cp as number,
    },
  }
}
