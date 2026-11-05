import { Chess } from 'chess.js'
import {
  createClock,
  flagOutcome,
  flaggedSide,
  other,
  pauseClock,
  pressClock,
  remainingMs,
  resumeClock,
  ruleOutcome,
  type Clock,
  type Outcome,
  type Side,
} from './game'
import type { ClientMove } from './move'
import type { PlaySetup } from './setup'

export type PlayStatus = 'ready' | 'user' | 'engine' | 'engine_error' | 'over'

export interface PlayState {
  status: PlayStatus
  fen: string
  lastMove: [string, string] | null
  moves: ClientMove[]
  sans: string[]
  clock: Clock | null
  turnSince: number
  outcome: Outcome | null
}

const turnOf = (fen: string): Side => (fen.split(' ')[1] === 'b' ? 'black' : 'white')

export function chessAt(setup: Pick<PlaySetup, 'initialFen' | 'prefix'>, moves: ClientMove[]): Chess {
  const chess = new Chess(setup.initialFen)
  for (const { uci } of [...setup.prefix.map(uci => ({ uci })), ...moves]) {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  }
  return chess
}

export function initialState(setup: PlaySetup): PlayState {
  const user = setup.userColor
  const clock = setup.clocks
    ? createClock(
        {
          whiteMs: user === 'white' ? setup.clocks.userMs : setup.clocks.opponentMs,
          blackMs: user === 'white' ? setup.clocks.opponentMs : setup.clocks.userMs,
          incrementMs: setup.clocks.incrementMs,
        },
        null,
        0
      )
    : null
  return { status: 'ready', fen: setup.startFen, lastMove: null, moves: [], sans: [], clock, turnSince: 0, outcome: null }
}

export function start(setup: PlaySetup, s: PlayState, now: number): PlayState {
  if (s.status !== 'ready') return s
  const mover = turnOf(s.fen)
  return {
    ...s,
    status: mover === setup.userColor ? 'user' : 'engine',
    clock: s.clock ? resumeClock(s.clock, mover, now) : null,
    turnSince: now,
  }
}

function end(s: PlayState, outcome: Outcome, now: number): PlayState {
  return { ...s, status: 'over', outcome, clock: s.clock ? pauseClock(s.clock, now) : null }
}

function play(setup: PlaySetup, s: PlayState, uci: string, now: number, next: PlayStatus): PlayState | null {
  const moves = [...s.moves, { uci, ms: Math.max(0, Math.round(now - s.turnSince)) }]
  let chess: Chess
  let san: string
  try {
    chess = chessAt(setup, s.moves)
    const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    san = m.san
  } catch {
    return null
  }
  const moved: PlayState = {
    ...s,
    fen: chess.fen(),
    lastMove: [uci.slice(0, 2), uci.slice(2, 4)],
    moves,
    sans: [...s.sans, san],
    clock: s.clock ? pressClock(s.clock, now) : null,
    turnSince: now,
    status: next,
  }
  const outcome = ruleOutcome(chess, setup.userColor)
  return outcome ? end(moved, outcome, now) : moved
}

export function userMove(setup: PlaySetup, s: PlayState, uci: string, now: number): PlayState {
  if (s.status !== 'user') return s
  const flagged = checkFlag(setup, s, now)
  if (flagged.status === 'over') return flagged
  return play(setup, s, uci, now, 'engine') ?? s
}

export function engineMove(setup: PlaySetup, s: PlayState, uci: string, now: number): PlayState {
  if (s.status !== 'engine') return s
  const flagged = checkFlag(setup, s, now)
  if (flagged.status === 'over') return flagged
  return play(setup, s, uci, now, 'user') ?? s
}

export function checkFlag(setup: PlaySetup, s: PlayState, now: number): PlayState {
  if (!s.clock) return s
  const flagged = flaggedSide(s.clock, now)
  if (!flagged) return s
  return end(s, flagOutcome(s.fen, flagged, setup.userColor), now)
}

export function resign(s: PlayState, now: number): PlayState {
  if (s.status === 'over' || s.status === 'ready') return s
  return end(s, 'resigned', now)
}

export function engineFailed(s: PlayState, now: number): PlayState {
  if (s.status !== 'engine') return s
  return { ...s, status: 'engine_error', clock: s.clock ? pauseClock(s.clock, now) : null }
}

export function retryEngine(setup: PlaySetup, s: PlayState, now: number): PlayState {
  if (s.status !== 'engine_error') return s
  const engineSide = other(setup.userColor)
  return { ...s, status: 'engine', clock: s.clock ? resumeClock(s.clock, engineSide, now) : null, turnSince: now }
}

export function clocksNow(setup: PlaySetup, s: PlayState, now: number): { user: number; opponent: number } | null {
  if (!s.clock) return null
  return { user: remainingMs(s.clock, setup.userColor, now), opponent: remainingMs(s.clock, other(setup.userColor), now) }
}

export function engineClockMs(setup: PlaySetup, s: PlayState, now: number): number | null {
  return s.clock ? remainingMs(s.clock, other(setup.userColor), now) : null
}

export function formatClock(ms: number): string {
  const t = Math.max(0, ms)
  if (t < 20_000) {
    const tenths = Math.floor(t / 100)
    return `0:${String(Math.floor(tenths / 10)).padStart(2, '0')}.${tenths % 10}`
  }
  const total = Math.floor(t / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}
