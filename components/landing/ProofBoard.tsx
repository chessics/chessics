'use client'

import { useEffect, useRef, useState } from 'react'
import ChessBoard from '@/components/workbench/ChessBoard'
import { PROOF, proofBoardLabel } from './proof'

export const PROOF_BOARD_MAX_PX = 400
export const PROOF_COORD_GUTTER_PX = 12

export function proofBoardSize(columnWidth: number): number {
  const fit = Math.min(PROOF_BOARD_MAX_PX, columnWidth - PROOF_COORD_GUTTER_PX)
  return Math.max(0, Math.floor(fit / 8) * 8)
}

export default function ProofBoard() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    setSize(proofBoardSize(el.clientWidth))
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => setSize(proofBoardSize(entries[0]!.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} className="landing-board-col">
      <div
        className="landing-board"
        role="img"
        aria-label={proofBoardLabel()}
        data-proof-board
        style={size !== null ? { width: size, height: size } : undefined}
      >
        {size !== null && size > 0 && (
          <ChessBoard
            fen={PROOF.fen}
            orientation={PROOF.orientation}
            size={size}
            viewOnly
            shapes={[{ orig: PROOF.move.from, dest: PROOF.move.to, brush: 'mistake' }]}
          />
        )}
      </div>
    </div>
  )
}
