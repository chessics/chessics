import type { Game } from '@/lib/supabase/types'
import { one, type OneOrMany } from '@/lib/supabase/embed'

export type GameWithAccuracy = Game & { overall_accuracy: number | null }

export type GameWithEmbeddedAnalysis = Game & {
  game_analyses?: OneOrMany<{ overall_accuracy: number | string | null }>
}

export function withAccuracy(row: GameWithEmbeddedAnalysis): GameWithAccuracy {
  const { game_analyses, ...game } = row
  const raw = one(game_analyses)?.overall_accuracy
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
  return { ...game, overall_accuracy: typeof value === 'number' && Number.isFinite(value) ? value : null }
}
