import { sentenceCase, type GroupFacts } from './finding'
import { tagSentences } from './tag-sentences'
import { countNoun } from '../count-noun'
import { outOfNowhereSentence } from './out-of-nowhere'

export const ANALYZE_MORE_ID = 'analyze-more'

export const NO_HABIT_VERDICT = 'No pattern came up in these games yet.'
export const MORE_GAMES_HINT = 'Analyze more games to see what repeats.'

export function withoutEmDash(text: string): string {
  return text.replace(/\s*—\s*/g, ': ').replace(/:\s*:/g, ':')
}

export interface Verdict {
  text: string
  needsMoreGames: boolean
  also?: string
}

const withAlso = (v: Verdict, also: string | null): Verdict => (also ? { ...v, also } : v)

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

export function earlierMistakeVerdict(recounted: readonly GroupFacts[], gameCount: number, chainGames?: number | null): string | null {
  const games = chainGames ?? new Set(recounted.flatMap((g) => g.gameIds)).size
  if (games === 0) return null
  return `In ${games} of your ${countNoun(gameCount, 'game')}, an earlier mistake led to your blunder.`
}

export function noHabitVerdict(
  recounted: readonly GroupFacts[],
  gameCount: number,
  outOfNowhere?: number | null,
  chainCount?: number | null
): Verdict {
  const chainGames = chainCount ?? new Set(recounted.flatMap((g) => g.gameIds)).size
  const chain = earlierMistakeVerdict(recounted, gameCount, chainGames)
  const nowhere = outOfNowhere == null ? null : outOfNowhereSentence(outOfNowhere, gameCount)
  if (nowhere && outOfNowhere! > chainGames) return withAlso({ text: nowhere, needsMoreGames: true }, chain)
  return withAlso({ text: chain ?? NO_HABIT_VERDICT, needsMoreGames: true }, nowhere)
}

export function habitHeadline(head: GroupFacts, gameCount: number, outOfNowhere?: number | null): Verdict {
  const nowhere = outOfNowhere == null ? null : outOfNowhereSentence(outOfNowhere, gameCount)
  const habit = habitVerdict(head.tag, head.label, head.frequency, gameCount)
  if (nowhere && outOfNowhere! > head.frequency) return { text: nowhere, needsMoreGames: false, also: habit }
  return withAlso({ text: habit, needsMoreGames: false }, nowhere)
}

export function reportVerdict(
  stored: string | null,
  recounted: readonly GroupFacts[],
  gameCount: number,
  outOfNowhere?: number | null,
  chainCount?: number | null
): Verdict | null {
  const head = recounted.find((g) => g.recurring)
  if (!head) return noHabitVerdict(recounted, gameCount, outOfNowhere, chainCount)
  return habitHeadline(head, gameCount, outOfNowhere)
}
