import { legalPolicy, MaiaError, sampleMove, type MaiaClient } from '@/lib/maia/client'
import { canMate, OUTCOMES, ruleOutcome, type Outcome, type Side } from './game'
import { replayPlayout, type PlayContext, type PlayedMove } from './context'
import { thinkTimeMs } from './think-time'
import type { EngineKind } from './engine'

export const PLAY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/

export const MAX_PLAYOUT_MOVES = 600
export const MAX_MOVE_MS = 86_400_000
export const PLAY_TEMPERATURE = 1

export interface ClientMove {
  uci: string
  ms: number
}

interface PlayBody {
  play_id: string
  game_id: string
  start_ply: number
  moves: ClientMove[]
}

export interface MoveBody extends PlayBody {
  engine_clock_ms: number | null
}

export const LOG_OUTCOMES = [...OUTCOMES, 'abandoned'] as const
export type LogOutcome = (typeof LOG_OUTCOMES)[number]

export interface EndBody extends PlayBody {
  outcome: LogOutcome
}

function parsePlayBody(raw: unknown): PlayBody | string {
  if (typeof raw !== 'object' || raw === null) return 'body must be an object'
  const b = raw as Record<string, unknown>
  if (typeof b.play_id !== 'string' || !PLAY_UUID.test(b.play_id)) return 'play_id must be a UUID'
  if (typeof b.game_id !== 'string' || b.game_id.length === 0 || b.game_id.length > 64) return 'game_id is required'
  if (typeof b.start_ply !== 'number' || !Number.isInteger(b.start_ply) || b.start_ply < 0) return 'start_ply must be a whole number'
  if (!Array.isArray(b.moves)) return 'moves must be an array'
  if (b.moves.length > MAX_PLAYOUT_MOVES) return `moves holds at most ${MAX_PLAYOUT_MOVES}`
  const moves: ClientMove[] = []
  for (const m of b.moves) {
    const uci = (m as ClientMove)?.uci
    const ms = (m as ClientMove)?.ms
    if (typeof uci !== 'string' || !UCI.test(uci)) return 'each move needs a UCI string'
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0 || ms > MAX_MOVE_MS) return 'each move needs ms, a time in milliseconds'
    moves.push({ uci, ms: Math.round(ms) })
  }
  return { play_id: b.play_id, game_id: b.game_id, start_ply: b.start_ply, moves }
}

export function parseMoveBody(raw: unknown): MoveBody | string {
  const base = parsePlayBody(raw)
  if (typeof base === 'string') return base
  const c = (raw as Record<string, unknown>).engine_clock_ms
  if (c !== null && (typeof c !== 'number' || !Number.isFinite(c) || c < 0)) return 'engine_clock_ms must be a time or null'
  return { ...base, engine_clock_ms: c === null ? null : Math.round(c) }
}

export function parseEndBody(raw: unknown): EndBody | string {
  const base = parsePlayBody(raw)
  if (typeof base === 'string') return base
  const o = (raw as Record<string, unknown>).outcome
  if (typeof o !== 'string' || !(LOG_OUTCOMES as readonly string[]).includes(o)) return 'outcome is not one this route knows'
  return { ...base, outcome: o as LogOutcome }
}

export interface Answer {
  status: number
  body: Record<string, unknown>
}

export interface MoveAnswerBody {
  move: { uci: string; san: string }
  think_ms: number
  think_basis: 'clock_record' | 'remaining' | 'untimed'
  engine: EngineKind
  model: string
  engine_elo: number
}

const sideToMove = (fen: string): Side => (fen.split(' ')[1] === 'b' ? 'black' : 'white')

export async function engineReply(
  ctx: PlayContext,
  body: MoveBody,
  client: MaiaClient,
  engine: EngineKind,
  rng: () => number
): Promise<Answer> {
  const replay = replayPlayout(ctx, body.moves)
  if (!replay.ok) return { status: 400, body: { error: 'illegal_move', index: replay.index } }
  const fen = replay.chess.fen()
  if (ruleOutcome(replay.chess, ctx.userColor) !== null) return { status: 400, body: { error: 'game_over' } }
  if (sideToMove(fen) === ctx.userColor) return { status: 409, body: { error: 'not_engine_turn' } }

  let move: { uci: string; san: string }
  let model: string
  try {
    const policy = legalPolicy(await client.policy({ fen, elo_self: ctx.engineElo, elo_oppo: ctx.userEloForEngine }), fen)
    if (policy.moves.length === 0) return { status: 503, body: { error: 'engine_unavailable', detail: 'no legal move in the policy' } }
    const picked = sampleMove(policy, rng, PLAY_TEMPERATURE)
    const san = replay.chess.move({ from: picked.uci.slice(0, 2), to: picked.uci.slice(2, 4), promotion: picked.uci[4] }).san
    move = { uci: picked.uci, san }
    model = policy.model
  } catch (err) {
    const code = err instanceof MaiaError ? err.code : 'unavailable'
    console.error(`[play] ${engine} engine did not answer: ${code}`, err instanceof Error ? err.message : err)
    return { status: 503, body: { error: 'engine_unavailable', detail: code } }
  }

  const think = thinkTimeMs({
    ply: ctx.startPly + body.moves.length + 1,
    remainingMs: ctx.startClocks ? body.engine_clock_ms : null,
    opponentSpent: ctx.opponentSpent,
    rng,
  })

  const answer: MoveAnswerBody = {
    move,
    think_ms: think.ms,
    think_basis: think.basis,
    engine,
    model,
    engine_elo: ctx.engineElo,
  }
  return { status: 200, body: answer as unknown as Record<string, unknown> }
}

export function outcomeAllowed(ctx: PlayContext, finalFen: string, rule: Outcome | null, outcome: LogOutcome): boolean {
  if (rule !== null) return outcome === rule
  const engineSide: Side = ctx.userColor === 'white' ? 'black' : 'white'
  switch (outcome) {
    case 'resigned':
    case 'abandoned':
      return true
    case 'loss_time':
      return canMate(finalFen, engineSide)
    case 'win_time':
      return canMate(finalFen, ctx.userColor)
    case 'draw_flag_user':
      return !canMate(finalFen, engineSide)
    case 'draw_flag_engine':
      return !canMate(finalFen, ctx.userColor)
    default:
      return false
  }
}

export interface PlayRow {
  id: string
  user_id: string
  game_id: string
  start_ply: number
  start_fen: string
  user_color: Side
  engine: EngineKind
  opponent_elo: number
  user_elo: number
  user_clock_ms: number | null
  opponent_clock_ms: number | null
  increment_ms: number | null
  clock_source: 'pgn' | 'time_control' | null
  moves: PlayedMove[]
  outcome: LogOutcome
}

export function endRow(ctx: PlayContext, body: EndBody, userId: string, engine: EngineKind): { ok: true; row: PlayRow } | Answer {
  const replay = replayPlayout(ctx, body.moves)
  if (!replay.ok) return { status: 400, body: { error: 'illegal_move', index: replay.index } }
  const rule = ruleOutcome(replay.chess, ctx.userColor)
  if (!outcomeAllowed(ctx, replay.chess.fen(), rule, body.outcome)) {
    return { status: 400, body: { error: 'outcome_mismatch', board: rule } }
  }
  const clocks = ctx.startClocks
  const user = ctx.userColor
  return {
    ok: true,
    row: {
      id: body.play_id,
      user_id: userId,
      game_id: ctx.gameId,
      start_ply: ctx.startPly,
      start_fen: ctx.startFen,
      user_color: user,
      engine,
      opponent_elo: ctx.engineElo,
      user_elo: ctx.userEloForEngine,
      user_clock_ms: clocks ? (user === 'white' ? clocks.white : clocks.black) : null,
      opponent_clock_ms: clocks ? (user === 'white' ? clocks.black : clocks.white) : null,
      increment_ms: ctx.timeControl ? ctx.timeControl.incrementMs : null,
      clock_source: clocks ? clocks.source : null,
      moves: replay.played,
      outcome: body.outcome,
    },
  }
}
