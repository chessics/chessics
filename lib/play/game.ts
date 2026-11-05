import { Chess } from 'chess.js'

export type Side = 'white' | 'black'

export const other = (s: Side): Side => (s === 'white' ? 'black' : 'white')

export interface Clock {
  whiteMs: number
  blackMs: number
  incrementMs: number
  running: Side | null
  since: number
}

export function createClock(start: { whiteMs: number; blackMs: number; incrementMs: number }, running: Side | null, now: number): Clock {
  return { ...start, running, since: now }
}

const stored = (c: Clock, side: Side) => (side === 'white' ? c.whiteMs : c.blackMs)

export function remainingMs(c: Clock, side: Side, now: number): number {
  const base = stored(c, side)
  return Math.max(0, c.running === side ? base - (now - c.since) : base)
}

function withSide(c: Clock, side: Side, ms: number): Clock {
  return side === 'white' ? { ...c, whiteMs: ms } : { ...c, blackMs: ms }
}

export function pressClock(c: Clock, now: number): Clock {
  if (!c.running) return c
  const mover = c.running
  const left = remainingMs(c, mover, now)
  const after = left > 0 ? left + c.incrementMs : 0
  return { ...withSide(c, mover, after), running: other(mover), since: now }
}

export function pauseClock(c: Clock, now: number): Clock {
  if (!c.running) return c
  return { ...withSide(c, c.running, remainingMs(c, c.running, now)), running: null, since: now }
}

export function resumeClock(c: Clock, side: Side, now: number): Clock {
  return { ...c, running: side, since: now }
}

export function flaggedSide(c: Clock, now: number): Side | null {
  if (!c.running) return null
  return remainingMs(c, c.running, now) <= 0 ? c.running : null
}

export const OUTCOMES = [
  'win_mate',
  'win_time',
  'loss_mate',
  'loss_time',
  'resigned',
  'draw_stalemate',
  'draw_repetition',
  'draw_fifty',
  'draw_material',
  'draw_flag_user',
  'draw_flag_engine',
] as const

export type Outcome = (typeof OUTCOMES)[number]

export function ruleOutcome(chess: Chess, userColor: Side): Outcome | null {
  if (chess.isCheckmate()) {
    const mated: Side = chess.turn() === 'w' ? 'white' : 'black'
    return mated === userColor ? 'loss_mate' : 'win_mate'
  }
  if (chess.isStalemate()) return 'draw_stalemate'
  if (chess.isInsufficientMaterial()) return 'draw_material'
  if (chess.isThreefoldRepetition()) return 'draw_repetition'
  if (chess.isDraw()) return 'draw_fifty'
  return null
}

export function canMate(fen: string, side: Side): boolean {
  const board = fen.split(' ')[0]
  const own = side === 'white' ? /[PNBRQ]/g : /[pnbrq]/g
  const pieces = board.match(own) ?? []
  if (pieces.length === 0) return false
  if (pieces.length === 1 && /[nbNB]/.test(pieces[0])) return false
  return true
}

export function flagOutcome(fen: string, flagged: Side, userColor: Side): Outcome {
  const winner = other(flagged)
  if (!canMate(fen, winner)) return flagged === userColor ? 'draw_flag_user' : 'draw_flag_engine'
  return flagged === userColor ? 'loss_time' : 'win_time'
}

export type StartStanding = 'ahead' | 'level' | 'behind'

export const STANDING_CP = 150

export function standingFromEval(cp: number | null): StartStanding | null {
  if (cp === null || !Number.isFinite(cp)) return null
  if (cp >= STANDING_CP) return 'ahead'
  if (cp <= -STANDING_CP) return 'behind'
  return 'level'
}

const DRAW_HOW: Partial<Record<Outcome, string>> = {
  draw_stalemate: 'by stalemate',
  draw_repetition: 'by repetition',
  draw_fifty: 'under the fifty-move rule',
  draw_material: 'with too little material left to mate',
}

export function outcomeSentence(outcome: Outcome, start: StartStanding | null): string {
  switch (outcome) {
    case 'win_mate':
      return start === 'ahead' ? 'You converted it.' : 'You won it by checkmate.'
    case 'win_time':
      return 'You won it on time.'
    case 'loss_mate':
      return 'You lost it to checkmate.'
    case 'loss_time':
      return 'You lost it on time.'
    case 'resigned':
      return 'You resigned.'
    case 'draw_flag_user':
      return 'Your time ran out, but they had too little left to mate, so it was a draw.'
    case 'draw_flag_engine':
      return 'Their time ran out, but you had too little left to mate, so it was a draw.'
    default: {
      const how = DRAW_HOW[outcome] ?? ''
      return start === 'behind' ? `You held the draw ${how}.` : `It ended in a draw ${how}.`
    }
  }
}
