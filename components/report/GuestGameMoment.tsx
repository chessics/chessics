'use client'

import { useState } from 'react'
import ChessBoard from '@/components/workbench/ChessBoard'
import { keyMomentRowLabel } from '@/lib/review/key-moment'
import type { GuestGameRow } from '@/lib/report/game-moments'

export default function GuestGameMoment({ game, preview }: GuestGameRow) {
  const [open, setOpen] = useState(false)
  if (!preview) return null

  const { moment, fen, from, to } = preview
  return (
    <details onToggle={e => setOpen(e.currentTarget.open)}>
      <summary id={`moment-${game.analysis_data.gameId}`} className="w-fit cursor-pointer py-1 text-sm" style={{ color: 'var(--brass)' }}>
        {keyMomentRowLabel(moment)}
      </summary>
      {open && (
        <div
          className="board-placeholder mt-1 aspect-square w-full max-w-64 overflow-hidden"
          role="img"
          aria-label={`Position before ${moment.san}, arrow from ${from} to ${to}, ${game.user_color} at the bottom.`}
        >
          <ChessBoard
            fen={fen}
            orientation={game.user_color}
            viewOnly
            size="100%"
            shapes={[{ orig: from, dest: to, brush: moment.kind === 'won' ? 'held' : 'mistake', hilite: true }]}
          />
        </div>
      )}
    </details>
  )
}
