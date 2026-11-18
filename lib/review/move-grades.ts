import { Chess } from 'chess.js'
import type { Move } from '@/lib/supabase/types'

export const MOVE_GRADES = {
  brilliant: { label: 'Brilliant', symbol: '!!' },
  excellent: { label: 'Excellent', symbol: '!' },
  good: { label: 'Good', symbol: '✓' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!' },
  mistake: { label: 'Mistake', symbol: '?' },
  blunder: { label: 'Blunder', symbol: '??' },
  ungraded: { label: 'Not graded', symbol: '–' },
} as const

export type MoveGrade = keyof typeof MOVE_GRADES

type GradeableMove = Pick<Move, 'ply_number' | 'san' | 'fen_before' | 'fen_after' | 'eval_before' | 'eval_after' | 'classification'>

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const SACRIFICE_LOSS = 2
const MAX_PREEXISTING_EDGE_CP = 250
const MAX_SACRIFICE_EVAL_LOSS_CP = 35
const MIN_SACRIFICE_EVAL_CP = -65

function materialBalance(chess: Chess, mover: 'w' | 'b'): number {
  return chess.board().flat().reduce((total, piece) => (
    piece ? total + (piece.color === mover ? 1 : -1) * PIECE_VALUE[piece.type] : total
  ), 0)
}

function acceptedSacrifice(move: GradeableMove, reply?: GradeableMove, followUp?: GradeableMove): boolean {
  if (!reply || !followUp || reply.ply_number !== move.ply_number + 1 || followUp.ply_number !== reply.ply_number + 1) return false
  if (move.fen_after !== reply.fen_before || reply.fen_after !== followUp.fen_before) return false
  const side = move.ply_number % 2 === 1 ? 1 : -1
  const { eval_before: before } = move
  if (before === null || !Number.isFinite(before) || side * before >= MAX_PREEXISTING_EDGE_CP) return false
  const floor = Math.max(MIN_SACRIFICE_EVAL_CP, side * before - MAX_SACRIFICE_EVAL_LOSS_CP)
  if (![move.eval_after, reply.eval_after, followUp.eval_after].every(score => (
    score !== null && Number.isFinite(score) && side * score >= floor
  ))) return false

  try {
    const chess = new Chess(move.fen_before)
    const mover = chess.turn()
    if (mover !== (side === 1 ? 'w' : 'b')) return false
    const beforeMaterial = materialBalance(chess, mover)
    const offer = chess.move(move.san, { strict: true })
    if (!offer || offer.promotion || PIECE_VALUE[offer.piece] < SACRIFICE_LOSS) return false
    const capture = chess.move(reply.san, { strict: true })
    if (!capture || capture.to !== offer.to || capture.captured !== offer.piece) return false
    if (beforeMaterial - materialBalance(chess, mover) < SACRIFICE_LOSS) return false
    if (!chess.move(followUp.san, { strict: true })) return false
    return beforeMaterial - materialBalance(chess, mover) >= SACRIFICE_LOSS
  } catch {
    return false
  }
}

export function reviewMoveGrade(move: GradeableMove, reply?: GradeableMove, followUp?: GradeableMove): MoveGrade {
  const mark = move.classification
  if (mark === 'blunder' || mark === 'mistake' || mark === 'inaccuracy') return mark
  if (acceptedSacrifice(move, reply, followUp)) return 'brilliant'
  if (mark === 'excellent') return mark
  if (mark === 'good' || mark === 'brilliant') return 'good'
  return [move.eval_before, move.eval_after].every(score => score !== null && Number.isFinite(score)) ? 'good' : 'ungraded'
}
