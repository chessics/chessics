'use client'

import { useRef, useState } from 'react'
import GameReviewClient, { TrainingReturnLine } from './GameReviewClient'
import ReviewQuestion from './ReviewQuestion'
import ReplyExercise from './ReplyExercise'
import Reveal from '@/components/training/Reveal'
import LosingBranch from '@/components/training/LosingBranch'
import { useBoardSize } from '@/components/training/useBoardSize'
import { useFocusWhenLost } from '@/components/training/focus'
import { planReveal } from '@/lib/training/reveal'
import type { PublicPosition } from '@/lib/training/position-payload'
import type { ReviewReveal, ReviewCommit } from '@/lib/review/try-first'
import '@/components/training/training.css'

interface Props {
  position: PublicPosition
  commitAction: (chosen: string | null) => Promise<ReviewCommit>
}

export default function ReviewExercise({ position, commitAction }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const size = useBoardSize(container)
  const [result, setResult] = useState<(ReviewReveal & { chosen: string | null }) | null>(null)
  const [step, setStep] = useState<'question' | 'reveal' | 'replay' | 'reply' | 'review'>('question')
  const [watched, setWatched] = useState(false)
  const reviewFocus = useFocusWhenLost<HTMLDivElement>(step === 'review')

  async function commit(chosen: string | null) {
    const response = await commitAction(chosen)
    if ('error' in response) return response
    setResult({ ...response, chosen })
    setStep('reveal')
  }

  const { fen, side_to_move: orientation } = position
  if (result && 'reply' in result && step === 'reply') return <ReplyExercise {...result.reply} />
  if (result && 'review' in result && step === 'review') {
    return (
      <div ref={reviewFocus} tabIndex={-1} className="focus-landing" aria-label="Game review" role="region">
        <GameReviewClient {...result.review} />
      </div>
    )
  }
  return (
    <div className="training-root" ref={container}>
      {step === 'question' && <ReviewQuestion fen={fen} orientation={orientation} size={size}
        instructions="Find a move that holds." onCommit={commit} />}
      {result && step === 'reveal' && (
        <Reveal fen={fen} orientation={orientation} size={size} commit={result.answer}
          kind={planReveal(result.chosen, result.answer)} chosenMove={result.chosen} showGameMove awaitingReply={'reply' in result}
          watched={watched} nextLabel={'reply' in result ? 'Find their reply' : 'Continue to game review'}
          onNext={() => setStep('reply' in result ? 'reply' : 'review')}
          onWatch={() => setStep('replay')}>
          {'review' in result && <TrainingReturnLine when={result.review.trainingReturn} />}
        </Reveal>
      )}
      {result && step === 'replay' && result.answer.root_move_uci && result.answer.eval_cp !== null && (
        <LosingBranch fen={fen} orientation={orientation} size={size} rootMoveUci={result.answer.root_move_uci}
          line={result.answer.refutation_line} evals={result.answer.refutation_evals}
          startEvalCp={result.answer.eval_cp} context="watch"
          onDone={() => { setWatched(true); setStep('reveal') }} />
      )}
    </div>
  )
}
