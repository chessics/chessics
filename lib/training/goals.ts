import { Chess, type Square } from 'chess.js'
import { GRADING_TOLERANCE_CP, MATE_CP, MATE_SCORE_CP, MIN_GRADING_DEPTH, legalUci, type GradingEngine } from './grading'
import {
  GOALS,
  bestServes,
  chosenServes,
  diagnose,
  type CheckEval,
  type CheckStatus,
  type Goal,
  type GoalCheck,
  type ReasonChecks,
  type ReasonResult,
} from './reason'

export const GOAL_MARGIN_CP = GRADING_TOLERANCE_CP

export const GOAL_BUDGET_MS = 6000

export const MATERIAL_PLIES = 8

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

type Color = 'w' | 'b'

export function material(chess: Chess, user: Color): number {
  let sum = 0
  for (const row of chess.board()) {
    for (const sq of row) {
      if (sq) sum += sq.color === user ? VALUE[sq.type] : -VALUE[sq.type]
    }
  }
  return sum
}

export function nullMoveFen(chess: Chess): string | null {
  if (chess.inCheck()) return null
  const f = chess.fen().split(' ')
  const wasBlack = f[1] === 'b'
  f[1] = wasBlack ? 'w' : 'b'
  f[3] = '-'
  f[4] = String(Number(f[4]) + 1)
  if (wasBlack) f[5] = String(Number(f[5]) + 1)
  return f.join(' ')
}

function play(fen: string, uci: string): { chess: Chess; piece: string; to: string } | null {
  try {
    const chess = new Chess(fen)
    const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    return m ? { chess, piece: m.promotion ?? m.piece, to: m.to } : null
  } catch {
    return null
  }
}

export function settledMaterial(fen: string, pv: string[], user: Color): number | null {
  let chess: Chess
  try {
    chess = new Chess(fen)
  } catch {
    return null
  }
  if (pv.length === 0) {
    const quiet = !chess.inCheck() && !chess.moves({ verbose: true }).some(m => m.captured)
    return quiet || chess.isGameOver() ? material(chess, user) : null
  }
  let quietRun = 0
  let settled: number | null = null
  for (const uci of pv.slice(0, MATERIAL_PLIES)) {
    const escaping = chess.inCheck()
    let m
    try {
      m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    } catch {
      break
    }
    if (!m) break
    const quiet = !m.captured && !m.promotion && !escaping && !chess.inCheck()
    quietRun = quiet ? quietRun + 1 : 0
    if (quietRun >= 2) settled = material(chess, user)
  }
  return chess.isGameOver() ? material(chess, user) : settled
}

interface Eval {
  cp: number
  depth: number
  pv: string[]
}

interface Outcome {
  check: GoalCheck
  threatReply?: { move: string; eval_after_cp: number }
}

function makeChecker(fen: string, engine: GradingEngine) {
  const before = new Chess(fen)
  const user = before.turn() as Color
  const sign = user === 'b' ? -1 : 1
  const cache = new Map<string, Promise<Eval | null>>()
  const evals: Record<string, CheckEval> = {}

  const score = (fenToScore: string): Promise<Eval | null> => {
    const hit = cache.get(fenToScore)
    if (hit) return hit
    const run = (async (): Promise<Eval | null> => {
      const chess = new Chess(fenToScore)
      if (chess.isCheckmate()) return { cp: chess.turn() === user ? -MATE_CP : MATE_CP, depth: 0, pv: [] }
      if (chess.isStalemate() || chess.isInsufficientMaterial()) return { cp: 0, depth: 0, pv: [] }
      const e = await engine.evaluate(fenToScore)
      if (!e || e.depth < MIN_GRADING_DEPTH) return null
      return { cp: e.cp * sign, depth: e.depth, pv: e.pv ?? [] }
    })()
    cache.set(fenToScore, run)
    return run
  }

  const get = async (role: string, fenToScore: string): Promise<Eval | null> => {
    const e = await score(fenToScore)
    if (e) evals[role] = { cp: e.cp, depth: e.depth, ...(e.pv.length ? { pv: e.pv.slice(0, MATERIAL_PLIES + 1) } : {}) }
    return e
  }

  const beforeNull = nullMoveFen(before)
  const materialBefore = material(before, user)

  const result = (goal: Goal, move: string, status: CheckStatus, note?: string, detail?: Record<string, number>): GoalCheck => ({
    goal,
    move,
    status,
    ...(note ? { note } : {}),
    ...(detail ? { detail } : {}),
  })

  async function check(goal: Goal, move: string, who: 'best' | 'chosen'): Promise<Outcome> {
    const after = play(fen, move)
    if (!after) return { check: result(goal, move, 'not_evaluable', 'the move is not legal here') }
    const a = after.chess
    const afterFen = a.fen()

    if (goal === 'improves_worst_piece') {
      const from = move.slice(0, 2) as Square
      const nf = nullMoveFen(a)
      if (!nf) return { check: result(goal, move, 'not_evaluable', 'the move gives check') }
      const was = before.moves({ square: from }).length
      const now = new Chess(nf).moves({ square: after.to as Square }).length
      return { check: result(goal, move, now > was ? 'served' : 'not_served', undefined, { moves_before: was, moves_after: now }) }
    }

    if (goal === 'wins_material') {
      if (a.isGameOver()) {
        const m = material(a, user)
        return { check: result(goal, move, m > materialBefore ? 'served' : 'not_served', 'the game ends on the move', { material_before: materialBefore, material_after: m }) }
      }
      const eA = await get(`after_${who}`, afterFen)
      if (!eA) return { check: result(goal, move, 'unavailable') }
      const m = settledMaterial(afterFen, eA.pv, user)
      if (m === null) return { check: result(goal, move, 'not_evaluable', 'the line ends mid-exchange') }
      return { check: result(goal, move, m > materialBefore ? 'served' : 'not_served', undefined, { material_before: materialBefore, material_after: m }) }
    }

    if (goal === 'stops_threat' && !beforeNull) return { check: result(goal, move, 'not_evaluable', 'in check before the move') }
    const afterNull = nullMoveFen(a)
    if (!afterNull) return { check: result(goal, move, 'not_evaluable', 'the move gives check') }
    if (a.isGameOver()) return { check: result(goal, move, 'not_evaluable', 'the game ends on the move') }

    if (goal === 'makes_threat') {
      const eB = await get('before', fen)
      const eAn = eB && (await get(`after_${who}_null`, afterNull))
      if (!eB || !eAn) return { check: result(goal, move, 'unavailable') }
      const gain = eAn.cp - eB.cp
      const detail = { free_move_gain: gain }
      if (gain <= GOAL_MARGIN_CP) return { check: result(goal, move, 'not_served', undefined, detail) }
      if (eAn.cp >= MATE_SCORE_CP) return { check: result(goal, move, 'served', 'a free move would mate', detail) }
      const m = settledMaterial(afterNull, eAn.pv, user)
      if (m === null) return { check: result(goal, move, 'not_evaluable', 'the line ends mid-exchange', detail) }
      if (m > material(a, user)) return { check: result(goal, move, 'served', undefined, { ...detail, material_after_move: material(a, user), material_after_free_move: m }) }
      return { check: result(goal, move, 'not_evaluable', 'the free-move gain has no material or mate behind it', detail) }
    }

    const eB = await get('before', fen)
    const eBn = eB && (await get('before_null', beforeNull!))
    if (!eB || !eBn) return { check: result(goal, move, 'unavailable') }
    const tBefore = eB.cp - eBn.cp
    if (tBefore <= GOAL_MARGIN_CP) {
      return { check: result(goal, move, 'not_served', 'no free-move gain for the opponent', { free_move_gain_before: tBefore }) }
    }
    const opponentLine = eBn.cp <= -MATE_SCORE_CP ? -Infinity : settledMaterial(beforeNull!, eBn.pv, user)
    if (opponentLine === null) return { check: result(goal, move, 'not_evaluable', 'the line ends mid-exchange') }
    if (opponentLine >= materialBefore) {
      return { check: result(goal, move, 'not_evaluable', 'the free-move gain has no material or mate behind it', { free_move_gain_before: tBefore }) }
    }
    const eA = await get(`after_${who}`, afterFen)
    const eAn = eA && (await get(`after_${who}_null`, afterNull))
    if (!eA || !eAn) return { check: result(goal, move, 'unavailable') }
    const tAfter = eAn.cp - eA.cp
    const detail = { free_move_gain_before: tBefore, free_move_gain_after: tAfter }
    if (tBefore - tAfter > GOAL_MARGIN_CP) return { check: result(goal, move, 'served', undefined, detail) }
    const held = eA.cp > -MATE_SCORE_CP && (settledMaterial(afterFen, eA.pv, user) ?? -Infinity) >= materialBefore
    if (held) return { check: result(goal, move, 'not_evaluable', 'eval and material disagree', detail) }
    const reply = eA.pv[0]
    return {
      check: result(goal, move, 'not_served', undefined, detail),
      ...(reply ? { threatReply: { move: reply, eval_after_cp: eA.cp } } : {}),
    }
  }

  const pieceName = (move: string) => {
    const p = play(fen, move)
    return p ? NAME[p.piece] : 'piece'
  }

  return { check, evals, pieceName }
}

export interface ReasonToCheck {
  fen: string
  bestMove: string | null
  chosenMove: string | null
  declaredGoal: Goal | null
  correct: boolean | null
}

const NO_CHECKS = { best_serves_goal: null, chosen_serves_goal: null, diagnosis: null, checks: null }

export async function checkReason(r: ReasonToCheck, engine: GradingEngine): Promise<ReasonResult> {
  const goal = r.declaredGoal
  if (goal === null) return { declared_goal: null, ...NO_CHECKS }
  if (r.chosenMove === null || !r.bestMove) return { declared_goal: goal, ...NO_CHECKS }
  const best = legalUci(r.fen, r.bestMove.toLowerCase())
  const chosen = legalUci(r.fen, r.chosenMove.toLowerCase())
  if (!best || !chosen) return { declared_goal: goal, ...NO_CHECKS }
  const sameMove = best === chosen

  const checker = makeChecker(r.fen, engine)
  const bestOutcome = await checker.check(goal, best, 'best')
  const chosenOutcome = sameMove ? bestOutcome : await checker.check(goal, chosen, 'chosen')

  const bestGoals: Partial<Record<Goal, CheckStatus>> = { [goal]: bestOutcome.check.status }
  for (const g of GOALS) {
    if (g !== goal) bestGoals[g] = (await checker.check(g, best, 'best')).check.status
  }

  const a = bestServes(bestOutcome.check.status)
  const b = sameMove ? a : chosenServes(chosenOutcome.check.status)
  const depths = Object.values(checker.evals).map(e => e.depth).filter(d => d > 0)

  const checks: ReasonChecks = {
    engine: engine.label,
    depth: depths.length ? Math.min(...depths) : null,
    evals: checker.evals,
    best: bestOutcome.check,
    chosen: chosenOutcome.check,
    best_goals: bestGoals,
    pieces: { best: checker.pieceName(best), chosen: checker.pieceName(chosen) },
    threat: goal === 'stops_threat' && chosenOutcome.threatReply ? chosenOutcome.threatReply : null,
  }

  return {
    declared_goal: goal,
    best_serves_goal: a,
    chosen_serves_goal: b,
    diagnosis: diagnose(a, b, r.correct),
    checks,
  }
}
