'use client'

import { useId, useMemo } from 'react'
import { evalToWhitePercent, evalWords } from '@/lib/review/eval-words'
import type { Color, Move } from '@/lib/supabase/types'

type GraphMove = Pick<Move, 'ply_number' | 'san' | 'eval_before' | 'eval_after'>

interface Props {
  moves: GraphMove[]
  userColor: Color | null
  momentPly: number | null
  currentPly: number
  width: number
  onSelect: (ply: number) => void
}

function graphPath(moves: GraphMove[], userColor: Color | null): string | null {
  if (!moves.length || moves.some((m, i) => m.ply_number !== i + 1)) return null
  const scores = [moves[0].eval_before, ...moves.map(m => m.eval_after)]
  const path: string[] = []
  let connected = false
  let hasLine = false
  for (let ply = 0; ply < scores.length; ply++) {
    const cp = scores[ply]
    if (cp === null || !Number.isFinite(cp)) {
      connected = false
      continue
    }
    const white = evalToWhitePercent(cp)
    const y = userColor === 'black' ? white : 100 - white
    path.push(`${connected ? 'L' : 'M'}${ply} ${y.toFixed(2)}`)
    if (connected) hasLine = true
    connected = true
  }
  return hasLine ? path.join(' ') : null
}

function notation(move: GraphMove): string {
  const ply = move.ply_number
  return `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '…'}${move.san}`
}

export default function EvalGraph({ moves, userColor, momentPly, currentPly, width, onSelect }: Props) {
  const captionId = useId()
  const path = useMemo(() => graphPath(moves, userColor), [moves, userColor])
  if (!path) return null

  const move = moves[currentPly - 1]
  const position = move ? `After ${notation(move)}` : 'Starting position'
  const words = evalWords(move ? move.eval_after : moves[0].eval_before, userColor)
  const moment = momentPly === null ? null : moves[momentPly - 1]
  return (
    <figure className="review-eval-graph" style={{ width }}>
      <figcaption id={captionId}>
        Higher is better for {userColor === 'black' ? 'Black' : 'White'}.
        {moment && <span className="review-graph-key">Key move {notation(moment)}</span>}
      </figcaption>
      <div className="review-graph-track">
        <svg aria-hidden="true" viewBox={`0 0 ${moves.length} 100`} preserveAspectRatio="none">
          <path d={`M0 50 H${moves.length}`} stroke="var(--border-strong)" />
          <path d={path} stroke="var(--brass)" strokeWidth="2" />
          {moment && <path d={`M${moment.ply_number} 0 V100`} stroke="var(--text)" strokeDasharray="3 3" />}
        </svg>
        <input type="range" min={0} max={moves.length} step={1} value={currentPly}
          aria-label="Choose a game position" aria-describedby={captionId}
          aria-valuetext={`${position}. ${words ?? 'No evaluation recorded'}.`}
          onChange={event => onSelect(event.currentTarget.valueAsNumber)} />
      </div>
    </figure>
  )
}
