import { Chess, type Move, type Square } from 'chess.js'
import { CAPTURE_PIECES } from '../board/played-capture'
import { STABLE_CP, toUserEval } from '../chains/stands-alone'
import type { Move as StoredMove } from '../supabase/types'

type PlayedRow = Pick<StoredMove, 'ply_number' | 'san' | 'fen_before' | 'fen_after'>
type EvaluatedRow = PlayedRow & Pick<StoredMove, 'eval_before' | 'eval_after'>

export type BoardHabit = 'a piece you just moved' | 'what their last move attacks'

function gainFromCapture(move: Move): number {
  const captured = CAPTURE_PIECES[move.captured!][1]
  const promotion = move.promotion ? CAPTURE_PIECES[move.promotion][1] - 1 : 0
  const gain = captured + promotion
  if (move.piece === 'k') return gain
  return gain - staticExchange(move.after, move.to)
}

export function staticExchange(fen: string, square: Square): number {
  const board = new Chess(fen)
  const target = board.get(square)
  if (target?.type === 'k' || target?.color === board.turn() || !board.isAttacked(square, board.turn())) return 0
  let best = 0
  for (const move of board.moves({ verbose: true })) {
    if (move.to === square && move.captured) best = Math.max(best, gainFromCapture(move))
  }
  return best
}

export function losablePieces(fen: string): Set<Square> {
  const loose = new Set<Square>()
  for (const move of new Chess(fen).moves({ verbose: true })) {
    if (!move.captured || move.captured === 'p' || move.captured === 'k' || loose.has(move.to)) continue
    if (gainFromCapture(move) >= 2) loose.add(move.to)
  }
  return loose
}

function replay(row: PlayedRow): Move | null {
  try {
    const move = new Chess(row.fen_before).move(row.san, { strict: true })
    return move.after === row.fen_after ? move : null
  } catch {
    return null
  }
}

export function boardHabit(row: EvaluatedRow, previous?: PlayedRow): BoardHabit | null {
  if (row.eval_before === null || row.eval_after === null) return null
  const color = row.ply_number % 2 === 1 ? 'white' : 'black'
  const before = toUserEval(row.eval_before, color)
  if (before < STABLE_CP || before - toUserEval(row.eval_after, color) <= 200) return null

  const move = replay(row)
  if (!move || move.color !== (color === 'white' ? 'w' : 'b') || new Chess(move.after).isGameOver()) return null
  const loose = losablePieces(move.after)
  if (loose.has(move.to)) return 'a piece you just moved'
  if (!loose.size || previous?.ply_number !== row.ply_number - 1 || previous.fen_after !== move.before) return null
  if (!replay(previous)) return null

  const fields = move.before.split(' ')
  fields[1] = move.color === 'w' ? 'b' : 'w'
  fields[3] = '-'
  const threatened = losablePieces(fields.join(' '))
  const alreadyLoose = losablePieces(previous.fen_before)
  const ignored = Array.from(loose).some(square => threatened.has(square) && !alreadyLoose.has(square))
  return ignored ? 'what their last move attacks' : null
}
