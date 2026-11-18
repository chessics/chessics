import type { Color } from '@/lib/supabase/types'
import { toUserEval } from '@/lib/chains/stands-alone'
import { atLeastAboutEqual, standing } from '@/lib/training/reveal'
import { moveNumberOfPly } from './decided-at'
import { BLUNDER_DROP } from './judgement'
import type { KeyMomentMove } from './key-moment'
import { winChance } from './win-chance'

interface MissedChance {
  replyPly: number
  moveNumber: number
  sentence: string
}

export function missedChances(moves: readonly KeyMomentMove[], color: Color | null): MissedChance[] {
  if (!color) return []
  const ordered = [...moves].sort((a, b) => a.ply_number - b.ply_number)
  const chances: MissedChance[] = []
  const replyParity = color === 'white' ? 1 : 0
  for (let i = 1; i < ordered.length; i++) {
    const opponent = ordered[i - 1]
    const reply = ordered[i]
    if (reply.ply_number % 2 !== replyParity || reply.ply_number !== opponent.ply_number + 1) continue

    if (opponent.eval_before === null || reply.eval_before === null || reply.eval_after === null ||
        opponent.eval_after !== reply.eval_before) continue
    const before = toUserEval(opponent.eval_before, color)
    const recovered = toUserEval(reply.eval_before, color)
    const after = toUserEval(reply.eval_after, color)
    if (![before, recovered, after].every(Number.isFinite)) continue
    if (atLeastAboutEqual(before) || !atLeastAboutEqual(recovered) || atLeastAboutEqual(after)) continue
    if (winChance(recovered) - winChance(after) < BLUNDER_DROP) continue

    chances.push({
      replyPly: reply.ply_number,
      moveNumber: moveNumberOfPly(reply.ply_number),
      sentence: `You were ${standing(recovered)} after they played ${opponent.san} and ${standing(after)} after you replied ${reply.san}.`,
    })
    if (chances.length === 2) break
  }
  return chances
}
