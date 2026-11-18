'use client'

import type { CSSProperties } from 'react'
import { evalBarFraction } from '@/lib/training/reveal'

interface EvalBarProps {
  cp: number
  height: number
}

export default function EvalBar({ cp, height }: EvalBarProps) {
  const fraction = evalBarFraction(cp)
  return (
    <div
      aria-hidden
      className="training-eval-bar"
      style={{ '--bar-length': `${height}px`, '--player-share': `${fraction * 100}%` } as CSSProperties}
    >
      <div className="training-eval-fill" style={{ background: fraction < 0.5 ? 'var(--oxblood)' : 'var(--text)' }} />
    </div>
  )
}
