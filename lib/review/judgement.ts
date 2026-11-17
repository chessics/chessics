import type { MoveClassification } from '@/lib/supabase/types'
import { winChance } from './win-chance'

export const BLUNDER_DROP = 15
export const MISTAKE_DROP = 10
export const INACCURACY_DROP = 5

export interface JudgeableMove {
  ply_number: number
  eval_before: number | null
  eval_after: number | null
  classification: MoveClassification | null
}

const FAULTS: ReadonlySet<MoveClassification> = new Set<MoveClassification>(['blunder', 'mistake', 'inaccuracy'])

export function judgeMove(m: JudgeableMove): MoveClassification | null {
  if (m.eval_before === null || m.eval_after === null) return m.classification
  const side = m.ply_number % 2 === 1 ? 1 : -1
  const drop = winChance(side * m.eval_before) - winChance(side * m.eval_after)
  if (drop >= BLUNDER_DROP) return 'blunder'
  if (drop >= MISTAKE_DROP) return 'mistake'
  if (drop >= INACCURACY_DROP) return 'inaccuracy'
  return m.classification && FAULTS.has(m.classification) ? 'good' : m.classification
}

export function withJudgement<T extends JudgeableMove>(moves: readonly T[]): T[] {
  return moves.map(m => ({ ...m, classification: judgeMove(m) }))
}
