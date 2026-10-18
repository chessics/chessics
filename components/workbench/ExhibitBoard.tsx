'use client'

import Link from 'next/link'
import ChessBoard from './ChessBoard'

interface ExhibitBoardProps {
  fen: string
  rootSquare: string
  blunderSquare: string
  orientation: 'white' | 'black'
  gameId: string
  rootPly: number
  size?: number
}

export default function ExhibitBoard({
  fen,
  rootSquare,
  blunderSquare,
  orientation,
  gameId,
  rootPly,
  size = 288,
}: ExhibitBoardProps) {
  return (
    <Link
      href={`/games/${gameId}/review?chain=${rootPly}`}
      title="Open this game's review at the chain"
      style={{ display: 'block', width: size, cursor: 'pointer' }}
    >
      <ChessBoard
        fen={fen}
        orientation={orientation}
        size={size}
        shapes={[
          { orig: rootSquare, brush: 'brass' },
          { orig: blunderSquare, brush: 'oxblood' },
          { orig: rootSquare, dest: blunderSquare, brush: 'brass' },
        ]}
      />
    </Link>
  )
}
