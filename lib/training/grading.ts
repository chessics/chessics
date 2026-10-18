import { Chess } from 'chess.js'

export const GRADING_TOLERANCE_CP = 50

export const MATE_SCORE_CP = 9000
export const STILL_WINNING_CP = 500

export const MATE_CP = 10000

export const MIN_GRADING_DEPTH = 12

export const SHALLOW_GRADING_DEPTH = 10
export const SHALLOW_ERROR_CP = 50

export function holdsAgainstBest(bestAfterCp: number, chosenAfterCp: number): boolean {
  if (bestAfterCp >= MATE_SCORE_CP && chosenAfterCp >= STILL_WINNING_CP) return true
  return bestAfterCp - chosenAfterCp <= GRADING_TOLERANCE_CP
}

export function verdictAtDepth(bestAfterCp: number, chosenAfterCp: number, depth: number): boolean | null {
  const verdict = holdsAgainstBest(bestAfterCp, chosenAfterCp)
  if (depth >= MIN_GRADING_DEPTH) return verdict
  if (depth < SHALLOW_GRADING_DEPTH) return null
  const e = SHALLOW_ERROR_CP
  const ifWorse = holdsAgainstBest(bestAfterCp + e, chosenAfterCp - e)
  const ifBetter = holdsAgainstBest(bestAfterCp - e, chosenAfterCp + e)
  return ifWorse === ifBetter ? verdict : null
}

export type GradingMethod =
  | 'none'
  | 'no_best_move'
  | 'exact'
  | 'game_move'
  | 'engine'
  | 'unavailable'

export interface Grading {
  correct: boolean | null
  method: GradingMethod
  chosen_eval_cp: number | null
  best_eval_cp: number | null
  engine: string | null
  depth: number | null
}

export interface EngineEval {
  cp: number
  depth: number
  pv?: string[]
}

export interface GradingEngine {
  label: string
  evaluate(fen: string): Promise<EngineEval | null>
}

export const RULES_ENGINE = 'rules'

const NOT_GRADED = { chosen_eval_cp: null, best_eval_cp: null, engine: null, depth: null }

function play(fen: string, uci: string): Chess | null {
  try {
    const chess = new Chess(fen)
    const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    return m ? chess : null
  } catch {
    return null
  }
}

export function legalUci(fen: string, uci: string): string | null {
  for (const promotion of [uci[4], 'q']) {
    try {
      const m = new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion })
      if (m) return `${m.from}${m.to}${m.promotion ?? ''}`
    } catch {
    }
  }
  return null
}

function decidedByRules(chess: Chess): number | null {
  if (chess.isCheckmate()) return MATE_CP
  if (chess.isStalemate() || chess.isInsufficientMaterial()) return 0
  return null
}

export interface CommitToGrade {
  fen: string
  chosenMove: string | null
  bestMove: string | null
  gameMoveUci: string | null
}

export async function gradeCommit(c: CommitToGrade, engine: GradingEngine): Promise<Grading> {
  if (c.chosenMove === null) return { correct: null, method: 'none', ...NOT_GRADED }
  if (!c.bestMove) return { correct: null, method: 'no_best_move', ...NOT_GRADED }

  const chosen = c.chosenMove.toLowerCase()
  if (chosen === legalUci(c.fen, c.bestMove.toLowerCase())) return { correct: true, method: 'exact', ...NOT_GRADED }
  if (c.gameMoveUci && chosen === c.gameMoveUci.toLowerCase()) {
    return { correct: false, method: 'game_move', ...NOT_GRADED }
  }

  const afterBest = play(c.fen, c.bestMove)
  const afterChosen = play(c.fen, chosen)
  if (!afterBest || !afterChosen) return { correct: null, method: 'unavailable', ...NOT_GRADED }

  const userSign = c.fen.split(' ')[1] === 'b' ? -1 : 1
  const depths: number[] = []

  const score = async (after: Chess): Promise<number | null> => {
    const ruled = decidedByRules(after)
    if (ruled !== null) return ruled
    const e = await engine.evaluate(after.fen())
    if (!e) return null
    depths.push(e.depth)
    return e.cp * userSign
  }

  const bestCp = await score(afterBest)
  if (bestCp === null) return { correct: null, method: 'unavailable', ...NOT_GRADED }
  const chosenCp = await score(afterChosen)
  if (chosenCp === null) return { correct: null, method: 'unavailable', ...NOT_GRADED }

  const depth = depths.length > 0 ? Math.min(...depths) : null
  const correct = depth === null ? holdsAgainstBest(bestCp, chosenCp) : verdictAtDepth(bestCp, chosenCp, depth)
  if (correct === null) return { correct: null, method: 'unavailable', ...NOT_GRADED }

  return {
    correct,
    method: 'engine',
    chosen_eval_cp: Math.round(chosenCp),
    best_eval_cp: Math.round(bestCp),
    engine: depth === null ? RULES_ENGINE : engine.label,
    depth: depth ?? 0,
  }
}

export interface StoredGrading {
  chosen_move: string | null
  correct: boolean | null
  chosen_eval_cp: number | null
  best_eval_cp: number | null
  grading_engine: string | null
  grading_depth: number | null
}

export function gradingFromRow(
  row: StoredGrading,
  position: { best_move: string | null; fen: string },
  gameMoveUci: string | null
): Grading {
  const stored = {
    chosen_eval_cp: row.chosen_eval_cp,
    best_eval_cp: row.best_eval_cp,
    engine: row.grading_engine,
    depth: row.grading_depth,
  }
  const method: GradingMethod = (() => {
    if (row.chosen_move === null) return 'none'
    if (row.chosen_eval_cp !== null && row.best_eval_cp !== null) return 'engine'
    if (!position.best_move) return 'no_best_move'
    const chosen = row.chosen_move.toLowerCase()
    if (chosen === legalUci(position.fen, position.best_move.toLowerCase())) return 'exact'
    if (gameMoveUci && chosen === gameMoveUci.toLowerCase()) return 'game_move'
    return 'unavailable'
  })()
  return { correct: row.correct, method, ...stored }
}

export function gradingColumns(g: Grading) {
  return {
    chosen_eval_cp: g.chosen_eval_cp,
    best_eval_cp: g.best_eval_cp,
    grading_engine: g.engine,
    grading_depth: g.depth,
  }
}
