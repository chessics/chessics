import { countNoun } from '@/lib/count-noun'
import type { turningMoveTimes } from '@/lib/report/game-moments'

export default function TurningMoveTimes({ times }: { times: ReturnType<typeof turningMoveTimes> }) {
  if (!times) return null
  return (
    <details className="pb-2 text-sm">
      <summary className="w-fit cursor-pointer py-1" style={{ color: 'var(--brass)' }}>
        Time on turning moves in losses
      </summary>
      <p className="py-1" style={{ color: 'var(--text)' }}>
        Your game-turning moves took a median of {countNoun(times.medianMs / 1000, 'second')} ({times.games.length} games).
      </p>
      <ul className="flex flex-col" aria-label="Games behind the median">
        {times.games.map(game => (
          <li key={game.id} className="py-1" style={{ color: 'var(--text-muted)' }}>
            <a href={`#moment-${game.id}`} className="break-words underline underline-offset-2" style={{ color: 'var(--brass)' }}>
              {game.opponent || 'Unknown opponent'} · Move {game.moveNumber}, {game.san}
            </a>
            {' · '}{countNoun(game.spentMs / 1000, 'second')}
          </li>
        ))}
      </ul>
    </details>
  )
}
