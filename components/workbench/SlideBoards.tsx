import { memo } from 'react'
import type { Color, Move } from '@/lib/supabase/types'
import { moveNumberOfPly } from '@/lib/review/decided-at'
import { previousMove } from '@/lib/training/previous-move'
import ChessBoard from './ChessBoard'

interface SlideBoardsProps {
  moves: Move[]
  orientation: Color
  rootPly: number
  terminalPly: number
}

export default memo(function SlideBoards({ moves, orientation, rootPly, terminalPly }: SlideBoardsProps) {
  if (terminalPly <= rootPly) return null
  const side = orientation === 'white' ? 'w' : 'b'
  function positionBefore(ply: number) {
    const row = moves.find(move => move.ply_number === ply)
    if (!row?.fen_before || !row.fen_after || row.fen_before.split(' ')[1] !== side) return null
    return previousMove(row.fen_after, row)
  }

  const root = positionBefore(rootPly)
  const blunder = positionBefore(terminalPly)
  if (!root || !blunder) return null
  const positions = [
    { move: root, ply: rootPly, label: 'Start of the slide', brush: 'chain_root' },
    { move: blunder, ply: terminalPly, label: 'Blunder', brush: 'chain_blunder' },
  ]
  return (
    <div className="my-3 grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
      {positions.map(({ move, ply, label, brush }) => (
        <figure key={ply} className="min-w-0 max-w-56">
          <figcaption className="mb-1 text-sm text-text-muted">
            {label} · <span className="font-mono">{moveNumberOfPly(ply)}{orientation === 'white' ? '.' : '…'}{move.san}</span>
          </figcaption>
          <div className="board-placeholder aspect-square w-full overflow-hidden" role="img"
            aria-label={`Before ${move.san}, arrow from ${move.from} to ${move.to}, ${orientation} at the bottom.`}>
            <ChessBoard fen={move.fen} orientation={orientation} size="100%" viewOnly coordinates={false}
              shapes={[{ orig: move.from, dest: move.to, brush, hilite: true }]} />
          </div>
        </figure>
      ))}
    </div>
  )
})
