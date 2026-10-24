import { blunderStandsAlone, toUserEval } from '@/lib/chains/stands-alone'
import type { Color } from '@/lib/supabase/types'

export interface ChainTerminal {
  terminal_blunder_ply: number
}

export interface MoveEvalBefore {
  ply_number: number
  eval_before: number | null
}

export function chainStandsAlone(
  chain: ChainTerminal,
  moves: readonly MoveEvalBefore[],
  userColor: Color | null,
): boolean {
  if (userColor !== 'white' && userColor !== 'black') return false
  const before = moves.find(m => m.ply_number === chain.terminal_blunder_ply)?.eval_before
  if (typeof before !== 'number' || !Number.isFinite(before)) return false
  return blunderStandsAlone(toUserEval(before, userColor))
}

export function standAloneExplanation(san: string, ply: number): string {
  return `${san} at move ${Math.ceil(ply / 2)} was a blunder on its own.`
}

export function chainAtRoot<C extends { id: string; root_move_ply: number; terminal_blunder_ply: number }>(
  chains: readonly C[],
  rootPly: number,
  standAloneIds: ReadonlySet<string>,
): C | null {
  const at = chains.filter(c => c.root_move_ply === rootPly)
  const rank = (c: C) => (standAloneIds.has(c.id) ? 1 : 0)
  return [...at].sort((a, b) => rank(a) - rank(b) || a.terminal_blunder_ply - b.terminal_blunder_ply)[0] ?? null
}
