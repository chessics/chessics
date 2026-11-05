import { Chess } from 'chess.js'
import { clockAtPly, parseClocks, parseTimeControl, pgnHeader, timeSpent, type ClockTimeControl } from '@/lib/clock'
import { opponentSpent, type Spent } from './think-time'
import type { Side } from './game'

export type TimeControl = ClockTimeControl

export interface ClocksAt {
  white: number
  black: number
  source: 'pgn' | 'time_control'
}

function startClocksAt(pgn: string, recordUsable: boolean, ply: number, tc: TimeControl | null): ClocksAt | null {
  if (!tc) return null
  const base: ClocksAt = { white: tc.baseMs, black: tc.baseMs, source: 'time_control' }
  if (!recordUsable) return base
  const at = clockAtPly(pgn, ply + 1)
  const white = ply >= 1 ? at.white : tc.baseMs
  const black = ply >= 2 ? at.black : tc.baseMs
  return white === null || black === null ? base : { white, black, source: 'pgn' }
}

export interface PlayGameRow {
  id: string
  pgn: string
  user_color: string | null
  user_rating_at_time: number | null
  opponent_rating_at_time: number | null
  time_control: string | null
  opponent_username: string | null
}

export const PLAY_GAME_SELECT =
  'id, pgn, user_color, user_rating_at_time, opponent_rating_at_time, time_control, opponent_username'

export const DEFAULT_ENGINE_ELO = 1500
export const ENGINE_ELO_MIN = 400
export const ENGINE_ELO_MAX = 3200

export interface PlayContext {
  gameId: string
  startPly: number
  initialFen: string
  prefix: string[]
  startFen: string
  userColor: Side
  userElo: number | null
  opponentElo: number | null
  engineElo: number
  userEloForEngine: number
  opponentName: string | null
  timeControl: TimeControl | null
  startClocks: ClocksAt | null
  opponentSpent: Spent[]
}

export type ContextError = 'bad_pgn' | 'no_color' | 'ply_out_of_range' | 'game_over' | 'setup_position'

export type ContextResult = { ok: true; context: PlayContext } | { ok: false; error: ContextError }

const clampElo = (x: number) => Math.min(ENGINE_ELO_MAX, Math.max(ENGINE_ELO_MIN, Math.round(x)))

export function resolveElos(user: number | null, opponent: number | null): { engine: number; user: number } {
  const u = user ?? opponent ?? DEFAULT_ENGINE_ELO
  const o = opponent ?? user ?? DEFAULT_ENGINE_ELO
  return { engine: clampElo(o), user: clampElo(u) }
}

function headerElo(pgn: string, side: Side): number | null {
  const v = pgnHeader(pgn, side === 'white' ? 'WhiteElo' : 'BlackElo')
  const n = v === null ? NaN : Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

const uciOf = (m: { from: string; to: string; promotion?: string }) => m.from + m.to + (m.promotion ?? '')

export function buildPlayContext(row: PlayGameRow, ply: number): ContextResult {
  if (row.user_color !== 'white' && row.user_color !== 'black') return { ok: false, error: 'no_color' }
  const userColor: Side = row.user_color
  if (!Number.isInteger(ply) || ply < 0) return { ok: false, error: 'ply_out_of_range' }

  const game = new Chess()
  try {
    game.loadPgn(row.pgn)
  } catch {
    return { ok: false, error: 'bad_pgn' }
  }
  if (game.header().FEN) return { ok: false, error: 'setup_position' }

  const history = game.history({ verbose: true })
  if (ply > history.length) return { ok: false, error: 'ply_out_of_range' }

  const start = new Chess()
  const initialFen = start.fen()
  const prefix = history.slice(0, ply).map(uciOf)
  for (const m of history.slice(0, ply)) start.move(m.san)
  if (start.isGameOver()) return { ok: false, error: 'game_over' }

  const tc = parseTimeControl(pgnHeader(row.pgn, 'TimeControl')) ?? parseTimeControl(row.time_control)
  const parsed = parseClocks(row.pgn)
  const recordUsable = parsed.length === history.length && parsed.some(c => c !== null)
  const clocks = recordUsable ? parsed : history.map(() => null)
  const spent = tc ? timeSpent(clocks, tc.incrementMs) : clocks.map(() => null)

  const userElo = row.user_rating_at_time ?? headerElo(row.pgn, userColor)
  const oppColor: Side = userColor === 'white' ? 'black' : 'white'
  const opponentElo = row.opponent_rating_at_time ?? headerElo(row.pgn, oppColor)
  const elos = resolveElos(userElo, opponentElo)

  return {
    ok: true,
    context: {
      gameId: row.id,
      startPly: ply,
      initialFen,
      prefix,
      startFen: start.fen(),
      userColor,
      userElo,
      opponentElo,
      engineElo: elos.engine,
      userEloForEngine: elos.user,
      opponentName: row.opponent_username,
      timeControl: tc,
      startClocks: startClocksAt(row.pgn, recordUsable, ply, tc),
      opponentSpent: opponentSpent(spent, userColor),
    },
  }
}

export function contextFromPosition(p: {
  gameId: string
  startPly: number
  fen: string
  userColor: Side
  timeControl: string | null
  userElo: number | null
  opponentElo: number | null
  opponentName: string | null
}): PlayContext {
  const tc = parseTimeControl(p.timeControl)
  const elos = resolveElos(p.userElo, p.opponentElo)
  return {
    gameId: p.gameId,
    startPly: p.startPly,
    initialFen: p.fen,
    prefix: [],
    startFen: p.fen,
    userColor: p.userColor,
    userElo: p.userElo,
    opponentElo: p.opponentElo,
    engineElo: elos.engine,
    userEloForEngine: elos.user,
    opponentName: p.opponentName,
    timeControl: tc,
    startClocks: tc ? { white: tc.baseMs, black: tc.baseMs, source: 'time_control' } : null,
    opponentSpent: [],
  }
}

export interface PlayedMove {
  ply: number
  uci: string
  san: string
  by: 'user' | 'engine'
  ms: number
}

export type ReplayResult =
  | { ok: true; chess: Chess; played: PlayedMove[] }
  | { ok: false; error: 'illegal_move'; index: number }

export function replayPlayout(ctx: PlayContext, moves: { uci: string; ms: number }[]): ReplayResult {
  const chess = new Chess(ctx.initialFen)
  for (const uci of ctx.prefix) chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  const played: PlayedMove[] = []
  for (let i = 0; i < moves.length; i++) {
    const { uci, ms } = moves[i]
    const mover: Side = chess.turn() === 'w' ? 'white' : 'black'
    let san: string
    try {
      san = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
    } catch {
      return { ok: false, error: 'illegal_move', index: i }
    }
    played.push({ ply: ctx.startPly + i + 1, uci, san, by: mover === ctx.userColor ? 'user' : 'engine', ms })
  }
  return { ok: true, chess, played }
}
