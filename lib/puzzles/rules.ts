import { Chess } from 'chess.js'

export interface Puzzle {
  id: string
  fen: string
  side: 'white' | 'black'
  solution: string[]
  theme: string
  source: string | null
}

export type MoveVerdict = 'right' | 'solved' | 'wrong'

export function sideOf(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white'
}

export function normaliseUci(uci: string): string {
  return uci.trim().toLowerCase()
}

export function fenAt(puzzle: Puzzle, ply: number): string {
  const chess = new Chess(puzzle.fen)
  for (const uci of puzzle.solution.slice(0, ply)) playUci(chess, uci)
  return chess.fen()
}

function playUci(chess: Chess, uci: string) {
  return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined })
}

export function legalMove(fen: string, uci: string): { san: string; from: string; to: string; checkmate: boolean } | null {
  try {
    const chess = new Chess(fen)
    const m = playUci(chess, normaliseUci(uci))
    return { san: m.san, from: m.from, to: m.to, checkmate: chess.isCheckmate() }
  } catch {
    return null
  }
}

export function judgeMove(puzzle: Puzzle, ply: number, uci: string): MoveVerdict {
  if (ply % 2 !== 0 || ply >= puzzle.solution.length) return 'wrong'
  const fen = fenAt(puzzle, ply)
  const move = legalMove(fen, uci)
  if (!move) return 'wrong'
  if (normaliseUci(uci) === puzzle.solution[ply]) {
    return ply === puzzle.solution.length - 1 ? 'solved' : 'right'
  }
  return move.checkmate ? 'solved' : 'wrong'
}

export function replyAfter(puzzle: Puzzle, ply: number): string | null {
  return puzzle.solution[ply + 1] ?? null
}

export function solverMoves(puzzle: Puzzle): string[] {
  return puzzle.solution.filter((_, i) => i % 2 === 0)
}

export function nextPuzzle(set: Puzzle[], seen: string[], current: string | null = null): { puzzle: Puzzle; restart: boolean } {
  const seenIds = new Set(seen)
  const fresh = set.find(p => !seenIds.has(p.id) && p.id !== current)
  if (fresh) return { puzzle: fresh, restart: false }
  const again = set.find(p => p.id !== current) ?? set[0]
  return { puzzle: again, restart: true }
}

export function markSeen(set: Puzzle[], seen: string[], id: string): string[] {
  const known = new Set(set.map(p => p.id))
  const out = seen.filter(s => known.has(s) && s !== id)
  if (known.has(id)) out.push(id)
  return out
}

export function parseSeen(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []
  } catch {
    return []
  }
}

export const SEEN_STORAGE_KEY = 'chessics_puzzles_seen'
