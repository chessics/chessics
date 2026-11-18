'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import RecurrenceStrip, { type StripBarState } from '@/components/workbench/RecurrenceStrip'
import PanelBoundary from './PanelBoundary'
import { INITIAL_ESTIMATE, type AnalysisWait } from '@/lib/sync/progress'

const PuzzlePanel = dynamic(() => import('./PuzzlePanel'), {
  ssr: false,
  loading: () => <div aria-hidden="true" style={{ minHeight: 320, borderTop: '1px solid var(--border)' }} />,
})

export type StageStatus = 'pending' | 'active' | 'complete'

export interface AnalyzingViewProps {
  platform: string
  batchSize: number
  gamesDone: number
  stages: StageStatus[]
  wait: AnalysisWait | null
  readyHref: string | null
  puzzles: boolean
  onTouched?: () => void
}

function platformLabel(platform: string): string {
  if (platform === 'chess.com') return 'Chess.com'
  if (platform === 'lichess') return 'Lichess'
  return platform
}

export function puzzleTouchProps(showing: boolean, onTouched?: () => void) {
  return showing && onTouched ? { onPointerDownCapture: onTouched, onKeyDownCapture: onTouched } : {}
}

export const PUZZLE_OPEN_MIN_WIDTH = 640

export default function AnalyzingView({
  platform,
  batchSize,
  gamesDone,
  stages,
  wait,
  readyHref,
  puzzles,
  onTouched,
}: AnalyzingViewProps) {
  const [wide, setWide] = useState(false)
  const [opened, setOpened] = useState(false)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return setWide(true)
    const mq = window.matchMedia(`(min-width: ${PUZZLE_OPEN_MIN_WIDTH}px)`)
    const update = () => setWide(mq.matches)
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [])

  const bars: StripBarState[] = Array.from({ length: batchSize }, (_, i) => (i < gamesDone ? 'quiet' : 'pending'))

  const stageItems = [
    `Get games from ${platformLabel(platform)}`,
    'Check the moves',
    'Look for patterns',
    'Write your report',
  ]

  const finished = stages[3] === 'complete'
  const { message, estimate } = finished
    ? { message: 'Your report is ready.', estimate: null }
    : wait ?? { message: `Getting your games from ${platformLabel(platform)}.`, estimate: INITIAL_ESTIMATE }

  const showPuzzle = puzzles && (wide || opened)

  return (
    <main className="min-h-screen px-4 py-10 sm:px-8 sm:py-14" style={{ background: 'var(--bg)' }}>
      <div className={puzzles ? 'analyzing-layout' : 'analyzing-layout analyzing-layout--single'}>
        <div className="flex flex-col gap-10 min-w-0">
          <div>
            <a href="/" className="font-logo inline-block" style={{ fontSize: 24, color: 'var(--text)' }}>
              chess<span style={{ color: 'var(--brass)' }}>ics</span>
            </a>
            <h1 className="font-headline mt-4" style={{ fontSize: 28, color: 'var(--text)' }}>
              Reading your games
            </h1>
          </div>

          <div className="flex flex-col gap-3">
            <div aria-hidden="true"><RecurrenceStrip bars={bars} height={40} /></div>
            <div role="status" aria-atomic="true" className={readyHref ? 'sr-only' : 'flex flex-col gap-1'}>
              <p className="text-sm" style={{ color: 'var(--text)' }}>
                {message}
              </p>
              {estimate && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{estimate}</p>}
            </div>
          </div>

          <div className="flex flex-col">
            {stageItems.map((label, i) => {
              const status = stages[i]
              return (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 py-3"
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  <span
                    className="text-sm"
                    style={{
                      color:
                        status === 'pending'
                          ? 'var(--text-dim)'
                          : status === 'complete'
                            ? 'var(--text-muted)'
                            : 'var(--text)',
                    }}
                  >
                    {label}
                  </span>
                  <span
                    className="text-xs font-mono"
                    style={{
                      color: status === 'active' ? 'var(--brass)' : 'var(--text-dim)',
                    }}
                  >
                    {status === 'complete' ? 'done' : status === 'active' ? 'working' : ''}
                  </span>
                </div>
              )
            })}
          </div>

          {readyHref ? (
            <a
              href={readyHref}
              className="self-start text-sm px-5 py-3"
              style={{ background: 'var(--brass)', color: 'var(--bg)', border: '1px solid var(--brass)' }}
              data-testid="report-ready"
            >
              Your report is ready
            </a>
          ) : !finished && (
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
              Keep this tab open until your report is ready.
            </p>
          )}
        </div>

        {puzzles && (
          <div className="analyzing-puzzle min-w-0" {...puzzleTouchProps(showPuzzle, onTouched)}>
            {!wide && !opened && (
              <button
                type="button"
                onClick={() => {
                  setOpened(true)
                  onTouched?.()
                }}
                className="w-full text-left text-sm py-3"
                style={{ color: 'var(--text)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'transparent' }}
                aria-expanded={false}
                data-testid="puzzle-open"
              >
                Try a puzzle while you wait
              </button>
            )}
            {showPuzzle && (
              <PanelBoundary>
                <PuzzlePanel />
              </PanelBoundary>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
