'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import PuzzleBoard from './PuzzleBoard'
import { PUZZLES } from '@/lib/puzzles/set'
import { markSeen, nextPuzzle, parseSeen, SEEN_STORAGE_KEY, type Puzzle } from '@/lib/puzzles/rules'
import { attempt, isOver, playHeading, playMessage, reply, showLine, showStep, startPuzzle, type PlayState } from '@/lib/puzzles/play'
import { puzzleCaption } from '@/lib/puzzles/caption'

export const COORD_GUTTER = 12

export function puzzleBoardSize(columnWidth: number): number {
  if (columnWidth >= 400) return 400
  return Math.max(200, Math.floor((columnWidth - COORD_GUTTER) / 8) * 8)
}

export const REPLY_DELAY_MS = 450
export const SHOW_STEP_MS = 700

function readSeen(): string[] {
  try {
    return parseSeen(window.localStorage.getItem(SEEN_STORAGE_KEY))
  } catch {
    return []
  }
}

function writeSeen(seen: string[]) {
  try {
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(seen))
  } catch {
  }
}

function firstPuzzle(set: Puzzle[]): Puzzle {
  const seen = readSeen()
  const { puzzle, restart } = nextPuzzle(set, seen)
  if (restart) writeSeen([])
  return puzzle
}

export default function PuzzlePanel({ set = PUZZLES }: { set?: Puzzle[] }) {
  const [state, setState] = useState<PlayState>(() => startPuzzle(firstPuzzle(set)))
  const [said, setSaid] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(320)
  const nextRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setSize(puzzleBoardSize(el.clientWidth))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (state.status !== 'replying') return
    const t = setTimeout(() => setState(s => reply(s)), REPLY_DELAY_MS)
    return () => clearTimeout(t)
  }, [state.status, state.played])

  useEffect(() => {
    if (state.status !== 'showing') return
    const t = setTimeout(() => setState(s => showStep(s)), SHOW_STEP_MS)
    return () => clearTimeout(t)
  }, [state.status, state.played])

  useEffect(() => {
    if (isOver(state)) writeSeen(markSeen(set, readSeen(), state.puzzle.id))
    const message = playMessage(state)
    if (message) setSaid(message)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.missed, state.puzzle.id])

  const onMove = useCallback((uci: string) => {
    setState(s => attempt(s, uci))
  }, [])

  const next = () => {
    const { puzzle, restart } = nextPuzzle(set, readSeen(), state.puzzle.id)
    if (restart) writeSeen([])
    setSaid(playHeading(startPuzzle(puzzle)))
    setState(startPuzzle(puzzle))
  }

  useEffect(() => {
    if (isOver(state)) nextRef.current?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status])

  const over = isOver(state)
  const message = playMessage(state)
  const caption = over ? puzzleCaption(state.puzzle) : null

  return (
    <section className="puzzle-panel flex flex-col gap-3" aria-labelledby="puzzle-heading">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="puzzle-heading" className="font-headline" style={{ fontSize: 20, color: 'var(--text)' }}>
          A puzzle while you wait
        </h2>
        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }} data-testid="puzzle-turn">
          {playHeading(state)}
        </span>
      </div>

      <div ref={wrapRef} className="w-full" style={{ maxWidth: 400 }}>
        <PuzzleBoard state={state} size={size} onMove={onMove} onAnnounce={setSaid} />
      </div>

      <div className="flex items-center justify-between gap-4" style={{ minHeight: 40, maxWidth: 400 }}>
        <p className="text-sm" style={{ color: over ? 'var(--brass)' : 'var(--text)' }} data-testid="puzzle-message">
          {message ?? ' '}
        </p>
        {over ? (
          <button
            ref={nextRef}
            type="button"
            onClick={next}
            className="text-sm px-4 py-2"
            style={{ background: 'var(--brass)', color: 'var(--bg)', border: '1px solid var(--brass)' }}
          >
            Next puzzle
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setState(s => showLine(s))}
            disabled={state.status === 'showing'}
            className="text-sm px-4 py-2"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)', background: 'transparent' }}
          >
            Show me
          </button>
        )}
      </div>

      {caption && (
        <p className="text-xs" style={{ color: 'var(--text-muted)', maxWidth: 400 }} data-testid="puzzle-caption">
          {caption}
        </p>
      )}

      <p className="sr-only" aria-live="polite" data-testid="puzzle-announcement">
        {said}
      </p>
    </section>
  )
}
