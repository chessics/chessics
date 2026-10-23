export const ANALYZE_MORE_ID = 'analyze-more'

export const NO_HABIT_VERDICT = 'Not enough games to confirm a habit yet.'
export const MORE_GAMES_HINT = 'Analyze more games to confirm one.'

export function withoutEmDash(text: string): string {
  return text.replace(/\s*—\s*/g, ': ').replace(/:\s*:/g, ':')
}

export interface Verdict {
  text: string
  needsMoreGames: boolean
}

export function verdictFor(stored: string | null, recurring: boolean): Verdict | null {
  if (!recurring) return { text: NO_HABIT_VERDICT, needsMoreGames: true }
  if (!stored) return null
  return { text: withoutEmDash(stored), needsMoreGames: false }
}
