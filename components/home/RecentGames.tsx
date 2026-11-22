'use client'

import { useEffect } from 'react'
import type { RecentCard } from '@/lib/home/load'
import { HOME_SEEN_COOKIE } from '@/lib/home/cookie'
import { recentNoteText } from '@/lib/home/summary'
import { formatTimeControl } from '@/lib/review/time-control'

function Line({ line, blunderAt }: { line: number[]; blunderAt: number | null }) {
  const W = 100
  const H = 24
  const n = line.length
  const x = (i: number) => (n === 1 ? 0 : (i / (n - 1)) * W)
  const scale = Math.max(300, ...line.map((v) => Math.abs(v)))
  const y = (v: number) => H / 2 - (v / scale) * (H / 2 - 2)
  return (
    <svg className="home-game-line" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <polyline
        points={line.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ')}
        fill="none"
        stroke="var(--text)"
        strokeWidth="1.25"
        vectorEffect="non-scaling-stroke"
      />
      {blunderAt !== null && (
        <line x1={x(blunderAt)} x2={x(blunderAt)} y1="2" y2={H - 2} stroke="var(--blunder)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  )
}

const RESULT = { win: ['W', 'Win'], loss: ['L', 'Loss'], draw: ['D', 'Draw'] } as const

export default function RecentGames({ games }: { games: RecentCard[] }) {
  useEffect(() => {
    document.cookie = `${HOME_SEEN_COOKIE}=${Date.now()}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
  }, [])
  if (games.length === 0) return null
  const anyNew = games.some((g) => g.isNew)

  return (
    <section className="home-band" aria-labelledby="home-recent-title">
      <div className="home-band-head">
        <h2 id="home-recent-title" className="home-h2">
          {anyNew ? 'Since you were here' : 'Your latest games'}
        </h2>
        <a className="home-link" href="/games">
          All games
        </a>
      </div>
      <div className="home-ledger">
        {games.map((g) => {
          const analyse = g.summary.note.kind === 'analyze'
          const [letter, word] = g.result ? RESULT[g.result] : ['·', 'Game']
          const clock = g.timeControl ? formatTimeControl(g.timeControl) : null
          return (
            <a key={g.id} className="home-game" href={analyse ? '/games' : `/games/${g.id}/review`}>
              <span className="home-res" data-r={g.result ?? 'none'} aria-hidden="true">
                {letter}
              </span>
              <span className="home-who">
                <span className="sr-only">{word} </span>
                {g.opponent ? `against ${g.opponent}` : 'Game'}
                {g.isNew && <span className="home-new">New</span>}
                {clock && <small>{clock}</small>}
              </span>
              {g.summary.line ? <Line line={g.summary.line} blunderAt={g.summary.blunderAt} /> : <span className="home-game-line" aria-hidden="true" />}
              <span className="home-note" data-act={analyse}>
                {analyse ? 'Analyze' : recentNoteText(g.summary.note)}
              </span>
              <span className="home-num home-chg" aria-label={g.change === null ? undefined : `Rating ${g.change >= 0 ? 'up' : 'down'} ${Math.abs(g.change)}`}>
                {g.change === null ? '' : `${g.change > 0 ? '+' : g.change < 0 ? '−' : '±'}${Math.abs(g.change)}`}
              </span>
            </a>
          )
        })}
      </div>
    </section>
  )
}
