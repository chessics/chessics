import type { GameReviewProps } from '@/components/workbench/GameReviewClient'
import { standaloneBlunderPositionsEnabled } from '@/lib/flags'
import { loadPositionHistory } from '@/lib/training/position-history'
import type { createClient } from '@/lib/supabase/server'
import { trainingCandidates, withPreTerminalEvals, type NextStepRow } from '@/lib/training/next-step'
import { nextReturn, type HistoryRow } from '@/lib/training/session'

export type TrainingReturn = 'new' | number | null

export function reviewTrainingReturn(history: HistoryRow[], now: number): TrainingReturn {
  const next = nextReturn(history, now)
  if (!next) return 'new'
  return next.retired ? null : next.at
}

export async function loadTrainingReturn(
  supabase: Awaited<ReturnType<typeof createClient>>, review: GameReviewProps, position: NextStepRow,
): Promise<TrainingReturn> {
  const rows = withPreTerminalEvals([{
    ...position,
    chain_root_plies: review.analysis ? review.causalChains.map(c => c.root_move_ply) : null,
  }], review.analysis ? review.moves : [])
  if (!trainingCandidates(rows, { standaloneBlunders: standaloneBlunderPositionsEnabled() }).length) return null

  const history = await loadPositionHistory(supabase, review.game.user_id, position.id)
  return history && reviewTrainingReturn(history, Date.now())
}
