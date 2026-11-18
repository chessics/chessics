import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { reviewTheirReplyEnabled, reviewTryFirstEnabled } from '@/lib/flags'
import { loadGameReview } from '@/lib/review/load-game-review'
import { reviewExerciseMove } from '@/lib/review/try-first'
import { POSITION_PUBLIC_SELECT, toPublicPosition, type PublicPositionRow } from '@/lib/training/position-payload'
import GameReviewClient from '@/components/workbench/GameReviewClient'
import ReviewExercise from '@/components/workbench/ReviewExercise'
import ReplyExercise from '@/components/workbench/ReplyExercise'
import { theirReply } from '@/lib/review/their-reply'
import { commitReviewMove, commitReviewReply } from './actions'

export const metadata: Metadata = { title: 'Game review' }
export const maxDuration = 15

interface Props {
  params: { id: string }
  searchParams: { chain?: string }
}

export default async function GameReviewPage({ params, searchParams }: Props) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    const chain = new URLSearchParams()
    if (typeof searchParams.chain === 'string' && /^\d+$/.test(searchParams.chain)) chain.set('chain', searchParams.chain)
    const review = `/games/${encodeURIComponent(params.id)}/review${chain.size ? `?${chain}` : ''}`
    redirect(`/login?${new URLSearchParams({ next: review })}`)
  }

  const review = await loadGameReview(supabase, params.id, session.user.id)
  if (!review) notFound()
  const chain = searchParams.chain ? parseInt(searchParams.chain, 10) : null
  const initialChainRootPly = Number.isFinite(chain) ? chain : null

  if (reviewTryFirstEnabled()) {
    const move = reviewExerciseMove(review)
    if (move) {
      const { data, error } = await supabase.from('training_positions')
        .select(POSITION_PUBLIC_SELECT)
        .eq('game_id', params.id).eq('root_ply', move.ply_number)
        .eq('fen', move.fen_before).eq('side_to_move', review.game.user_color)
        .eq('root_move_san', move.san).not('best_move', 'is', null).not('eval_cp', 'is', null)
        .returns<PublicPositionRow[]>().maybeSingle()
      if (error) throw new Error('Could not load the review position')
      if (data) {
        return <ReviewExercise key={data.id + data.fen} position={toPublicPosition(data)}
          commitAction={commitReviewMove.bind(null, params.id, data.id, data.fen, initialChainRootPly)} />
      }
    }
  }
  const reply = reviewTheirReplyEnabled() && theirReply(review)
  if (reply) return <ReplyExercise key={params.id + reply.prompt.fen} prompt={reply.prompt}
    commitAction={commitReviewReply.bind(null, params.id, reply.prompt.fen, initialChainRootPly, null)} />
  return <GameReviewClient {...review} initialChainRootPly={initialChainRootPly} />
}
