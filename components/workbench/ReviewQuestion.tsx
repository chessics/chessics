'use client'

import { useState } from 'react'
import TrainingBoard, { type DrawnArrow } from '@/components/training/TrainingBoard'
import { useFocusWhenLost } from '@/components/training/focus'
import { arrowUci } from '@/lib/training/keyboard-board'

interface Props {
  fen: string
  orientation: 'white' | 'black'
  size: number
  instructions: string
  context?: string
  onCommit: (chosen: string | null) => Promise<void | { error: string }>
}

export default function ReviewQuestion({ fen, orientation, size, instructions, context, onCommit }: Props) {
  const [arrow, setArrow] = useState<DrawnArrow | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const heading = useFocusWhenLost<HTMLHeadingElement>(fen)
  async function commit(chosen: string | null) {
    if (pending) return
    setPending(true)
    setError('')
    try {
      const response = await onCommit(chosen)
      if (response) setError(response.error)
    } catch {
      setError('The answer did not load. Try again.')
    } finally {
      setPending(false)
    }
  }
  return <>
    <header className="training-header">
      <h1 ref={heading} tabIndex={-1} className="training-title focus-landing">Your move.</h1>
    </header>
    <div className="training-grid">
      <TrainingBoard fen={fen} orientation={orientation} movingSide={fen.split(' ')[1] === 'w' ? 'white' : 'black'} size={size}
        arrows={arrow ? [arrow] : []} selected={arrow ? 0 : null} onDraw={move => { if (!pending) setArrow(move) }}
        onSelectArrow={() => {}} onAnnounce={setMessage} />
      <div className="training-panel">
        {context && <p className="training-sentence">{context}</p>}
        <p className="training-instructions-main">{instructions}</p>
        <p className="training-hint">Draw your move on the board, then press Commit.</p>
        <p className="sr-only" aria-live="polite">{message}</p>
        <div className="training-actions">
          <button className="training-btn training-btn-primary" disabled={!arrow || pending}
            onClick={() => arrow && commit(arrowUci(arrow))}>{pending ? 'Checking' : 'Commit'}</button>
          <button className="training-btn training-btn-quiet" disabled={pending}
            onClick={() => commit(null)}>Just show me</button>
        </div>
        {error && <p className="training-hint" role="alert">{error}</p>}
      </div>
    </div>
  </>
}
