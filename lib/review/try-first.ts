import type { GameReviewProps } from '@/components/workbench/GameReviewClient'
import type { ReplyExerciseProps } from './their-reply'
import { keyMoment } from './key-moment'
import { gradeCommit, legalUci, type GradingEngine } from '@/lib/training/grading'
import { sanToUci, positionAnswer, type AnswerRow } from '@/lib/training/position-answer'
import type { CommitResponse } from '@/lib/training/api-types'

export function reviewExerciseMove({ game, moves, causalChains }: GameReviewProps) {
  if (!game.user_color || game.result === 'win') return null
  const moment = keyMoment({ result: game.result, userColor: game.user_color, moves, chains: causalChains })
  const move = moves.find(m => m.ply_number === moment?.ply)
  const turn = game.user_color === 'white' ? 'w' : 'b'
  return move?.fen_before.split(' ')[1] === turn ? move : null
}

export type ReviewAnswer = Omit<CommitResponse, 'under_floor'>
export interface CommittedReview {
  answer: ReviewAnswer
  review: GameReviewProps
}

export type ReviewReveal = CommittedReview | { answer: ReviewAnswer; reply: ReplyExerciseProps }
export type ReviewCommit = ReviewReveal | { error: string }

export function beforeReply(answer: ReviewAnswer, reply: ReplyExerciseProps): ReviewReveal {
  return {
    answer: { ...answer, refutation_line: [], refutation_evals: [], pv: [], tag: null,
      receipt: { ...answer.receipt, tag: null } },
    reply,
  }
}

export function validReviewChoice(choice: unknown): choice is string | null {
  return choice === null || (typeof choice === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(choice))
}

export async function answerReviewMove(
  row: AnswerRow & { id: string; fen: string }, chosen: string | null, engine: GradingEngine,
): Promise<ReviewAnswer | null> {
  const legal = chosen === null ? null : legalUci(row.fen, chosen)
  if (chosen !== null && (!legal || (chosen.length === 5 && chosen !== legal))) return null
  const gameMove = sanToUci(row.fen, row.root_move_san)
  if (row.eval_cp === null || !gameMove || !row.best_move || !legalUci(row.fen, row.best_move)) return null
  const { correct, ...grading } = await gradeCommit({
    fen: row.fen, chosenMove: legal, bestMove: row.best_move, gameMoveUci: gameMove,
  }, engine)
  return {
    ...positionAnswer(row, gameMove), position_id: row.id, correct, grading,
    recurrence: null, play_from: null,
  }
}
