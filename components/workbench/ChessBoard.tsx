'use client'

import { useEffect, useRef } from 'react'
import type { Key } from 'chessground/types'
import type { DrawShape } from 'chessground/draw'
import 'chessground/assets/chessground.base.css'
import 'chessground/assets/chessground.cburnett.css'
import { boardAnimation } from '@/lib/motion'

export interface BoardShape {
  orig: string
  dest?: string
  brush: string
  hilite?: boolean
}

function toDrawShape(s: BoardShape): DrawShape {
  return {
    orig: s.orig as Key,
    dest: s.dest as Key | undefined,
    brush: s.brush,
    ...(s.hilite ? { modifiers: { hilite: true } } : {}),
  } as DrawShape
}

interface ChessBoardProps {
  fen: string
  orientation?: 'white' | 'black'
  lastMove?: [string, string] | null
  shapes?: BoardShape[]
  size: number
  coordinates?: boolean
  onReady?: () => void
  viewOnly?: boolean
}

export default function ChessBoard({
  fen,
  orientation = 'white',
  lastMove = null,
  shapes = [],
  size,
  coordinates = true,
  onReady,
  viewOnly = false,
}: ChessBoardProps) {
  const elRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cgRef = useRef<any>(null)

  const latestFen = useRef(fen)
  const latestLastMove = useRef(lastMove)
  const latestShapes = useRef(shapes)
  latestFen.current = fen
  latestLastMove.current = lastMove
  latestShapes.current = shapes
  const latestOnReady = useRef(onReady)
  latestOnReady.current = onReady

  useEffect(() => {
    if (!elRef.current) return
    let cancelled = false

    import('chessground').then(({ Chessground }) => {
      if (cancelled || !elRef.current) return

      cgRef.current?.destroy()
      cgRef.current = Chessground(elRef.current, {
        fen: latestFen.current,
        orientation,
        coordinates,
        viewOnly,
        movable: { free: false, color: undefined },
        draggable: { enabled: false },
        selectable: { enabled: false },
        animation: boardAnimation(200),
        highlight: { lastMove: true, check: false },
        lastMove: latestLastMove.current
          ? (latestLastMove.current as [Key, Key])
          : undefined,
        drawable: {
          enabled: true,
          eraseOnClick: false,
          brushes: {
            green:  { key: 'green',  color: '#15781B', opacity: 0.8, lineWidth: 10 },
            red:    { key: 'red',    color: '#882020', opacity: 0.8, lineWidth: 10 },
            blue:   { key: 'blue',   color: '#003088', opacity: 0.8, lineWidth: 10 },
            yellow: { key: 'yellow', color: '#e68f00', opacity: 0.8, lineWidth: 10 },
            chain_root:    { key: 'chain_root',    color: '#c9a55c', opacity: 0.75, lineWidth: 10 },
            chain_mid:     { key: 'chain_mid',     color: '#6a8fae', opacity: 0.55, lineWidth: 10 },
            chain_blunder: { key: 'chain_blunder', color: '#c0455a', opacity: 0.75, lineWidth: 10 },
            brass:         { key: 'brass',         color: '#c9a55c', opacity: 0.8,  lineWidth: 10 },
            oxblood:       { key: 'oxblood',       color: '#c0455a', opacity: 0.8,  lineWidth: 10 },
            held:          { key: 'held',          color: '#e8a10c', opacity: 1,    lineWidth: 15 },
            alsoHeld:      { key: 'alsoHeld',      color: '#e8a10c', opacity: 0.7,  lineWidth: 10 },
            mistake:       { key: 'mistake',       color: '#d6344f', opacity: 1,    lineWidth: 15 },
            unchecked:     { key: 'unchecked',     color: '#f3ede2', opacity: 0.9,  lineWidth: 11 },
          },
          shapes: latestShapes.current.map(toDrawShape),
        },
      })
      latestOnReady.current?.()
    })

    return () => {
      cancelled = true
      cgRef.current?.destroy()
      cgRef.current = null
    }
  }, [orientation]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cgRef.current) return
    cgRef.current.set({
      fen,
      lastMove: lastMove ? (lastMove as [Key, Key]) : undefined,
      drawable: {
        shapes: shapes.map(toDrawShape),
      },
    })
  }, [fen, lastMove, shapes])

  return (
    <div
      ref={elRef}
      style={{
        width: size,
        height: size,
        display: 'block',
        position: 'relative',
        flexShrink: 0,
      }}
    />
  )
}
