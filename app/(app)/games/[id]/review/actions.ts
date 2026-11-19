'use server'

import type { GameReviewProps } from '@/components/workbench/GameReviewClient'
import { reviewTheirReplyEnabled, reviewTryFirstEnabled } from '@/lib/flags'
import { checkLimits, RATE_LIMITS, userKey } from '@/lib/ratelimit'
import { TOO_MANY_REQUESTS_MESSAGE } from '@/lib/ratelimit-message'
import { loadRelatedBoards } from '@/lib/review/load-related-games'
import { loadGameReview } from '@/lib/review/load-game-review'
import { loadTrainingReturn } from '@/lib/review/training-return'
import { answerTheirReply, theirReply, type ReplyCommit } from '@/lib/review/their-reply'
import { beforeReply, answerReviewMove, reviewExerciseMove, validReviewChoice, type ReviewCommit } from '@/lib/review/try-first'
import { createClient } from '@/lib/supabase/server'
import { createGradingEngine } from '@/lib/training/grading-engine'
import { sanToUci, type AnswerRow } from '@/lib/training/position-answer'
import { SESSION_UUID } from '@/lib/training/next-step'

const unavailable = { error: 'This position has changed. Reload the review to continue.' }

async function ownedReview(gameId: string): Promise<
  { supabase: Awaited<ReturnType<typeof createClient>>; review: GameReviewProps } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sign in again to open this review.' }
  const limited = await checkLimits([{ rule: RATE_LIMITS.commit, key: userKey(user.id) }])
  if (!limited.allowed) return { error: TOO_MANY_REQUESTS_MESSAGE }
  const review = await loadGameReview(supabase, gameId, user.id)
  if (!review || review.game.user_id !== user.id) return unavailable
  return { supabase, review }
}

export async function commitReviewMove(
  gameId: string, positionId: string, presentedFen: string, initialChainRootPly: number | null, chosen: string | null,
): Promise<ReviewCommit> {
  if (!reviewTryFirstEnabled() || !SESSION_UUID.test(gameId) || !SESSION_UUID.test(positionId)) return unavailable
  if (!validReviewChoice(chosen)) return { error: 'Choose a legal move.' }

  const loaded = await ownedReview(gameId)
  if ('error' in loaded) return loaded
  const { supabase, review } = loaded
  const move = reviewExerciseMove(review)
  if (!move || move.fen_before !== presentedFen) return unavailable
  const { data, error } = await supabase.from('training_positions').select('*')
    .eq('id', positionId).eq('game_id', gameId).eq('root_ply', move.ply_number)
    .eq('fen', move.fen_before).eq('side_to_move', review.game.user_color).eq('root_move_san', move.san)
    .maybeSingle()
  if (error) throw new Error('Could not load the review position')
  if (!data) return unavailable

  const answer = await answerReviewMove(data as AnswerRow & { id: string; fen: string }, chosen, createGradingEngine())
  if (!answer) return { error: 'This move could not be checked. Try again.' }
  const reply = reviewTheirReplyEnabled() && theirReply(review)
  if (reply) return beforeReply(answer, {
    prompt: reply.prompt, commitAction: commitReviewReply.bind(null, gameId, reply.prompt.fen, initialChainRootPly, positionId),
  })
  const [trainingReturn, relatedBoards] = await Promise.all([
    loadTrainingReturn(supabase, review, data), loadRelatedBoards(supabase, review),
  ])
  return { answer, review: { ...review, initialChainRootPly, trainingReturn, relatedBoards } }
}

export async function commitReviewReply(
  gameId: string, presentedFen: string, initialChainRootPly: number | null, replayPositionId: string | null, chosen: string | null,
): Promise<ReplyCommit> {
  if (!reviewTheirReplyEnabled() || !SESSION_UUID.test(gameId)) return unavailable
  if (!validReviewChoice(chosen)) return { error: 'Choose a legal move.' }
  const loaded = await ownedReview(gameId)
  if ('error' in loaded) return loaded
  const reply = theirReply(loaded.review)
  if (!reply || reply.prompt.fen !== presentedFen) return unavailable
  const answer = await answerTheirReply(reply, chosen, createGradingEngine())
  if ('error' in answer) return answer
  const relatedBoards = await loadRelatedBoards(loaded.supabase, loaded.review)
  const result = { ...answer, played: reply.played, review: { ...loaded.review, initialChainRootPly, relatedBoards } }
  if (!replayPositionId || !reviewTryFirstEnabled()) return result

  const root = reply.turn
  const { data, error } = await loaded.supabase.from('training_positions')
    .select('id, game_id, root_ply, fen, side_to_move, tag, best_move, span_plies, refutation_line, refutation_evals, eval_cp')
    .eq('id', replayPositionId).eq('game_id', gameId).eq('root_ply', root.ply_number)
    .eq('fen', root.fen_before).eq('side_to_move', loaded.review.game.user_color).eq('root_move_san', root.san).maybeSingle()
  if (error) throw new Error('Could not load the review replay')
  const rootMoveUci = sanToUci(root.fen_before, root.san)
  if (!data?.refutation_line?.length || data.eval_cp === null || !rootMoveUci) return result
  const trainingReturn = await loadTrainingReturn(loaded.supabase, loaded.review, data)
  return { ...result, review: { ...result.review, trainingReturn },
    replay: { fen: root.fen_before, rootMoveUci, startEvalCp: data.eval_cp,
      line: data.refutation_line, evals: data.refutation_evals } }
}
