'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import PuzzleBoard from './PuzzleBoard'
import { PUZZLES } from '@/lib/puzzles/set'
import { legalMove, type Puzzle } from '@/lib/puzzles/rules'
import { fromLichess, LICHESS_SET_URL, parseLichessSet } from '@/lib/puzzles/lichess'
import {
  climb,
  LADDER_STORAGE_KEY,
  OLD_SEEN_STORAGE_KEY,
  outcomeOf,
  parseLadder,
  pickPuzzle,
  served,
  type Ladder,
  type Pickable,
} from '@/lib/puzzles/adaptive'
import { attempt, isOver, lead, playHeading, playMessage, reply, showLine, showStep, startPuzzle, type PlayState } from '@/lib/puzzles/play'
import { puzzleCaption } from '@/lib/puzzles/caption'

export const COORD_GUTTER = 12

export const PUZZLE_BOARD_MAX = 640
export const PUZZLE_CHROME_HEIGHT = 240

export function puzzleBoardSize(columnWidth: number, viewportHeight = Infinity): number {
  const byWidth = columnWidth - COORD_GUTTER
  const byHeight = viewportHeight - PUZZLE_CHROME_HEIGHT
  const fit = Math.min(PUZZLE_BOARD_MAX, byWidth, byHeight)
  return Math.max(200, Math.floor(fit / 8) * 8)
}

export const REPLY_DELAY_MS = 450
export const SHOW_STEP_MS = 700
export const LEAD_DELAY_MS = 650
export const SET_LOAD_TIMEOUT_MS = 5000
export const SET_MIN_ROWS = 50
export const FALLBACK_RATING = 800

export interface PoolItem extends Pickable {
  load: () => Puzzle | null
}

export function poolFromPuzzles(set: Puzzle[]): PoolItem[] {
  return set.map(p => ({ id: p.id, rating: p.rating ?? FALLBACK_RATING, theme: p.theme, load: () => p }))
}

export function poolFromLichess(json: unknown): PoolItem[] {
  return parseLichessSet(json).map(e => ({ id: e.id, rating: e.rating, theme: e.theme, load: () => fromLichess(e.row) }))
}

function readLadder(): Ladder {
  try {
    return parseLadder(window.localStorage.getItem(LADDER_STORAGE_KEY))
  } catch {
    return parseLadder(null)
  }
}

function writeLadder(ladder: Ladder) {
  try {
    window.localStorage.setItem(LADDER_STORAGE_KEY, JSON.stringify(ladder))
    window.localStorage.removeItem(OLD_SEEN_STORAGE_KEY)
  } catch {
  }
}

export function choosePuzzle(
  pool: PoolItem[],
  ladder: Ladder,
  random: () => number,
  current: string | null = null
): { puzzle: Puzzle; ladder: Ladder } | null {
  let left = pool
  for (let tries = 0; tries < 20 && left.length > 0; tries++) {
    const item = pickPuzzle(left, ladder, random, current)
    if (!item) return null
    const puzzle = item.load()
    if (puzzle) return { puzzle, ladder: served(ladder, item) }
    left = left.filter(p => p.id !== item.id)
  }
  return null
}

export function levelHint(before: number, after: number): string | null {
  if (after > before) return 'The next one is harder.'
  if (after < before) return 'The next one is easier.'
  return null
}

export function leadAnnouncement(p: Puzzle): string | null {
  if (!p.lead) return null
  const move = legalMove(p.lead.fen, p.lead.move)
  if (!move) return null
  const mover = p.side === 'white' ? 'Black' : 'White'
  return `${mover} played ${move.san}. ${p.side === 'white' ? 'White' : 'Black'} to move.`
}

async function loadPool(): Promise<PoolItem[]> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), SET_LOAD_TIMEOUT_MS)
  try {
    const res = await fetch(LICHESS_SET_URL, { signal: ctrl.signal })
    if (!res.ok) return poolFromPuzzles(PUZZLES)
    const pool = poolFromLichess(await res.json())
    return pool.length >= SET_MIN_ROWS ? pool : poolFromPuzzles(PUZZLES)
  } catch {
    return poolFromPuzzles(PUZZLES)
  } finally {
    clearTimeout(timer)
  }
}

export default function PuzzlePanel({ set }: { set?: Puzzle[] }) {
  const poolRef = useRef<PoolItem[] | null>(set ? poolFromPuzzles(set) : null)
  const ladderRef = useRef<Ladder | null>(null)
  const [state, setState] = useState<PlayState | null>(() => {
    if (!poolRef.current) return null
    const first = poolRef.current[0]?.load()
    return first ? startPuzzle(first) : null
  })
  const [said, setSaid] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(320)
  const nextRef = useRef<HTMLButtonElement>(null)

  const serve = useCallback((current: string | null) => {
    const pool = poolRef.current
    if (!pool) return
    const ladder = ladderRef.current ?? readLadder()
    const chosen = choosePuzzle(pool, ladder, Math.random, current)
    if (!chosen) return
    ladderRef.current = chosen.ladder
    writeLadder(chosen.ladder)
    setState(startPuzzle(chosen.puzzle))
  }, [])

  useEffect(() => {
    let cancelled = false
    if (set) {
      ladderRef.current = readLadder()
      return
    }
    loadPool().then(pool => {
      if (cancelled) return
      poolRef.current = pool
      serve(null)
    })
    return () => {
      cancelled = true
    }
  }, [set, serve])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setSize(puzzleBoardSize(el.clientWidth, window.innerHeight))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const status = state?.status
  const played = state?.played
  const puzzleId = state?.puzzle.id

  useEffect(() => {
    if (status !== 'leading') return
    const t = setTimeout(() => {
      setState(s => (s ? lead(s) : s))
      if (state) {
        const line = leadAnnouncement(state.puzzle)
        if (line) setSaid(line)
      }
    }, LEAD_DELAY_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, puzzleId])

  useEffect(() => {
    if (status !== 'replying') return
    const t = setTimeout(() => setState(s => (s ? reply(s) : s)), REPLY_DELAY_MS)
    return () => clearTimeout(t)
  }, [status, played])

  useEffect(() => {
    if (status !== 'showing') return
    const t = setTimeout(() => setState(s => (s ? showStep(s) : s)), SHOW_STEP_MS)
    return () => clearTimeout(t)
  }, [status, played])

  useEffect(() => {
    if (!state) return
    if (state.status === 'solved' || state.status === 'shown') {
      const before = ladderRef.current ?? readLadder()
      const next = climb(before, outcomeOf(state.status, state.misses))
      ladderRef.current = next
      writeLadder(next)
      setHint(levelHint(before.level, next.level))
    } else {
      setHint(null)
    }
    const message = playMessage(state)
    if (message) setSaid(message)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, state?.missed, puzzleId])

  const onMove = useCallback((uci: string) => {
    setState(s => (s ? attempt(s, uci) : s))
  }, [])

  const next = () => {
    if (!state) return
    serve(state.puzzle.id)
  }

  useEffect(() => {
    if (state && isOver(state)) nextRef.current?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const over = state ? isOver(state) : false
  const message = state ? playMessage(state) : null
  const caption = state && over ? puzzleCaption(state.puzzle) : null

  return (
    <section className="puzzle-panel flex flex-col gap-3" aria-labelledby="puzzle-heading">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="puzzle-heading" className="font-headline" style={{ fontSize: 20, color: 'var(--text)' }}>
          A puzzle while you wait
        </h2>
        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }} data-testid="puzzle-turn">
          {state ? playHeading(state) : ''}
        </span>
      </div>

      <div ref={wrapRef} className="w-full" style={{ maxWidth: PUZZLE_BOARD_MAX }}>
        {state ? (
          <PuzzleBoard state={state} size={size} onMove={onMove} onAnnounce={setSaid} />
        ) : (
          <div
            aria-busy="true"
            data-testid="puzzle-loading"
            className="flex items-center justify-center text-sm"
            style={{ width: size, height: size, background: 'var(--surface)', color: 'var(--text-muted)' }}
          >
            Setting up a puzzle…
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4" style={{ minHeight: 40, maxWidth: size }}>
        <p className="text-sm" style={{ color: over ? 'var(--brass)' : 'var(--text)' }} data-testid="puzzle-message">
          {message ?? ' '}
        </p>
        {over ? (
          <button
            ref={nextRef}
            type="button"
            onClick={next}
            className="text-sm px-4 py-2"
            style={{ background: 'var(--brass)', color: 'var(--on-accent)', border: '1px solid var(--brass)' }}
          >
            Next puzzle
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setState(s => (s ? showLine(s) : s))}
            disabled={!state || state.status === 'showing'}
            className="text-sm px-4 py-2"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)', background: 'transparent' }}
          >
            Show me
          </button>
        )}
      </div>

      {caption && (
        <p className="text-xs" style={{ color: 'var(--text-muted)', maxWidth: size }} data-testid="puzzle-caption">
          {caption}
          {hint && ` ${hint}`}
        </p>
      )}

      <p className="sr-only" aria-live="polite" data-testid="puzzle-announcement">
        {said}
      </p>
    </section>
  )
}
