import { MATE_SCORE_CP, type Grading } from './grading'
import type { NextResponse } from './api-types'

export type RevealKind =
  | 'correct'
  | 'punish'
  | 'reveal_only'
  | 'shown'

export interface CommitResult {
  correct: boolean | null
  best_move: string | null
  best_move_san: string | null
  root_move_san: string
  root_move_uci: string | null
  eval_cp: number | null
  refutation_evals: number[]
  grading?: Pick<Grading, 'method' | 'chosen_eval_cp' | 'best_eval_cp'>
}

export function standing(cp: number): string {
  if (cp >= 300) return 'winning'
  if (cp >= 150) return 'clearly better'
  if (cp >= 50) return 'a bit better'
  if (cp > -50) return 'about equal'
  if (cp > -150) return 'a bit worse'
  if (cp > -300) return 'clearly worse'
  return 'losing'
}

export function planReveal(chosenMove: string | null, r: CommitResult): RevealKind {
  if (chosenMove === null) return 'shown'
  if (r.correct === true) return 'correct'
  if (r.root_move_uci && chosenMove.toLowerCase() === r.root_move_uci.toLowerCase()) {
    return 'punish'
  }
  return 'reveal_only'
}

export function nextButtonLabel(upcoming: NextResponse | null): string {
  return upcoming !== null && 'done' in upcoming ? 'Finish session' : 'Next position'
}

export function revealVerdict(kind: RevealKind): string {
  switch (kind) {
    case 'correct':
      return 'Correct.'
    case 'punish':
      return "That's the move you played in the game."
    case 'reveal_only':
      return 'The engine liked a different move.'
    case 'shown':
      return "Here's the answer."
  }
}

export function revealLines(kind: RevealKind, r: CommitResult, chosenSan: string | null = null): string[] {
  const best = r.best_move_san ?? 'the engine move'
  const lines: string[] = []
  const yours = yourMoveLine(kind, r, chosenSan)
  const engineGraded = r.grading?.method === 'engine' && yours !== null

  const keeps = r.eval_cp === null ? null : keepsWords(r.eval_cp)
  if (kind === 'correct' && engineGraded) lines.push(yours)
  else if (kind === 'correct') lines.push(keeps ? `${best} is the best move here, and it ${keeps}.` : `${best} is the best move here.`)
  else if (engineGraded) lines.push(`The best move was ${best}.`, yours)
  else {
    lines.push(keeps ? `The best move was ${best}, which ${keeps}.` : `The best move was ${best}.`)
    if (yours) lines.push(yours)
  }

  lines.push(gameLine(r))
  return lines
}

function keepsWords(cp: number): string {
  return cp >= 50 ? `keeps you ${standing(cp)}` : 'keeps the game about equal'
}

const BANDS = ['losing', 'clearly worse', 'a bit worse', 'about equal', 'a bit better', 'clearly better', 'winning']

export function yourMoveLine(kind: RevealKind, r: CommitResult, chosenSan: string | null): string | null {
  const g = r.grading
  if (!chosenSan || !g || kind === 'punish' || kind === 'shown') return null
  if (g.method === 'unavailable') {
    return `The engine couldn't check ${chosenSan} just now, so it isn't marked right or wrong.`
  }
  if (g.method !== 'engine' || g.chosen_eval_cp === null || g.best_eval_cp === null) return null

  const best = r.best_move_san ?? 'the best move'
  const mine = g.chosen_eval_cp
  const top = g.best_eval_cp

  if (r.correct === true) {
    if (mine >= MATE_SCORE_CP) return `${chosenSan} works too: it also forces mate.`
    if (top >= MATE_SCORE_CP) return `${chosenSan} works too: it ${keepsWords(mine)}, though ${best} forces mate.`
    if (mine >= top) return `${chosenSan} works too: the engine rates it at least as well as ${best}.`
    return `${chosenSan} works too: the engine rates it within half a pawn of ${best}.`
  }

  if (r.correct === false) {
    const a = standing(mine)
    const b = standing(top)
    if (BANDS.indexOf(a) < BANDS.indexOf(b)) {
      const after = a === 'about equal' ? 'the game would be about equal' : `you'd be ${a}`
      const then = b === 'about equal' ? 'about equal' : b
      return `After ${chosenSan} ${after}; after ${best}, ${then}.`
    }
    return `${chosenSan} also ${keepsWords(mine)}, but ${best} keeps ${top - mine >= 300 ? 'much more' : 'more'} of your edge.`
  }
  return null
}

function gameLine(r: CommitResult): string {
  const after = r.refutation_evals[r.refutation_evals.length - 1]
  const prefix = `In your game you played ${r.root_move_san}`
  if (r.eval_cp === null || after === undefined) return `${prefix}, and things went downhill from there.`
  const from = standing(r.eval_cp)
  const to = standing(after)
  const moves = Math.ceil((r.refutation_evals.length + 1) / 2)
  const within = moves <= 1 ? 'right after' : `within ${moves} moves`
  if (from === to) return `${prefix}, and the position slipped from there.`
  return `${prefix}, and ${within} you went from ${from} to ${to}.`
}

export interface RevealArrow {
  from: string
  to: string
  role: 'held' | 'also_held' | 'mistake' | 'yours' | 'unchecked'
}

export function revealArrows(kind: RevealKind, r: CommitResult, chosenMove: string | null): RevealArrow[] {
  const arrows: RevealArrow[] = []
  const split = (uci: string) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4) })
  const checked = r.grading?.method === 'engine'
  const isBest = chosenMove !== null && r.best_move !== null && chosenMove.slice(0, 4) === r.best_move.slice(0, 4)

  if (kind !== 'correct' && r.root_move_uci) arrows.push({ ...split(r.root_move_uci), role: 'mistake' })
  if (kind === 'reveal_only' && chosenMove) arrows.push({ ...split(chosenMove), role: checked ? 'yours' : 'unchecked' })
  if (kind === 'correct' && chosenMove && !isBest) arrows.push({ ...split(chosenMove), role: 'also_held' })
  if (r.best_move) arrows.push({ ...split(r.best_move), role: 'held' })
  return arrows
}

export const ARROW_KEY: Record<RevealArrow['role'], string> = {
  held: 'Best move',
  also_held: 'Your move (also holds)',
  mistake: 'Your game move',
  yours: 'Your move',
  unchecked: 'Your move (not checked by the engine)',
}

export function squaresNamed(sentence: string): string[] {
  return Array.from(new Set(sentence.match(/[a-h][1-8]/g) ?? []))
}

export function evalBarFraction(cpUserPerspective: number): number {
  const cp = Math.max(-1500, Math.min(1500, cpUserPerspective))
  const winChance = 2 / (1 + Math.exp(-0.00368208 * cp)) - 1
  return (1 + winChance) / 2
}
