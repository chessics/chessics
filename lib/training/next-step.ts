import { toPublicPosition } from './position-payload'
import { qualityFilter, type QueueCandidate, type ServedPosition } from './queue'
import { nextSessionStep, openLoopSentence, orderPoolForSession, type HistoryRow } from './session'
import type { NextResponse } from './api-types'
import { asksForReason } from './reason'
import { one, type OneOrMany } from '@/lib/supabase/embed'
import { gamesByPliesQueries } from '@/lib/supabase/row-cap'
import { preTerminalEvalFromRow, toUserEval } from '@/lib/chains/stands-alone'

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
  chain_root_plies?: number[] | null
  pre_terminal_eval_cp?: number | null
}

export const TRAINING_QUEUE_SELECT =
  'id, game_id, root_ply, fen, side_to_move, tag, eval_cp, best_move, refutation_line, refutation_evals, span_plies, games(played_at, game_analyses(causal_chains(root_move_ply)))'

type EmbeddedAnalysis = { causal_chains?: { root_move_ply: number }[] | null }
type EmbeddedGame = { played_at: string | null; game_analyses?: OneOrMany<EmbeddedAnalysis> }

export type QueueSelectRow = Omit<NextStepRow, 'played_at' | 'chain_root_plies'> & {
  games: OneOrMany<EmbeddedGame>
}

export function fromQueueSelectRow(r: QueueSelectRow): NextStepRow {
  const { games, ...rest } = r
  const game = one(games)
  const analysis = one(game?.game_analyses)
  return {
    ...rest,
    played_at: game?.played_at ?? null,
    chain_root_plies: analysis ? (analysis.causal_chains ?? []).map(c => c.root_move_ply) : null,
  }
}

export function isStaleRoot(row: Pick<NextStepRow, 'root_ply' | 'chain_root_plies'>): boolean {
  if (row.chain_root_plies === null || row.chain_root_plies === undefined) return false
  return !row.chain_root_plies.includes(row.root_ply)
}

export interface MoveEvalRow {
  game_id: string
  ply_number: number
  eval_before: number | null
}

export function preTerminalLookups(rows: NextStepRow[]): { gameIds: string[]; plies: number[] } {
  const games = new Set<string>()
  const plies = new Set<number>()
  for (const r of rows) {
    if (r.chain_root_plies === null || r.chain_root_plies === undefined) continue
    if (r.span_plies < 2) continue
    if (preTerminalEvalFromRow(r.span_plies, r.refutation_evals ?? []) !== null) continue
    games.add(r.game_id)
    plies.add(r.root_ply + r.span_plies)
  }
  return { gameIds: Array.from(games), plies: Array.from(plies) }
}

export function preTerminalQueries(lookups: { gameIds: string[]; plies: number[] }): { gameIds: string[]; plies: number[] }[] {
  return gamesByPliesQueries(lookups.gameIds, lookups.plies)
}

export function withPreTerminalEvals(rows: NextStepRow[], moves: MoveEvalRow[]): NextStepRow[] {
  const at = new Map(moves.map(m => [`${m.game_id}:${m.ply_number}`, m.eval_before]))
  return rows.map(r => {
    if (preTerminalEvalFromRow(r.span_plies, r.refutation_evals ?? []) !== null) return r
    const cp = at.get(`${r.game_id}:${r.root_ply + r.span_plies}`)
    if (cp === null || cp === undefined || !Number.isFinite(cp)) return r
    const color = r.side_to_move === 'black' ? 'black' : 'white'
    return { ...r, pre_terminal_eval_cp: toUserEval(cp, color) }
  })
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

export { NOTHING_TO_TRAIN } from './empty'
import { NOTHING_TO_TRAIN } from './empty'

export interface NextStepOptions {
  reasonGate?: boolean
  standaloneBlunders?: boolean
}

export function isStandaloneBlunderRow(row: Pick<NextStepRow, 'span_plies'>): boolean {
  return row.span_plies === 0
}

export function entersPool(row: NextStepRow, options: NextStepOptions = {}): boolean {
  if (isStandaloneBlunderRow(row)) return options.standaloneBlunders === true
  return !isStaleRoot(row)
}

export function nextStepBody(
  rows: NextStepRow[],
  interactions: NextStepInteraction[],
  sessionId: string,
  startedAt: number,
  options: NextStepOptions = {}
): NextResponse {
  const byId = new Map(rows.map(r => [r.id, r]))

  const candidates: QueueCandidate[] = sortNewestGameFirst(rows.filter(r => entersPool(r, options))).map(r => ({
    id: r.id,
    game_id: r.game_id,
    tag: r.tag,
    eval_cp: r.eval_cp,
    best_move: r.best_move,
    refutation_line: r.refutation_line ?? [],
    refutation_evals: r.refutation_evals ?? [],
    span_plies: r.span_plies,
    pre_terminal_eval_cp: r.pre_terminal_eval_cp ?? null,
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
    const position = toPublicPosition({ id: row.id, fen: row.fen, side_to_move: row.side_to_move })
    if (!options.reasonGate) return { position }
    return {
      position: {
        position_id: position.position_id,
        fen: position.fen,
        side_to_move: position.side_to_move,
        ask_reason: asksForReason(sessionRows.length),
      },
    }
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
