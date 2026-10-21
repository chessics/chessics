import { Chess } from 'chess.js'
import type { EvaluatedMove } from './stockfish.js'

export const REFUTATION_MAX_PLIES = 8

export const REFUTATION_FLOOR_CP = -1000

import { DEFAULT_TIME_FLOOR_MS } from './time-floor.js'
export { DEFAULT_TIME_FLOOR_MS }

export interface ChainRootInput {
  rootPly: number
  terminalPly: number
  tag: string | null
}

export interface TrainingPositionRow {
  game_id: string
  root_ply: number
  fen: string
  side_to_move: 'white' | 'black'
  root_move_san: string
  tag: string | null
  best_move: string | null
  best_move_san: string | null
  pv: string[]
  eval_cp: number | null
  refutation_line: string[]
  refutation_evals: number[]
  span_plies: number
  time_floor_ms: number
  engine: string
  depth: number
}

function sanToUci(fenBefore: string, san: string): string | null {
  try {
    const chess = new Chess(fenBefore)
    const move = chess.move(san)
    if (!move) return null
    return `${move.from}${move.to}${move.promotion ?? ''}`
  } catch {
    return null
  }
}

function uciToSan(fen: string, uci: string): string | null {
  if (uci.length < 4) return null
  try {
    const chess = new Chess(fen)
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
    })
    return move ? move.san : null
  } catch {
    return null
  }
}

function sideToMoveFromFen(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white'
}

export function buildTrainingPositions(
  gameId: string,
  moves: EvaluatedMove[],
  userColor: 'white' | 'black',
  chainRoots: ChainRootInput[],
  meta: { engine: string; depth: number }
): TrainingPositionRow[] {
  const byPly = new Map(moves.map(m => [m.ply, m]))

  const userEval = (whitePerspectiveCp: number) =>
    userColor === 'white' ? whitePerspectiveCp : -whitePerspectiveCp

  const seen = new Set<number>()
  const rows: TrainingPositionRow[] = []

  for (const root of chainRoots) {
    if (seen.has(root.rootPly)) continue
    seen.add(root.rootPly)

    const rootMove = byPly.get(root.rootPly)
    if (!rootMove) continue

    const fen = rootMove.fen_before

    const refutationLine: string[] = []
    const refutationEvals: number[] = []

    const lastPly = Math.min(root.terminalPly, root.rootPly + REFUTATION_MAX_PLIES)

    for (let ply = root.rootPly + 1; ply <= lastPly; ply++) {
      const next = byPly.get(ply)
      if (!next) break

      const uci = sanToUci(next.fen_before, next.san)
      if (!uci) break

      const cp = Math.round(userEval(next.eval_after))
      refutationLine.push(uci)
      refutationEvals.push(cp)

      if (cp <= REFUTATION_FLOOR_CP) break
    }

    const bestMove = rootMove.best_move || null

    rows.push({
      game_id: gameId,
      root_ply: root.rootPly,
      fen,
      side_to_move: sideToMoveFromFen(fen),
      root_move_san: rootMove.san,
      tag: root.tag,
      best_move: bestMove,
      best_move_san: bestMove ? uciToSan(fen, bestMove) : null,
      pv: [],
      eval_cp: Math.round(userEval(rootMove.eval_before)),
      refutation_line: refutationLine,
      refutation_evals: refutationEvals,
      span_plies: root.terminalPly - root.rootPly,
      time_floor_ms: DEFAULT_TIME_FLOOR_MS,
      engine: meta.engine,
      depth: meta.depth,
    })
  }

  return rows
}
