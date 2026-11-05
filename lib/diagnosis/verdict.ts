import { sentenceCase, type GroupFacts } from './finding'
import { tagSentences } from './tag-sentences'
import { countNoun } from '../count-noun'

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

export function habitVerdict(tag: string, label: string, frequency: number, gameCount: number): string {
  const s = tagSentences(tag)
  const games = countNoun(gameCount, 'game')
  return s ? `In ${frequency} of your ${games}, ${s.headline}.` : `${sentenceCase(label)} came up in ${frequency} of your ${games}.`
}

export function reportVerdict(
  stored: string | null,
  recounted: readonly GroupFacts[],
  gameCount: number
): Verdict | null {
  const head = recounted.find((g) => g.recurring)
  if (!head) return verdictFor(stored, false)
  return { text: habitVerdict(head.tag, head.label, head.frequency, gameCount), needsMoreGames: false }
}
