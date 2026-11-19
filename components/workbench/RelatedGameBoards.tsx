import type { RelatedBoard } from '@/lib/review/related-games'
import { moveNumberOfPly } from '@/lib/review/decided-at'
import ChessBoard from './ChessBoard'

const caption = {
  opening: 'You played the same move from this position.',
  'moved-piece-taken': 'Their reply took the piece you moved.',
  'other-piece-taken': 'Their reply took another one of your pieces.',
} as const

export default function RelatedGameBoards({ boards }: { boards: RelatedBoard[] }) {
  return (
    <div className="my-3">
      <h3 className="text-sm font-medium">The same slip in your other games</h3>
      <div className="mt-2 grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
        {boards.map(board => (
          <a key={board.gameId} className="block min-w-0 max-w-56" href={`/games/${encodeURIComponent(board.gameId)}/review#key-moment-title`}>
            <figure>
              <div className="board-placeholder aspect-square w-full overflow-hidden" role="img"
                aria-label={`Before ${board.san}, arrow from ${board.from} to ${board.to}, ${board.orientation} at the bottom.`}>
                <ChessBoard fen={board.fen} orientation={board.orientation} size="100%" coordinates={false} viewOnly
                  shapes={[{ orig: board.from, dest: board.to, brush: 'chain_root', hilite: true }]} />
              </div>
              <figcaption className="mt-1 text-sm text-text-muted">
                <span className="text-brass underline [overflow-wrap:anywhere]">
                  {board.opponent ? `Game against ${board.opponent}` : 'Open game'} · <span className="font-mono">
                    {moveNumberOfPly(board.ply)}{board.orientation === 'white' ? '.' : '…'}{board.san}
                  </span>
                </span>
                <p>{caption[board.match]}</p>
              </figcaption>
            </figure>
          </a>
        ))}
      </div>
    </div>
  )
}
