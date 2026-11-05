import { pgnSanMoves, readGameClock } from '@/lib/clock'
import type { Color, MoveClassification } from '@/lib/supabase/types'

export interface ReviewClock {
  remaining: Map<number, number>
  spent: Map<number, number>
}

const bare = (san: string) => san.replace(/[+#!?]+$/, '')

export function reviewClock(
  pgn: string | null | undefined,
  moves: readonly { ply_number: number; san: string }[],
): ReviewClock | null {
  if (!pgn) return null
  const game = readGameClock(pgn)
  if (!game) return null
  const san = pgnSanMoves(pgn)
  const rows = [...moves].sort((a, b) => a.ply_number - b.ply_number)
  if (rows.length !== san.length) return null
  if (!rows.every((r, i) => r.ply_number === i + 1 && bare(r.san) === bare(san[i]))) return null
  const remaining = new Map<number, number>()
  const spent = new Map<number, number>()
  game.remaining.forEach((ms, i) => ms !== null && remaining.set(i + 1, ms))
  game.spent.forEach((ms, i) => ms !== null && spent.set(i + 1, ms))
  return { remaining, spent }
}

export interface StripMarks {
  roots: Set<number>
  blunders: Set<number>
}

export function stripMarks(
  chains: readonly { id: string; root_move_ply: number; terminal_blunder_ply: number }[],
  moves: readonly { ply_number: number; classification: MoveClassification | null }[],
  standAloneIds: ReadonlySet<string>,
): StripMarks {
  const roots = new Set<number>()
  const blunders = new Set<number>()
  for (const c of chains) {
    if (!standAloneIds.has(c.id)) roots.add(c.root_move_ply)
    blunders.add(c.terminal_blunder_ply)
  }
  for (const m of moves) if (m.classification === 'blunder') blunders.add(m.ply_number)
  return { roots, blunders }
}

export interface TimeBar {
  ply: number
  moveNumber: number
  san: string
  spentMs: number | null
  ratio: number
  root: boolean
  blunder: boolean
  mark: 'blunder' | 'root' | null
}

export function timeStripBars({
  moves,
  clock,
  userColor,
  marks,
}: {
  moves: readonly { ply_number: number; san: string }[]
  clock: ReviewClock
  userColor: Color | null
  marks: StripMarks
}): TimeBar[] | null {
  if (userColor !== 'white' && userColor !== 'black') return null
  const parity = userColor === 'white' ? 1 : 0
  const own = [...moves].filter((m) => m.ply_number % 2 === parity).sort((a, b) => a.ply_number - b.ply_number)
  const known = own.map((m) => clock.spent.get(m.ply_number)).filter((ms): ms is number => ms !== undefined)
  if (known.length === 0) return null
  const longest = Math.max(...known)
  return own.map((m) => {
    const spentMs = clock.spent.get(m.ply_number) ?? null
    const root = marks.roots.has(m.ply_number)
    const blunder = marks.blunders.has(m.ply_number)
    return {
      ply: m.ply_number,
      moveNumber: Math.ceil(m.ply_number / 2),
      san: m.san,
      spentMs,
      ratio: spentMs !== null && longest > 0 ? spentMs / longest : 0,
      root,
      blunder,
      mark: blunder ? 'blunder' : root ? 'root' : null,
    }
  })
}

export function stripKey(key: string, index: number, count: number): number | null {
  const last = Math.max(0, count - 1)
  switch (key) {
    case 'ArrowRight':
      return Math.min(last, index + 1)
    case 'ArrowLeft':
      return Math.max(0, index - 1)
    case 'Home':
      return 0
    case 'End':
      return last
    default:
      return null
  }
}

export function stripTabStop(plies: readonly number[], currentPly: number): number {
  let at = 0
  plies.forEach((p, i) => {
    if (p <= currentPly) at = i
  })
  return at
}
