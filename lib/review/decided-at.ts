import type { Color, Result } from '@/lib/supabase/types'
import { blunderStandsAlone } from '@/lib/chains/stands-alone'

export interface DecidedAtChain {
  root_move_ply: number
  terminal_blunder_ply: number
}

export interface DecidedAtMove {
  ply_number: number
  eval_before: number | null
  eval_after: number | null
}

export interface DecidedAt {
  rootPly: number
  moveNumber: number
}

export function moveNumberOfPly(ply: number): number {
  return Math.ceil(ply / 2)
}

interface DecidedAtInput {
  result: Result | null
  userColor: Color | null
  chains: readonly DecidedAtChain[]
  moves: readonly DecidedAtMove[]
}

export function decidingChain(input: DecidedAtInput): DecidedAtChain | null {
  const { result, userColor, chains, moves } = input
  if (result !== 'loss' && result !== 'draw') return null
  if (userColor !== 'white' && userColor !== 'black') return null

  const byPly = new Map(moves.map(m => [m.ply_number, m]))
  const forUser = (whiteCp: number) => (userColor === 'white' ? whiteCp : -whiteCp)

  let earliest: DecidedAtChain | null = null
  for (const c of chains) {
    const before = byPly.get(c.root_move_ply)?.eval_before
    const after = byPly.get(c.terminal_blunder_ply)?.eval_after
    const beforeTerminal = byPly.get(c.terminal_blunder_ply)?.eval_before
    if (typeof before !== 'number' || typeof after !== 'number' || typeof beforeTerminal !== 'number') continue
    if (blunderStandsAlone(forUser(beforeTerminal))) continue
    if (!(forUser(before) > 0 && forUser(after) < 0)) continue
    if (!earliest || c.root_move_ply < earliest.root_move_ply ||
        (c.root_move_ply === earliest.root_move_ply && c.terminal_blunder_ply < earliest.terminal_blunder_ply)) earliest = c
  }

  return earliest
}

export function gameDecidedAt(input: DecidedAtInput): DecidedAt | null {
  const chain = decidingChain(input)
  return chain && { rootPly: chain.root_move_ply, moveNumber: moveNumberOfPly(chain.root_move_ply) }
}

export function decidedAtLabel(d: DecidedAt): string {
  return `Game decided at: move ${d.moveNumber}`
}
