import { Chess } from 'chess.js'
import type { GameReviewProps } from '@/components/workbench/GameReviewClient'
import { decidedByRules, holdsAgainstBest, legalUci, verdictAtDepth, type GradingEngine } from '@/lib/training/grading'
import { previousMove } from '@/lib/training/previous-move'
import { reviewExerciseMove, validReviewChoice } from './try-first'

export interface ReplyPrompt {
  fen: string
  orientation: 'white' | 'black'
  turningSan: string
}

export interface ReplyExerciseProps {
  prompt: ReplyPrompt
  commitAction: (chosen: string | null) => Promise<ReplyCommit>
}

export interface ReviewReplay {
  fen: string
  rootMoveUci: string
  startEvalCp: number
  line: string[]
  evals: number[]
}

export interface CommittedReply {
  replay?: ReviewReplay
  correct: boolean | null
  played: { san: string; from: string; to: string; fenAfter: string }
  review: GameReviewProps
}

export type ReplyCommit = CommittedReply | { error: string }

export function theirReply(review: GameReviewProps) {
  const turn = reviewExerciseMove(review)
  const orientation = review.game.user_color
  if (!turn || !orientation) return null
  const reply = review.moves.find(m => m.ply_number === turn.ply_number + 1)
  if (!reply || turn.fen_after !== reply.fen_before || !previousMove(reply.fen_before, turn)) return null
  const played = previousMove(reply.fen_after, reply)
  if (!played || reply.eval_before === null || reply.eval_after === null) return null
  const sign = orientation === 'white' ? -1 : 1
  if (!holdsAgainstBest(sign * reply.eval_before, sign * reply.eval_after)) return null
  return {
    turn,
    prompt: { fen: reply.fen_before, orientation, turningSan: turn.san },
    played: { san: played.san, from: played.from, to: played.to, fenAfter: reply.fen_after },
  }
}

export async function answerTheirReply(
  reply: NonNullable<ReturnType<typeof theirReply>>, chosen: string | null, engine: GradingEngine,
): Promise<{ correct: boolean | null } | { error: string }> {
  const { fen } = reply.prompt
  if (chosen === null) return { correct: null }
  if (!validReviewChoice(chosen) || legalUci(fen, chosen) !== chosen) return { error: 'Choose a legal move.' }
  const board = new Chess(fen)
  const move = board.move({ from: chosen.slice(0, 2), to: chosen.slice(2, 4), promotion: chosen[4] })
  if (move.san === reply.played.san) return { correct: true }

  const best = await engine.evaluate(fen)
  if (!best) return { correct: null }
  const sign = move.color === 'w' ? 1 : -1
  const terminal = decidedByRules(board)
  if (terminal !== null) return { correct: verdictAtDepth(sign * best.cp, terminal, best.depth) }
  const after = await engine.evaluate(board.fen())
  return { correct: after && verdictAtDepth(sign * best.cp, sign * after.cp, Math.min(best.depth, after.depth)) }
}
