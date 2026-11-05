import { Chess } from 'chess.js'
import { gradeCommit, legalUci, type GradingEngine, type GradingMethod } from '@/lib/training/grading'
import { planReveal, revealArrows, revealLines, yourMoveLine, type CommitResult, type RevealArrow, type RevealKind } from '@/lib/training/reveal'
import { shareVerdict } from './words'

export interface ShareAnswerSource {
  fen: string
  side_to_move: 'white' | 'black'
  root_move_san: string
  best_move: string
  best_move_san: string | null
  eval_cp: number
}

export interface ShareAnswer {
  correct: boolean | null
  kind: RevealKind
  verdict: string
  sentence: string
  best_move: string
  best_move_san: string | null
  chosen_move: string | null
  arrows: RevealArrow[]
  grading: { method: GradingMethod; engine: string | null; depth: number | null }
}

function sanToUci(fen: string, san: string): string | null {
  try {
    const m = new Chess(fen).move(san)
    return m ? `${m.from}${m.to}${m.promotion ?? ''}` : null
  } catch {
    return null
  }
}

function sanOf(fen: string, uci: string): string | null {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })?.san ?? null
  } catch {
    return null
  }
}

export async function answerShare(p: ShareAnswerSource, chosenMove: string | null, engine: GradingEngine): Promise<ShareAnswer> {
  const chosen = chosenMove === null ? null : legalUci(p.fen, chosenMove.toLowerCase())
  if (chosenMove !== null && chosen === null) throw new Error('chosen_move is not legal in this position')

  const gameMoveUci = sanToUci(p.fen, p.root_move_san)
  const grading = await gradeCommit({ fen: p.fen, chosenMove: chosen, bestMove: p.best_move, gameMoveUci }, engine)

  const result: CommitResult = {
    correct: grading.correct,
    best_move: p.best_move,
    best_move_san: p.best_move_san,
    root_move_san: p.root_move_san,
    root_move_uci: gameMoveUci,
    eval_cp: p.eval_cp,
    refutation_evals: [],
    grading,
  }
  const kind = planReveal(chosen, result)
  const chosenSan = chosen === null ? null : sanOf(p.fen, chosen)
  const sentence = yourMoveLine(kind, result, chosenSan) ?? revealLines(kind, result, chosenSan)[0]

  const arrows = revealArrows(kind, result, chosen)
  if (kind === 'correct' && gameMoveUci) {
    arrows.unshift({ from: gameMoveUci.slice(0, 2), to: gameMoveUci.slice(2, 4), role: 'mistake' })
  }

  return {
    correct: grading.correct,
    kind,
    verdict: shareVerdict(kind),
    sentence,
    best_move: p.best_move,
    best_move_san: p.best_move_san,
    chosen_move: chosen,
    arrows,
    grading: { method: grading.method, engine: grading.engine, depth: grading.depth },
  }
}
