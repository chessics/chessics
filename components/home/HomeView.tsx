import Link from 'next/link'
import './home.css'
import type { HomeData } from '@/lib/home/load'
import type { OpeningRow, Record3 } from '@/lib/home/summary'
import { GAME_LEVELS, TRAINING_LEVELS } from '@/lib/home/summary'
import { sentenceCase } from '@/lib/diagnosis/finding'
import { findingHref } from '@/lib/workbench/finding-link'
import { countNoun } from '@/lib/count-noun'
import RatingCard from './RatingCard'
import ActivityCalendar from './ActivityCalendar'
import RecentGames from './RecentGames'

export const MIN_RECORD_GAMES = 5

function Bar({ r }: { r: Record3 }) {
  const pct = (n: number) => `${(n / r.games) * 100}%`
  return (
    <div className="home-bar" aria-hidden="true">
      <span className="home-w" style={{ width: pct(r.wins) }} />
      <span className="home-d" style={{ width: pct(r.draws) }} />
      <span className="home-l" style={{ width: pct(r.losses) }} />
    </div>
  )
}

function recordWords(r: Record3): string {
  const losses = `${r.losses} ${r.losses === 1 ? 'loss' : 'losses'}`
  return `${countNoun(r.wins, 'win')}, ${countNoun(r.draws, 'draw')}, ${losses} in ${countNoun(r.games, 'game')}`
}

function BarRow({ label, r }: { label: string; r: Record3 }) {
  return (
    <div>
      <div className="home-bar-row">
        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{label}</span>
        <span className="home-num" aria-label={recordWords(r)}>
          {r.wins}/{r.games}
        </span>
      </div>
      <Bar r={r} />
    </div>
  )
}

function Key() {
  return (
    <p className="home-kicker" aria-hidden="true" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {[
        ['home-w', 'win'],
        ['home-d', 'draw'],
        ['home-l', 'loss'],
      ].map(([c, w]) => (
        <span key={w} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span className={c} style={{ display: 'inline-block', width: 8, height: 8 }} />
          {w}
        </span>
      ))}
    </p>
  )
}

function openingLabel(o: OpeningRow): string {
  return `${o.family} · ${o.color === 'white' ? 'White' : 'Black'}`
}

export default function HomeView({ data }: { data: HomeData }) {
  const { habit } = data
  const opp = data.opponents
  const showOpponents = opp.higher.games + opp.lower.games >= MIN_RECORD_GAMES
  const clockLows = data.clock?.filter((c) => c.low).length ?? 0
  const showClock = !!data.clock && data.clock.length >= MIN_RECORD_GAMES
  const showCalendars = data.gameDays.length > 0 || (!!data.trainingDays && data.trainingDays.length > 0)

  return (
    <div className="home">
      {(data.series.length > 0 || habit) && (
        <div className="home-band home-hero">
          {data.series.length > 0 && <RatingCard series={data.series} />}
          {habit && (
            <section className="home-pane home-habit" aria-labelledby="home-habit-title">
              <h2 id="home-habit-title" className="home-title">
                What the habit cost
              </h2>
              <p className="home-claim">
                {sentenceCase(habit.label)}:{' '}
                {habit.lost && habit.lost.length > 0 ? (
                  <>
                    the {countNoun(habit.games, 'game')} where it came up cost you <em>{habit.lost.join(' and ')}</em>.
                  </>
                ) : (
                  <>it came up in {countNoun(habit.games, 'game')}.</>
                )}
              </p>
              {habit.rest && <p className="home-kicker">{habit.rest}</p>}
              <div className="home-actions">
                <Link className="home-button" href="/train">
                  Train these positions
                </Link>
                <Link className="home-link" href={findingHref(habit.batchId, habit.tag)}>
                  See the {countNoun(habit.games, 'game')}
                </Link>
              </div>
            </section>
          )}
        </div>
      )}

      {showCalendars && (
        <section className="home-band" aria-labelledby="home-activity-title">
          <div className="home-band-head">
            <h2 id="home-activity-title" className="home-h2">
              Activity
            </h2>
            <p className="home-kicker">Last 13 weeks</p>
          </div>
          <div className="home-cals">
            <ActivityCalendar
              title="Games played"
              events={data.gameDays}
              levels={GAME_LEVELS}
              colour="var(--text)"
              noun={['game', 'games']}
              markLabel={data.gameDays.some((d) => d.marked) ? 'the habit came up' : undefined}
            />
            {data.trainingDays && (
              <ActivityCalendar
                title="Training"
                events={data.trainingDays.map((at) => ({ at }))}
                levels={TRAINING_LEVELS}
                colour="var(--held)"
                noun={['position answered', 'positions answered']}
              />
            )}
          </div>
        </section>
      )}

      <RecentGames games={data.recent} />

      {(data.openings.length > 0 || showOpponents || showClock) && (
        <section className="home-band" aria-labelledby="home-record-title">
          <div className="home-band-head">
            <h2 id="home-record-title" className="home-h2">
              Your results
            </h2>
            <Key />
          </div>
          <div className="home-records">
            {data.openings.length > 0 && (
              <section className="home-record" aria-labelledby="home-openings-title">
                <h3 id="home-openings-title" className="home-title">
                  Openings
                </h3>
                {data.openings.map((o) => (
                  <BarRow key={`${o.family}|${o.color}`} label={openingLabel(o)} r={o} />
                ))}
              </section>
            )}
            {showOpponents && (
              <section className="home-record" aria-labelledby="home-opp-title">
                <h3 id="home-opp-title" className="home-title">
                  Opponents
                </h3>
                {opp.higher.games > 0 && <BarRow label="Higher rated" r={opp.higher} />}
                {opp.lower.games > 0 && <BarRow label="Lower rated" r={opp.lower} />}
              </section>
            )}
            {showClock && data.clock && (
              <section className="home-record" aria-labelledby="home-clock-title">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <h3 id="home-clock-title" className="home-title">
                    Clock in your losses
                  </h3>
                  <span className="home-num" aria-label={`${clockLows} of your last ${data.clock.length} losses ended under 30 seconds`}>
                    {clockLows}/{data.clock.length}
                  </span>
                </div>
                <div className="home-squares" aria-hidden="true">
                  {data.clock.map((c) => (
                    <span key={c.id} className="home-square" data-low={c.low} />
                  ))}
                </div>
                <p className="home-kicker" aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--blunder)' }} />
                  Under 30 seconds left
                </p>
              </section>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
