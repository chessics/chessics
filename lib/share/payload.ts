import { Chess } from 'chess.js'
import { one, type OneOrMany } from '@/lib/supabase/embed'

export const SHARE_POSITION_PUBLIC_COLUMNS = ['fen', 'side_to_move', 'root_move_san'] as const

export const SHARE_POSITION_WITHHELD_COLUMNS = [
  'id',
  'game_id',
  'root_ply',
  'tag',
  'best_move',
  'best_move_san',
  'pv',
  'eval_cp',
  'refutation_line',
  'refutation_evals',
  'span_plies',
  'time_floor_ms',
  'engine',
  'depth',
  'created_at',
] as const

export const SHARE_ROW_COLUMNS = ['id', 'position_id', 'user_id', 'created_at', 'revoked_at'] as const

export const SHARE_ROW_PUBLIC_COLUMNS = ['id'] as const

export const SHARE_ROW_WITHHELD_COLUMNS = ['position_id', 'user_id', 'created_at', 'revoked_at'] as const

export const SHARE_PUBLIC_SELECT = `${SHARE_ROW_PUBLIC_COLUMNS.join(', ')}, training_positions!inner(${SHARE_POSITION_PUBLIC_COLUMNS.join(', ')})`

export const SHARE_PUBLIC_KEYS = ['slug', 'fen', 'side_to_move', 'game_move_san', 'game_move_uci'] as const

export interface PublicShare {
  slug: string
  fen: string
  side_to_move: 'white' | 'black'
  game_move_san: string
  game_move_uci: string
}

export interface PublicShareRow {
  id: string
  training_positions: OneOrMany<{ fen: string; side_to_move: string; root_move_san: string }>
}

function sanToUci(fen: string, san: string): { uci: string; san: string } | null {
  try {
    const m = new Chess(fen).move(san)
    return m ? { uci: `${m.from}${m.to}${m.promotion ?? ''}`, san: m.san } : null
  } catch {
    return null
  }
}

export function toPublicShare(row: PublicShareRow | null | undefined): PublicShare | null {
  if (!row) return null
  const p = one(row.training_positions)
  if (!p || typeof p.fen !== 'string' || typeof p.root_move_san !== 'string') return null
  const move = sanToUci(p.fen, p.root_move_san)
  if (!move) return null
  return {
    slug: row.id,
    fen: p.fen,
    side_to_move: p.side_to_move === 'black' ? 'black' : 'white',
    game_move_san: move.san,
    game_move_uci: move.uci,
  }
}

export function isShareable(p: { eval_cp: number | null; best_move: string | null }): boolean {
  return typeof p.eval_cp === 'number' && p.eval_cp > 0 && typeof p.best_move === 'string' && p.best_move.length > 0
}
