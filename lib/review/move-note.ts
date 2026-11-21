import type { Color, MoveClassification } from '@/lib/supabase/types'
import { toUserEval } from '@/lib/chains/stands-alone'
import { standing } from '@/lib/training/reveal'
import { moveNumberOfPly } from './decided-at'

export type NoteTone = 'blunder' | 'mistake' | 'inaccuracy' | 'chance' | 'opponent'

export interface MoveNote {
  tone: NoteTone
  title: string
  text: string
}

export interface NoteMove {
  ply_number: number
  san: string
  eval_before: number | null
  eval_after: number | null
  classification: MoveClassification | null
}

const FAULT: Partial<Record<MoveClassification, string>> = {
  blunder: 'a blunder',
  mistake: 'a mistake',
  inaccuracy: 'an inaccuracy',
}

export function spentWords(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 1) return 'under a second'
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`
  const m = Math.floor(s / 60)
  const rest = s % 60
  const mins = `${m} minute${m === 1 ? '' : 's'}`
  return rest === 0 ? mins : `${mins} ${rest} second${rest === 1 ? '' : 's'}`
}

const isUserPly = (ply: number, color: Color) => (color === 'white' ? ply % 2 === 1 : ply % 2 === 0)

export function moveNote(input: {
  move: NoteMove
  userColor: Color | null
  spentMs?: number
  missedChance?: boolean
}): MoveNote | null {
  const { move, userColor, spentMs, missedChance } = input
  if (!userColor) return null
  const title = `Move ${moveNumberOfPly(move.ply_number)}, ${move.san}`
  const mine = isUserPly(move.ply_number, userColor)
  const fault = move.classification ? FAULT[move.classification] : undefined

  const hasEvals = move.eval_before !== null && move.eval_after !== null
  const before = hasEvals ? standing(toUserEval(move.eval_before as number, userColor)) : null
  const after = hasEvals ? standing(toUserEval(move.eval_after as number, userColor)) : null
  const swing = before && after && before !== after ? ` You went from ${before} to ${after}.` : after ? ` You stayed ${after}.` : ''
  const time = spentMs !== undefined && spentMs >= 0 ? ` You spent ${spentWords(spentMs)} on it.` : ''

  if (mine && missedChance) {
    return {
      tone: 'chance',
      title,
      text: `Your opponent had just given you a way back, and this move let it go.${swing}${time}`,
    }
  }
  if (mine && fault) {
    return { tone: move.classification as NoteTone, title, text: `${cap(fault)}.${swing}${time}` }
  }
  if (!mine && move.classification === 'blunder') {
    return {
      tone: 'opponent',
      title,
      text: `Your opponent blundered.${after ? ` That left you ${after}.` : ''}`,
    }
  }
  return null
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function mistakePlies(
  moves: readonly NoteMove[],
  userColor: Color | null,
  chancePlies: ReadonlySet<number>
): number[] {
  if (!userColor) return []
  return moves
    .filter(
      (m) =>
        isUserPly(m.ply_number, userColor) &&
        (m.classification === 'blunder' || m.classification === 'mistake' || chancePlies.has(m.ply_number))
    )
    .map((m) => m.ply_number)
    .sort((a, b) => a - b)
}

export function stepMistake(plies: readonly number[], from: number, dir: 1 | -1): number | null {
  if (dir === 1) return plies.find((p) => p > from) ?? null
  for (let i = plies.length - 1; i >= 0; i--) if (plies[i] < from) return plies[i]
  return null
}
