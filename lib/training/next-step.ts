import { toPublicPosition } from './position-payload'
import { qualityFilter, type QueueCandidate, type ServedPosition } from './queue'
import { nextSessionStep, openLoopSentence, orderPoolForSession, type HistoryRow } from './session'
import type { NextResponse } from './api-types'

export interface NextStepRow {
  id: string
  game_id: string
  root_ply: number
  fen: string
  side_to_move: string
  tag: string | null
  eval_cp: number | null
  best_move: string | null
  refutation_line: string[] | null
  refutation_evals: number[] | null
  span_plies: number
  played_at?: string | null
}

export const TRAINING_QUEUE_SELECT =
  'id, game_id, root_ply, fen, side_to_move, tag, eval_cp, best_move, refutation_line, refutation_evals, span_plies, games(played_at)'

export type QueueSelectRow = Omit<NextStepRow, 'played_at'> & {
  games: { played_at: string | null } | { played_at: string | null }[] | null
}

export function fromQueueSelectRow(r: QueueSelectRow): NextStepRow {
  const { games, ...rest } = r
  const game = Array.isArray(games) ? games[0] : games
  return { ...rest, played_at: game?.played_at ?? null }
}

export function sortNewestGameFirst<T extends Pick<NextStepRow, 'played_at' | 'root_ply'>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const da = a.played_at ?? null
    const db = b.played_at ?? null
    if (da === null && db === null) return 0
    if (da === null) return 1
    if (db === null) return -1
    if (da !== db) return Date.parse(db) - Date.parse(da)
    return a.root_ply - b.root_ply
  })
}

export interface NextStepInteraction {
  position_id: string
  session_id: string
  chosen_move?: string | null
  correct: boolean | null
  presentation_index: number
  at: number
}

export const NOTHING_TO_TRAIN =
  'Nothing to train yet. Analyse a batch of games, and the positions where you were ahead before a slide land here.'

export function nextStepBody(
  rows: NextStepRow[],
  interactions: NextStepInteraction[],
  sessionId: string,
  startedAt: number
): NextResponse {
  const byId = new Map(rows.map(r => [r.id, r]))

  const candidates: QueueCandidate[] = sortNewestGameFirst(rows).map(r => ({
    id: r.id,
    game_id: r.game_id,
    tag: r.tag,
    eval_cp: r.eval_cp,
    best_move: r.best_move,
    refutation_line: r.refutation_line ?? [],
    refutation_evals: r.refutation_evals ?? [],
    span_plies: r.span_plies,
  }))

  const history: HistoryRow[] = interactions
    .filter(i => i.session_id !== sessionId)
    .map(i => ({ position_id: i.position_id, session_id: i.session_id, correct: i.correct, at: i.at }))

  const sessionRows = interactions
    .filter(i => i.session_id === sessionId)
    .sort((a, b) => a.presentation_index - b.presentation_index)

  const sessionServed: ServedPosition[] = sessionRows.map(i => ({
    position_id: i.position_id,
    tag: byId.get(i.position_id)?.tag ?? null,
    game_id: byId.get(i.position_id)?.game_id ?? '',
    correct: i.correct,
  }))

  const pool = orderPoolForSession(qualityFilter(candidates).accepted, history, startedAt)
  const step = nextSessionStep(pool, sessionServed)

  if (step.kind === 'serve') {
    const row = byId.get(step.position.id)!
    return { position: toPublicPosition({ id: row.id, fen: row.fen, side_to_move: row.side_to_move }) }
  }

  if (step.reason === 'empty' && sessionRows.length === 0) {
    return { done: true, open_loop: NOTHING_TO_TRAIN }
  }

  return {
    done: true,
    open_loop: openLoopSentence(
      sessionRows.map(i => ({
        position_id: i.position_id,
        correct: i.correct,
        tag: byId.get(i.position_id)?.tag ?? null,
        root_ply: byId.get(i.position_id)?.root_ply ?? 1,
      }))
    ),
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

export function clampStartedAt(param: string | null, now: number): number {
  const n = Number(param)
  return Number.isFinite(n) && n <= now && n >= now - DAY_MS ? n : now
}

export const SESSION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
