'use client'

import { useEffect, useRef, useState } from 'react'
import type { Key } from 'chessground/types'
import type { DrawShape } from 'chessground/draw'
import 'chessground/assets/chessground.base.css'
import 'chessground/assets/chessground.cburnett.css'
import { Chess } from 'chess.js'
import { boardAnimation, prefersReducedMotion } from '@/lib/motion'
import {
  arrowFromMove,
  arrowUci,
  boardKey,
  describeSquare,
  initialCursor,
  legalDests,
  type KeyboardState,
} from '@/lib/training/keyboard-board'
import type { PlayState } from '@/lib/puzzles/play'

const MOVE_ANIMATION_MS = 200
const SETTLE_MS = MOVE_ANIMATION_MS + 60

const CURSOR_SVG =
  '<rect x="3" y="3" width="94" height="94" fill="none" stroke="#1a1512" stroke-width="6"/>' +
  '<rect x="9" y="9" width="82" height="82" fill="none" stroke="#f3ede2" stroke-width="5"/>'

export function litSvg(reducedMotion: boolean): string {
  const settle = reducedMotion ? '' : '<animate attributeName="fill-opacity" from="0.85" to="0.45" dur="0.9s" fill="freeze"/>'
  return `<rect x="0" y="0" width="100" height="100" fill="#c9a55c" fill-opacity="0.45">${settle}</rect>`
}

function shapes(lit: string | null, cursor: string | null): DrawShape[] {
  const out: DrawShape[] = []
  if (lit) out.push({ orig: lit as Key, customSvg: { html: litSvg(prefersReducedMotion()) } })
  if (cursor) out.push({ orig: cursor as Key, customSvg: { html: CURSOR_SVG } })
  return out
}

function inCheck(fen: string): boolean {
  try {
    return new Chess(fen).inCheck()
  } catch {
    return false
  }
}

function focusIsVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return true
  }
}

interface PuzzleBoardProps {
  state: PlayState
  size: number
  onMove: (uci: string) => void
  onAnnounce: (text: string) => void
}

export default function PuzzleBoard({ state, size, onMove, onAnnounce }: PuzzleBoardProps) {
  const elRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cgRef = useRef<any>(null)
  const orientation = state.puzzle.side
  const canMove = state.status === 'solving'

  const latest = useRef({ state, onMove })
  latest.current = { state, onMove }

  useEffect(() => {
    if (!elRef.current) return
    let cancelled = false
    import('chessground').then(({ Chessground }) => {
      if (cancelled || !elRef.current) return
      cgRef.current?.destroy()
      const s = latest.current.state
      cgRef.current = Chessground(elRef.current, {
        fen: s.fen,
        orientation: s.puzzle.side,
        turnColor: s.puzzle.side,
        coordinates: true,
        movable: {
          free: false,
          color: s.status === 'solving' ? s.puzzle.side : undefined,
          dests: legalDests(s.fen) as Map<Key, Key[]>,
          showDests: true,
          events: {
            after: (orig: Key, dest: Key) => {
              const now = latest.current.state
              latest.current.onMove(arrowUci(arrowFromMove(now.fen, orig, dest)))
              setTimeout(() => sync(), 0)
              setTimeout(() => sync(), SETTLE_MS)
            },
          },
        },
        premovable: { enabled: false },
        draggable: { enabled: true, showGhost: true },
        selectable: { enabled: true },
        animation: boardAnimation(MOVE_ANIMATION_MS),
        highlight: { lastMove: true, check: true },
        check: inCheck(s.fen),
        drawable: { enabled: false, visible: true, autoShapes: shapes(s.lit, null) },
      })
    })
    return () => {
      cancelled = true
      cgRef.current?.destroy()
      cgRef.current = null
    }
  }, [state.puzzle.id])

  function sync() {
    const cg = cgRef.current
    if (!cg) return
    const s = latest.current.state
    const turn = s.fen.split(' ')[1] === 'b' ? 'black' : 'white'
    cg.set({
      fen: s.fen,
      turnColor: turn,
      lastMove: s.lastMove ? (s.lastMove as Key[]) : undefined,
      check: inCheck(s.fen),
      movable: { color: s.status === 'solving' ? s.puzzle.side : undefined, dests: legalDests(s.fen) as Map<Key, Key[]> },
    })
  }
  useEffect(() => {
    sync()
  }, [state.fen, state.lastMove, state.status, state.missed, canMove, orientation])

  useEffect(() => {
    cgRef.current?.redrawAll()
  }, [size])

  const kb = useRef<KeyboardState | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  useEffect(() => {
    kb.current = null
    setCursor(null)
  }, [state.puzzle.id])

  useEffect(() => {
    cgRef.current?.setAutoShapes(shapes(state.lit, canMove ? cursor : null))
  }, [state.lit, cursor, canMove])

  const ctx = () => ({ fen: state.fen, orientation, locked: !canMove })
  const keyState = (): KeyboardState => {
    kb.current ??= { cursor: initialCursor(state.fen, orientation), picked: null }
    return kb.current
  }
  const cgSelect = (square: string | null) => {
    const cg = cgRef.current
    if (!cg || cg.state.selected === square) return
    cg.selectSquare(null)
    if (square) cg.selectSquare(square as Key)
  }

  const onFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || !focusIsVisible(e.currentTarget)) return
    const st = keyState()
    setCursor(st.cursor)
    if (canMove) onAnnounce(describeSquare(ctx(), st))
  }
  const onBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    setCursor(null)
    if (kb.current?.picked) {
      kb.current = { ...kb.current, picked: null }
      cgSelect(null)
    }
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || !canMove) return
    const out = boardKey(keyState(), e.key, ctx())
    if (!out.handled) return
    e.preventDefault()
    e.stopPropagation()
    if (e.repeat && (e.key === 'Enter' || e.key === ' ')) return
    kb.current = out.state
    setCursor(out.state.cursor)
    if (out.select !== undefined) cgSelect(out.select)
    if (out.draw) {
      cgSelect(out.draw.from)
      cgRef.current?.selectSquare(out.draw.to as Key)
      return
    }
    if (out.say) onAnnounce(out.say)
  }

  return (
    <div
      tabIndex={0}
      role="application"
      aria-label="Puzzle board. Use the arrow keys to choose a square, Enter to pick up a piece, and Enter again to play it."
      data-puzzle-board=""
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}
    >
      <div ref={elRef} style={{ width: size, height: size, position: 'relative' }} role="group" aria-label="Puzzle board" />
    </div>
  )
}
