'use client'

import { useEffect, useRef, useState } from 'react'
import type { Key } from 'chessground/types'
import type { DrawShape } from 'chessground/draw'
import 'chessground/assets/chessground.base.css'
import 'chessground/assets/chessground.cburnett.css'
import { boardAnimation } from '@/lib/motion'
import {
  arrowFromMove,
  boardKey,
  describeSquare,
  initialCursor,
  legalDests,
  LOCKED_MESSAGE,
  type DrawnMove,
  type KeyboardState,
} from '@/lib/training/keyboard-board'

export type DrawnArrow = DrawnMove

interface TrainingBoardProps {
  fen: string
  orientation: 'white' | 'black'
  arrows: DrawnArrow[]
  selected: number | null
  onDraw: (arrow: DrawnArrow) => void
  onSelectArrow: (index: number) => void
  size: number
  locked?: boolean
  onAnnounce?: (text: string) => void
}

type Dests = Map<Key, Key[]>

const MOVE_ANIMATION_MS = 220
const SNAP_BACK_SETTLE_MS = MOVE_ANIMATION_MS + 60

const BRUSHES = {
  green: { key: 'green', color: '#15781B', opacity: 0.8, lineWidth: 10 },
  red: { key: 'red', color: '#882020', opacity: 0.8, lineWidth: 10 },
  blue: { key: 'blue', color: '#003088', opacity: 0.8, lineWidth: 10 },
  yellow: { key: 'yellow', color: '#e68f00', opacity: 0.8, lineWidth: 10 },
  pencil: { key: 'pencil', color: '#e8e0d0', opacity: 0.45, lineWidth: 9 },
  pencil_chosen: { key: 'pencil_chosen', color: '#e8e0d0', opacity: 0.9, lineWidth: 15 },
}

const CURSOR_SVG =
  '<rect x="3" y="3" width="94" height="94" fill="none" stroke="#1a1512" stroke-width="6"/>' +
  '<rect x="9" y="9" width="82" height="82" fill="none" stroke="#f3ede2" stroke-width="5"/>'

function toShapes(arrows: DrawnArrow[], selected: number | null, cursor: string | null = null): DrawShape[] {
  const shapes: DrawShape[] = arrows.map((a, i) => ({
    orig: a.from as Key,
    dest: a.to as Key,
    brush: i === selected ? 'pencil_chosen' : 'pencil',
  }))
  if (cursor) shapes.push({ orig: cursor as Key, customSvg: { html: CURSOR_SVG } })
  return shapes
}

function focusIsVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return true
  }
}

export default function TrainingBoard({
  fen,
  orientation,
  arrows,
  selected,
  onDraw,
  onSelectArrow,
  size,
  locked = false,
  onAnnounce,
}: TrainingBoardProps) {
  const elRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cgRef = useRef<any>(null)

  const latest = useRef({ arrows, selected, onDraw, onSelectArrow, locked })
  latest.current = { arrows, selected, onDraw, onSelectArrow, locked }

  useEffect(() => {
    if (!elRef.current) return
    let cancelled = false
    const turnColor = orientation
    const dests = legalDests(fen) as Dests

    const snapBack = () => {
      if (cancelled) return
      cgRef.current?.set({
        fen,
        turnColor,
        lastMove: undefined,
        movable: { color: latest.current.locked ? undefined : turnColor, dests },
      })
    }

    import('chessground').then(({ Chessground }) => {
      if (cancelled || !elRef.current) return
      cgRef.current?.destroy()
      cgRef.current = Chessground(elRef.current, {
        fen,
        orientation,
        turnColor,
        coordinates: true,
        movable: {
          free: false,
          color: latest.current.locked ? undefined : turnColor,
          dests,
          showDests: true,
          events: {
            after: (orig: Key, dest: Key) => {
              latest.current.onDraw(arrowFromMove(fen, orig, dest))
              snapBack()
              setTimeout(snapBack, SNAP_BACK_SETTLE_MS)
            },
          },
        },
        premovable: { enabled: false },
        draggable: { enabled: true, showGhost: true },
        selectable: { enabled: true },
        animation: boardAnimation(MOVE_ANIMATION_MS),
        highlight: { lastMove: false, check: true },
        events: {
          select: (key: Key) => {
            const i = latest.current.arrows.findIndex(a => a.to === key)
            if (i >= 0) latest.current.onSelectArrow(i)
          },
        },
        drawable: {
          enabled: false,
          visible: true,
          brushes: BRUSHES,
          autoShapes: toShapes(latest.current.arrows, latest.current.selected),
        },
      })
    })

    return () => {
      cancelled = true
      cgRef.current?.destroy()
      cgRef.current = null
    }
  }, [fen, orientation])

  const kb = useRef<KeyboardState | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  useEffect(() => {
    kb.current = null
    setCursor(null)
  }, [fen, orientation])

  const shownCursor = locked ? null : cursor
  useEffect(() => {
    cgRef.current?.setAutoShapes(toShapes(arrows, selected, shownCursor))
  }, [arrows, selected, shownCursor])

  useEffect(() => {
    cgRef.current?.set({ movable: { color: locked ? undefined : orientation } })
  }, [locked, orientation])

  const cgSelect = (square: string | null) => {
    const cg = cgRef.current
    if (!cg || cg.state.selected === square) return
    cg.selectSquare(null)
    if (square) cg.selectSquare(square as Key)
  }

  const keyState = (): KeyboardState => {
    kb.current ??= { cursor: initialCursor(fen, orientation, arrows), picked: null }
    return kb.current
  }

  const onFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || !focusIsVisible(e.currentTarget)) return
    const state = keyState()
    setCursor(state.cursor)
    onAnnounce?.(locked ? LOCKED_MESSAGE : describeSquare({ fen, orientation, locked }, state))
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
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const out = boardKey(keyState(), e.key, { fen, orientation, locked })
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
    }
    if (out.say) onAnnounce?.(out.say)
  }

  return (
    <div
      tabIndex={0}
      role="application"
      aria-label="Board. Use the arrow keys to choose a square, Enter to pick up a piece, and Enter again to draw your move."
      data-keyboard-board=""
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}
    >
      <div
        ref={elRef}
        style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}
        role="group"
        aria-label={
          locked
            ? 'Training board. Pick a reason first, then drag a piece to draw a candidate move.'
            : 'Training board. Drag a piece to draw a candidate move.'
        }
        data-locked={locked ? 'true' : undefined}
      />
    </div>
  )
}
