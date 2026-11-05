'use client'

import { useEffect, useRef } from 'react'
import { formatSpent } from '@/lib/clock/format'
import { stripKey, stripTabStop, type TimeBar } from '@/lib/review/clock-view'

const FILL_H = 40
const MARK_H = 2
const TICK_H = 3
const GAP = 2

const MARK_COLOR: Record<'root' | 'blunder' | 'none', string> = {
  root: 'var(--brass)',
  blunder: 'var(--blunder)',
  none: 'var(--text-muted)',
}

function barLabel(b: TimeBar): string {
  const time = b.spentMs === null ? 'time not recorded' : formatSpent(b.spentMs)
  const marks = [b.root && 'root', b.blunder && 'blunder'].filter(Boolean).join(' and ')
  return `Move ${b.moveNumber}, ${b.san}: ${time}${marks ? `, ${marks}` : ''}`
}

interface Props {
  bars: TimeBar[]
  currentPly: number
  width: number
  onSelect: (ply: number) => void
}

export default function TimeStrip({ bars, currentPly, width, onSelect }: Props) {
  const plies = bars.map((b) => b.ply)
  const stop = stripTabStop(plies, currentPly)
  const groupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const g = groupRef.current
    if (!g || !g.contains(document.activeElement)) return
    g.querySelector<HTMLButtonElement>(`button[data-bar-ply="${plies[stop]}"]`)?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop])

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const next = stripKey(e.key, stop, bars.length)
    if (next === null) return
    e.preventDefault()
    e.stopPropagation()
    onSelect(bars[next].ply)
  }

  const known = bars.filter((b) => b.spentMs !== null)
  const longest = known.reduce<TimeBar | null>((a, b) => (a === null || (b.spentMs ?? 0) > (a.spentMs ?? 0) ? b : a), null)
  const hasRoot = bars.some((b) => b.mark === 'root')
  const hasBlunder = bars.some((b) => b.mark === 'blunder')

  return (
    <div data-testid="time-strip" style={{ width, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        ref={groupRef}
        role="group"
        aria-label="Time spent on each of your moves. Use the arrow keys to move along it, Home and End for the first and the last."
        onKeyDown={onKey}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          gap: bars.length > 120 ? 0 : 1,
          height: FILL_H + GAP + MARK_H + GAP + TICK_H,
        }}
      >
        <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: FILL_H, height: 1, background: 'var(--border)' }} />
        {bars.map((b, i) => {
          const active = b.ply === currentPly
          const mark = b.mark ?? 'none'
          return (
            <button
              key={b.ply}
              type="button"
              title={barLabel(b)}
              aria-label={barLabel(b)}
              aria-current={active ? 'step' : undefined}
              tabIndex={i === stop ? 0 : -1}
              onClick={() => onSelect(b.ply)}
              data-bar-ply={b.ply}
              data-mark={mark}
              style={{
                flex: '1 1 0',
                minWidth: 1,
                height: '100%',
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                position: 'relative',
              }}
            >
              <span
                aria-hidden
                style={{
                  display: 'block',
                  height: b.spentMs === null ? 0 : Math.max(1, Math.round(b.ratio * FILL_H)),
                  background: MARK_COLOR[mark],
                }}
              />
              <span aria-hidden style={{ display: 'block', height: MARK_H, marginTop: GAP, background: b.mark ? MARK_COLOR[mark] : 'transparent' }} />
              <span aria-hidden style={{ display: 'block', height: TICK_H, marginTop: GAP, background: active ? 'var(--text)' : 'transparent' }} />
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
        <span>
          Time on each of your moves
          {longest && longest.spentMs !== null && (
            <>
              , longest <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)' }}>{formatSpent(longest.spentMs)}</span> on move{' '}
              {longest.moveNumber}
            </>
          )}
        </span>
        {(hasRoot || hasBlunder) && (
          <span data-testid="time-strip-key" style={{ display: 'inline-flex', gap: 12, marginLeft: 'auto' }}>
            {hasRoot && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span aria-hidden style={{ width: 8, height: 8, background: 'var(--brass)' }}></span>Root
              </span>
            )}
            {hasBlunder && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span aria-hidden style={{ width: 8, height: 8, background: 'var(--blunder)' }}></span>Blunder
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
