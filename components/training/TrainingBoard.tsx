'use client'

import { useEffect, useRef } from 'react'
import { Chess } from 'chess.js'
import type { Key } from 'chessground/types'
import type { DrawShape } from 'chessground/draw'
import 'chessground/assets/chessground.base.css'
import 'chessground/assets/chessground.cburnett.css'
import { boardAnimation } from '@/lib/motion'

export interface DrawnArrow {
  from: string
  to: string
  promotion?: 'q'
}

interface TrainingBoardProps {
  fen: string
  orientation: 'white' | 'black'
  arrows: DrawnArrow[]
  selected: number | null
  onDraw: (arrow: DrawnArrow) => void
  onSelectArrow: (index: number) => void
  size: number
  locked?: boolean
}

type Dests = Map<Key, Key[]>

const MOVE_ANIMATION_MS = 220
const SNAP_BACK_SETTLE_MS = MOVE_ANIMATION_MS + 60

function legalDests(fen: string): Dests {
  const dests: Dests = new Map()
  try {
    for (const m of new Chess(fen).moves({ verbose: true })) {
      const list = dests.get(m.from as Key) ?? []
      list.push(m.to as Key)
      dests.set(m.from as Key, list)
    }
  } catch {
  }
  return dests
}

function isPromotion(fen: string, from: string, to: string): boolean {
  try {
    const piece = new Chess(fen).get(from as never)
    return piece?.type === 'p' && (to[1] === '8' || to[1] === '1')
  } catch {
    return false
  }
}

const BRUSHES = {
  green: { key: 'green', color: '#15781B', opacity: 0.8, lineWidth: 10 },
  red: { key: 'red', color: '#882020', opacity: 0.8, lineWidth: 10 },
  blue: { key: 'blue', color: '#003088', opacity: 0.8, lineWidth: 10 },
  yellow: { key: 'yellow', color: '#e68f00', opacity: 0.8, lineWidth: 10 },
  pencil: { key: 'pencil', color: '#e8e0d0', opacity: 0.45, lineWidth: 9 },
  pencil_chosen: { key: 'pencil_chosen', color: '#e8e0d0', opacity: 0.9, lineWidth: 15 },
}

function toShapes(arrows: DrawnArrow[], selected: number | null): DrawShape[] {
  return arrows.map((a, i) => ({
    orig: a.from as Key,
    dest: a.to as Key,
    brush: i === selected ? 'pencil_chosen' : 'pencil',
  }))
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
    const dests = legalDests(fen)

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
              latest.current.onDraw({
                from: orig,
                to: dest,
                ...(isPromotion(fen, orig, dest) ? { promotion: 'q' as const } : {}),
              })
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

  useEffect(() => {
    cgRef.current?.setAutoShapes(toShapes(arrows, selected))
  }, [arrows, selected])

  useEffect(() => {
    cgRef.current?.set({ movable: { color: locked ? undefined : orientation } })
  }, [locked, orientation])

  return (
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
  )
}
