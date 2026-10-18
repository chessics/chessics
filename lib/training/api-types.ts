import type { PublicPosition } from './position-payload'
import type { SessionSummary } from './summary'
import type { Grading } from './grading'
import type { ReasonResult } from './reason'

export type NextResponse =
  | { position: PublicPosition }
  | { done: true; open_loop: string; summary?: SessionSummary }

export interface Recurrence {
  tag: string
  exposure_ordinal: number
  games_with_tag: number
  games_analysed: number
}

export interface CommitResponse {
  position_id: string
  correct: boolean | null
  under_floor: boolean
  best_move: string | null
  best_move_san: string | null
  pv: string[]
  eval_cp: number | null
  tag: string | null
  refutation_line: string[]
  refutation_evals: number[]
  root_move_san: string
  root_move_uci: string | null
  grading: Omit<Grading, 'correct'>
  recurrence: Recurrence | null
  reason?: ReasonResult | null
  receipt: {
    engine: string | null
    depth: number | null
    eval_cp: number | null
    tag: string | null
    span_plies: number
  }
}

export type TrainingMode = 'live' | 'fixture'

export function nextUrl(mode: TrainingMode, sessionId: string, startedAt: number): string {
  const base = mode === 'live' ? '/api/training/next' : '/api/dev/training/next'
  return `${base}?session_id=${encodeURIComponent(sessionId)}&started=${startedAt}`
}

export function commitUrl(mode: TrainingMode, positionId: string): string {
  return mode === 'live'
    ? `/api/position/${encodeURIComponent(positionId)}/commit`
    : `/api/dev/training/commit/${encodeURIComponent(positionId)}`
}
