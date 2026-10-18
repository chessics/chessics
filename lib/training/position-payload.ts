export const POSITION_PUBLIC_COLUMNS = ['id', 'fen', 'side_to_move'] as const

export const POSITION_WITHHELD_COLUMNS = [
  'game_id',
  'root_ply',
  'root_move_san',
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

export const POSITION_PUBLIC_SELECT = POSITION_PUBLIC_COLUMNS.join(', ')

export const POSITION_PUBLIC_KEYS = ['position_id', 'fen', 'side_to_move'] as const

export interface PublicPosition {
  position_id: string
  fen: string
  side_to_move: 'white' | 'black'
  ask_reason?: boolean
}

export const POSITION_REASON_KEY = 'ask_reason' as const

export interface PublicPositionRow {
  id: string
  fen: string
  side_to_move: string
}

export function toPublicPosition(row: PublicPositionRow): PublicPosition {
  return {
    position_id: row.id,
    fen: row.fen,
    side_to_move: row.side_to_move === 'black' ? 'black' : 'white',
  }
}

export const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
} as const
