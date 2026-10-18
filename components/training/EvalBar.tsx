'use client'

import { evalBarFraction } from '@/lib/training/reveal'

interface EvalBarProps {
  cp: number
  height: number
}

export default function EvalBar({ cp, height }: EvalBarProps) {
  const fraction = evalBarFraction(cp)
  const losing = fraction < 0.5

  return (
    <div
      aria-hidden
      style={{
        width: 12,
        height,
        position: 'relative',
        background: 'var(--surface-3)',
        borderLeft: '1px solid var(--border)',
        borderRight: '1px solid var(--border)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transformOrigin: 'bottom',
          transform: `scaleY(${fraction})`,
          background: losing ? 'var(--oxblood)' : 'var(--text)',
          opacity: 0.85,
          transition:
            'transform 700ms cubic-bezier(0.22, 0.8, 0.24, 1), background-color 400ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: 1,
          background: 'var(--brass)',
          opacity: 0.6,
        }}
      />
    </div>
  )
}
