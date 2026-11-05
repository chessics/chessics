'use client'

import { useEffect, useRef, useState } from 'react'
import type { Key } from 'chessground/types'
import type { DrawShape } from 'chessground/draw'
import 'chessground/assets/chessground.base.css'
import 'chessground/assets/chessground.cburnett.css'
import { Chess } from 'chess.js'
import { boardAnimation } from '@/lib/motion'
import {
  arrowFromMove,
  arrowUci,
  boardKey,
  describeSquare,
  initialCursor,
  legalDests,
  type KeyboardState,
} from '@/lib/training/keyboard-board'

const MOVE_ANIMATION_MS = 200
const SETTLE_MS = MOVE_ANIMATION_MS + 60

const CURSOR_SVG =
  '<rect x="3" y="3" width="94" height="94" fill="none" stroke="#1a1512" stroke-width="6"/>' +
  '<rect x="9" y="9" width="82" height="82" fill="none" stroke="#f3ede2" stroke-width="5"/>'

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

const turnOf = (fen: string): 'white' | 'black' => (fen.split(' ')[1] === 'b' ? 'black' : 'white')

interface PlayBoardProps {
  fen: string
  orientation: 'white' | 'black'
  lastMove: [string, string] | null
  canMove: boolean
  size: number
  onMove: (uci: string) => void
  onAnnounce: (text: string) => void
}

export default function PlayBoard({ fen, orientation, lastMove, canMove, size, onMove, onAnnounce }: PlayBoardProps) {
  const elRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cgRef = useRef<any>(null)
  const latest = useRef({ fen, lastMove, canMove, onMove, orientation })
  latest.current = { fen, lastMove, canMove, onMove, orientation }

  function sync() {
    const cg = cgRef.current
    if (!cg) return
    const s = latest.current
    cg.set({
      fen: s.fen,
      turnColor: turnOf(s.fen),
      lastMove: s.lastMove ? (s.lastMove as Key[]) : undefined,
      check: inCheck(s.fen),
      movable: { color: s.canMove ? s.orientation : undefined, dests: legalDests(s.fen) as Map<Key, Key[]> },
    })
  }

  useEffect(() => {
    if (!elRef.current) return
    let cancelled = false
    import('chessground').then(({ Chessground }) => {
      if (cancelled || !elRef.current) return
      cgRef.current?.destroy()
      const s = latest.current
      cgRef.current = Chessground(elRef.current, {
        fen: s.fen,
        orientation: s.orientation,
        turnColor: turnOf(s.fen),
        coordinates: true,
        movable: {
          free: false,
          color: s.canMove ? s.orientation : undefined,
          dests: legalDests(s.fen) as Map<Key, Key[]>,
          showDests: true,
          events: {
            after: (orig: Key, dest: Key) => {
              const now = latest.current
              now.onMove(arrowUci(arrowFromMove(now.fen, orig, dest)))
              setTimeout(sync, 0)
              setTimeout(sync, SETTLE_MS)
            },
          },
        },
        premovable: { enabled: false },
        draggable: { enabled: true, showGhost: true },
        selectable: { enabled: true },
        animation: boardAnimation(MOVE_ANIMATION_MS),
        highlight: { lastMove: true, check: true },
        check: inCheck(s.fen),
        lastMove: s.lastMove ? (s.lastMove as Key[]) : undefined,
        drawable: { enabled: false, visible: true },
      })
    })
    return () => {
      cancelled = true
      cgRef.current?.destroy()
      cgRef.current = null
    }
  }, [orientation])

  useEffect(() => {
    sync()
  }, [fen, lastMove, canMove]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cgRef.current?.redrawAll()
  }, [size])

  const kb = useRef<KeyboardState | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  useEffect(() => {
    if (kb.current) kb.current = { cursor: kb.current.cursor, picked: null }
  }, [fen])
  useEffect(() => {
    const shapes: DrawShape[] = canMove && cursor ? [{ orig: cursor as Key, customSvg: { html: CURSOR_SVG } }] : []
    cgRef.current?.setAutoShapes(shapes)
  }, [cursor, canMove])

  const ctx = () => ({ fen, orientation, locked: !canMove })
  const keyState = (): KeyboardState => {
    kb.current ??= { cursor: initialCursor(fen, orientation), picked: null }
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
      aria-label="Board. Use the arrow keys to choose a square, Enter to pick up a piece, and Enter again to play it."
      data-play-board=""
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}
    >
      <div ref={elRef} style={{ width: size, height: size, position: 'relative' }} role="group" aria-label="Play-out board" />
    </div>
  )
}
