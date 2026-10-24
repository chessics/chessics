import { Chess } from 'chess.js'
import { judgeMove, normaliseUci, type Puzzle } from './rules'

export type PlayStatus = 'solving' | 'replying' | 'solved' | 'showing' | 'shown'

export interface PlayState {
  puzzle: Puzzle
  played: number
  fen: string
  lastMove: [string, string] | null
  status: PlayStatus
  missed: boolean
  lit: string | null
}

function apply(fen: string, uci: string): { fen: string; from: string; to: string } {
  const chess = new Chess(fen)
  const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined })
  return { fen: chess.fen(), from: m.from, to: m.to }
}

export function startPuzzle(puzzle: Puzzle): PlayState {
  return { puzzle, played: 0, fen: puzzle.fen, lastMove: null, status: 'solving', missed: false, lit: null }
}

export function attempt(state: PlayState, uci: string): PlayState {
  if (state.status !== 'solving') return state
  const verdict = judgeMove(state.puzzle, state.played, uci)
  if (verdict === 'wrong') return { ...state, missed: true }
  const moved = apply(state.fen, normaliseUci(uci))
  const base = { ...state, played: state.played + 1, fen: moved.fen, lastMove: [moved.from, moved.to] as [string, string], missed: false }
  return verdict === 'solved' ? { ...base, status: 'solved', lit: moved.to } : { ...base, status: 'replying' }
}

export function reply(state: PlayState): PlayState {
  if (state.status !== 'replying') return state
  const uci = state.puzzle.solution[state.played]
  if (!uci) return state
  const moved = apply(state.fen, uci)
  return { ...state, played: state.played + 1, fen: moved.fen, lastMove: [moved.from, moved.to], status: 'solving' }
}

export function showLine(state: PlayState): PlayState {
  if (state.status !== 'solving' && state.status !== 'replying') return state
  return { ...state, status: 'showing', missed: false }
}

export function showStep(state: PlayState): PlayState {
  if (state.status !== 'showing') return state
  const uci = state.puzzle.solution[state.played]
  if (!uci) return { ...state, status: 'shown', lit: state.lastMove?.[1] ?? null }
  const moved = apply(state.fen, uci)
  const played = state.played + 1
  const done = played >= state.puzzle.solution.length
  return {
    ...state,
    played,
    fen: moved.fen,
    lastMove: [moved.from, moved.to],
    status: done ? 'shown' : 'showing',
    lit: done ? moved.to : null,
  }
}

export function isOver(state: PlayState): boolean {
  return state.status === 'solved' || state.status === 'shown'
}

export function playMessage(state: PlayState): string | null {
  if (state.status === 'solved') return 'Solved.'
  if (state.status === 'shown') return 'Here is the line.'
  if (state.missed) return 'Not that one.'
  return null
}

export function playHeading(state: PlayState): string {
  return state.puzzle.side === 'white' ? 'White to move.' : 'Black to move.'
}
