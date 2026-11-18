'use client'

import { useRef, useState } from 'react'
import type { CommittedReply, ReplyExerciseProps } from '@/lib/review/their-reply'
import { useBoardSize } from '@/components/training/useBoardSize'
import { useFocusWhenLost } from '@/components/training/focus'
import LosingBranch from '@/components/training/LosingBranch'
import ChessBoard from './ChessBoard'
import GameReviewClient, { TrainingReturnLine } from './GameReviewClient'
import ReviewQuestion from './ReviewQuestion'
import '@/components/training/training.css'

interface RevealProps {
  result: CommittedReply
  orientation: 'white' | 'black'
  skipped: boolean
  size: number
  onContinue: () => void
  onReplay: () => void
}

export function ReplyReveal({ result, orientation, skipped, size, onContinue, onReplay }: RevealProps) {
  const verdict = useFocusWhenLost<HTMLParagraphElement>(result)
  let message = 'The engine couldn’t check that reply.'
  if (skipped) message = 'Here’s the reply.'
  else if (result.correct === true) message = 'That reply works.'
  else if (result.correct === false) message = 'They had a stronger reply.'

  return (
    <div className="training-grid">
      <ChessBoard fen={result.played.fenAfter} orientation={orientation} size={size}
        lastMove={[result.played.from, result.played.to]} viewOnly />
      <div className="training-panel">
        <p ref={verdict} tabIndex={-1} className="training-verdict focus-landing">{message}</p>
        <p className="training-sentence">In your game they played {result.played.san}.</p>
        <div className="training-actions">
          <button className="training-btn training-btn-primary" onClick={onContinue}>Continue to game review</button>
          {result.replay && <button className="training-btn training-btn-quiet" onClick={onReplay}>
            See what happened in your game
          </button>}
        </div>
        <TrainingReturnLine when={result.review.trainingReturn} />
      </div>
    </div>
  )
}

export default function ReplyExercise({ prompt, commitAction }: ReplyExerciseProps) {
  const container = useRef<HTMLDivElement>(null)
  const size = useBoardSize(container)
  const [result, setResult] = useState<(CommittedReply & { skipped: boolean }) | null>(null)
  const [step, setStep] = useState<'answer' | 'replay' | 'review'>('answer')
  const reviewFocus = useFocusWhenLost<HTMLDivElement>(step === 'review')

  async function commit(chosen: string | null) {
    const response = await commitAction(chosen)
    if ('error' in response) return response
    setResult({ ...response, skipped: chosen === null })
  }
  if (result && step === 'review') return (
    <div ref={reviewFocus} tabIndex={-1} className="focus-landing" aria-label="Game review" role="region">
      <GameReviewClient {...result.review} />
    </div>
  )

  let board
  if (!result) {
    board = <ReviewQuestion fen={prompt.fen} orientation={prompt.orientation} size={size}
      instructions="They answered. Find their best reply." context={`You played ${prompt.turningSan}.`} onCommit={commit} />
  } else if (result.replay && step === 'replay') {
    board = <LosingBranch {...result.replay} orientation={prompt.orientation} size={size} context="watch"
      onDone={() => setStep('answer')} />
  } else {
    board = <ReplyReveal result={result} skipped={result.skipped} orientation={prompt.orientation} size={size}
      onContinue={() => setStep('review')} onReplay={() => setStep('replay')} />
  }
  return <div className="training-root" ref={container}>{board}</div>
}
