'use client'

import { Chess } from 'chess.js'
import { useFocusWhenLost } from './focus'
import ChessBoard from '@/components/workbench/ChessBoard'
import type { SessionSummary, StakesBar } from '@/lib/training/summary'
import { stakesSentences } from '@/lib/training/summary'

function sanOf(fen: string, uci: string): string {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' })?.san ?? uci
  } catch {
    return uci
  }
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const RESULT_WORD = { loss: 'lost', draw: 'drew', win: 'won' } as const

function StakesStrip({ bars }: { bars: StakesBar[] }) {
  const trained = bars.filter(b => b.trained)
  const label = `${bars.length} recent games; ${trained.length} lit up: ${trained
    .map(b => (b.result ? RESULT_WORD[b.result] : 'unknown'))
    .join(', ')}`
  return (
    <div className="stakes-strip" role="img" aria-label={label}>
      {bars.map((b, i) => (
        <div key={i} className={`stakes-bar${b.trained ? ` is-trained is-${b.result ?? 'unknown'}` : ''}`}>
          {b.trained && <span className="stakes-mark" aria-hidden />}
        </div>
      ))}
    </div>
  )
}

interface SessionEndProps {
  openLoop: string
  summary?: SessionSummary
  onAgain: () => void
}

export default function SessionEnd({ openLoop, summary, onAgain }: SessionEndProps) {
  const locked = summary?.locked_in ?? []
  const stakes = summary?.stakes ?? null
  const titleRef = useFocusWhenLost<HTMLHeadingElement>(openLoop)

  return (
    <div className="session-end">
      <h1 ref={titleRef} tabIndex={-1} className="training-title focus-landing">
        Session done.
      </h1>

      {locked.length > 0 && (
        <section className="session-section">
          <h2 className="session-section-title">Locked in today</h2>
          <p className="training-hint">You found a move that holds in these.</p>
          <div className="locked-grid">
            {locked.map(l => (
              <figure key={l.position_id} className="locked-card">
                <ChessBoard
                  fen={l.fen}
                  orientation={l.side_to_move}
                  size={176}
                  shapes={[{ orig: l.move.slice(0, 2), dest: l.move.slice(2, 4), brush: 'held', hilite: true }]}
                />
                <figcaption>
                  <span className="locked-move">{sanOf(l.fen, l.move)}</span>
                  <span className="locked-when">
                    {l.retired ? "Learned. It won't come back." : l.returns_at ? `Back ${day(l.returns_at)}` : ''}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {stakes && (
        <section className="session-section">
          <h2 className="session-section-title">What these slips cost</h2>
          {(() => {
            const [first, second] = stakesSentences(stakes)
            return (
              <p className="stakes-headline">
                {first} <strong>{second}</strong>
              </p>
            )
          })()}
          <StakesStrip bars={stakes.strip} />
          <p className="stakes-legend">
            <span className="stakes-key is-loss" aria-hidden /> lost
            <span className="stakes-key is-draw" aria-hidden /> drew
            <span className="stakes-key is-win" aria-hidden /> won
            <span className="stakes-legend-note">
              Your last {stakes.strip.length} games, oldest on the left. Lit bars are the games today&apos;s positions came
              from.
              {stakes.older_not_shown > 0 &&
                ` ${stakes.older_not_shown} older ${stakes.older_not_shown === 1 ? 'game is' : 'games are'} counted above but not drawn.`}
            </span>
          </p>
        </section>
      )}

      <p className="training-open-loop">{openLoop}</p>

      <div className="training-actions">
        <button className="training-btn training-btn-primary" onClick={onAgain}>
          Another session
        </button>
        <a className="training-btn training-btn-quiet" href="/workbench">
          Back to the workbench
        </a>
      </div>
    </div>
  )
}
