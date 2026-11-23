import { blunderStandsAlone, preTerminalEvalFromRow } from '@/lib/chains/stands-alone'
import { shownTag } from './position-answer'

export interface RecurrenceRow {
  game_id: string
  tag: string | null
  span_plies?: number | null
  refutation_evals?: number[] | null
  fen?: string | null
  root_move_san?: string | null
}

function standsAlone(r: RecurrenceRow): boolean {
  const before = preTerminalEvalFromRow(r.span_plies ?? 0, r.refutation_evals ?? [])
  return before !== null && blunderStandsAlone(before)
}

export function gamesWithTag(rows: readonly RecurrenceRow[], tag: string): number {
  return new Set(rows.filter(r => r.tag === tag && shownTag(r) === tag && !standsAlone(r)).map(r => r.game_id)).size
}
