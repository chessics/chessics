'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react'
import ChessBoard from '@/components/workbench/ChessBoard'
import EvalBar from './EvalBar'
import { buildReplay } from '@/lib/training/replay'
import { standing } from '@/lib/training/reveal'
import { useFocusWhenLost } from './focus'

interface LosingBranchProps {
  fen: string
  orientation: 'white' | 'black'
  rootMoveUci: string
  line: string[]
  evals: number[]
  startEvalCp: number
  size: number
  context: 'same-move' | 'watch' | 'threat'
  onDone: () => void
}

const HOLD_START_MS = 1400
const STEP_MS = 1500

function tone(word: string | null): 'up' | 'level' | 'down' {
  if (!word) return 'level'
  if (word.includes('better') || word === 'winning') return 'up'
  if (word.includes('worse') || word === 'losing') return 'down'
  return 'level'
}

export default function LosingBranch({
  fen,
  orientation,
  rootMoveUci,
  line,
  evals,
  startEvalCp,
  size,
  context,
  onDone,
}: LosingBranchProps) {
  const frames = useMemo(
    () => buildReplay(fen, rootMoveUci, line, evals, startEvalCp),
    [fen, rootMoveUci, line, evals, startEvalCp]
  )
  const last = frames.length - 1
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const doneRef = useRef(false)
  const titleRef = useFocusWhenLost<HTMLParagraphElement>(context)
  const mountedAt = useRef(performance.now())

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    onDone()
  }, [onDone])

  useEffect(() => {
    if (!playing) return
    if (index >= last) {
      setPlaying(false)
      return
    }
    const t = setTimeout(() => setIndex(i => Math.min(i + 1, last)), index === 0 ? HOLD_START_MS : STEP_MS)
    return () => clearTimeout(t)
  }, [index, playing, last])

  const step = (d: number) => {
    setPlaying(false)
    setIndex(i => Math.max(0, Math.min(last, i + d)))
  }
  const togglePlay = () => {
    if (index >= last) {
      setIndex(0)
      setPlaying(true)
    } else setPlaying(p => !p)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.repeat || performance.now() - mountedAt.current < 400)) return
      if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'Enter') finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const frame = frames[index]
  let now: string = standing(startEvalCp)
  for (let i = 1; i <= index; i++) if (frames[i].ply?.standing) now = frames[i].ply!.standing!

  const shapes =
    index === 1 && frame.lastMove
      ? [{ orig: frame.lastMove[0], dest: frame.lastMove[1], brush: context === 'threat' ? 'unchecked' : 'mistake', hilite: true }]
      : []

  return (
    <>
      <div className="replay-board">
        <ChessBoard fen={frame.fen} orientation={orientation} lastMove={frame.lastMove} shapes={shapes} size={size} />
        <EvalBar cp={frame.cp} height={size} />
      </div>

      <div className="training-panel replay-panel">
        <div>
          <p ref={titleRef} tabIndex={-1} className="training-verdict">
            {context === 'same-move' ? 'Same move as your game.' : context === 'threat' ? 'The threat' : 'What happened in your game'}
          </p>
          <p className="training-hint">
            {context === 'same-move'
              ? 'Here is what happened next, move by move.'
              : context === 'threat'
                ? "Your move, then your opponent's reply as the engine plays it."
                : 'Your game move, then how the game went from there.'}
          </p>
        </div>

        <div className="replay-status">
          <span className="replay-status-label">{index === 0 ? 'Before your move' : 'Position now'}</span>
          <span className={`replay-status-word is-${tone(now)}`}>You&apos;re {now}</span>
        </div>

        <ol className="replay-moves" aria-live="polite">
          {frames.slice(1, index + 1).map((f, i) => (
            <li key={i} className={i + 1 === index ? 'is-current' : undefined}>
              <span className="replay-san">
                {f.ply!.label} {f.ply!.san}
              </span>
              <span className={`replay-who is-${f.ply!.mover}`}>{f.ply!.mover === 'you' ? 'you' : 'opponent'}</span>
              <span className="replay-after">
                {f.ply!.event && <span className="replay-event">{f.ply!.event}</span>}
                {f.ply!.standing && <span className={`replay-standing is-${tone(f.ply!.standing)}`}>{f.ply!.standing}</span>}
              </span>
            </li>
          ))}
          {index === 0 && <li className="replay-waiting">{context === 'threat' ? 'Your move is next.' : 'Your game move is next.'}</li>}
        </ol>

        <div className="replay-controls">
          <button className="replay-icon" onClick={() => step(-1)} disabled={index === 0} aria-label="Previous move">
            <ChevronLeft size={18} />
          </button>
          <button className="replay-icon" onClick={togglePlay} aria-label={index >= last ? 'Replay' : playing ? 'Pause' : 'Play'}>
            {index >= last ? <RotateCcw size={16} /> : playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button className="replay-icon" onClick={() => step(1)} disabled={index >= last} aria-label="Next move">
            <ChevronRight size={18} />
          </button>
          <span className="replay-keys">← → to step, space to pause</span>
        </div>

        <div className="training-actions">
          <button
            className={`training-btn ${index >= last ? 'training-btn-primary' : ''}`}
            onClick={finish}
          >
            {context !== 'same-move'
              ? 'Back to the answer'
              : index >= last
                ? 'See the answer'
                : 'Skip to the answer'}
          </button>
        </div>
      </div>
    </>
  )
}
