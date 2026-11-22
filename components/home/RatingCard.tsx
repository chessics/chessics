'use client'

import { useState } from 'react'
import { siteName, type RatingSeries } from '@/lib/home/summary'

const W = 600
const H = 150
const PAD_X = 64
const PAD_Y = 12

function speedName(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function chartRange(values: readonly number[]): { lo: number; hi: number } {
  const lo = Math.floor(Math.min(...values) / 50) * 50
  const hi = Math.ceil(Math.max(...values) / 50) * 50
  return hi === lo ? { lo: lo - 50, hi: hi + 50 } : { lo, hi }
}

export default function RatingCard({ series }: { series: RatingSeries[] }) {
  const [pick, setPick] = useState(0)
  if (series.length === 0) return null
  const sites = new Set(series.map((s) => s.platform))
  const label = (s: RatingSeries) => (sites.size > 1 ? `${siteName(s.platform)} ${s.speed}` : speedName(s.speed))
  const s = series[Math.min(pick, series.length - 1)]
  const { lo, hi } = chartRange(s.points.map((p) => p.rating))
  const n = s.points.length
  const x = (i: number) => PAD_X + (n === 1 ? 0 : (i / (n - 1)) * (W - PAD_X - 4))
  const y = (r: number) => PAD_Y + (1 - (r - lo) / (hi - lo)) * (H - PAD_Y * 2)
  const line = s.points.map((p, i) => `${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`).join(' ')
  const habits = s.points.map((p, i) => ({ p, i })).filter(({ p }) => p.habit)

  return (
    <section className="home-pane" aria-labelledby="home-rating-title">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h2 id="home-rating-title" className="home-title">
          Rating, last 3 months
        </h2>
        {series.length > 1 && (
          <div className="home-tabs" role="group" aria-label="Rating pool">
            {series.map((t, i) => (
              <button key={`${t.platform}:${t.speed}`} type="button" className="home-tab" aria-pressed={t === s} onClick={() => setPick(i)}>
                {label(t)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="home-figure">{s.now}</span>
        <span className="home-kicker">
          {series.length === 1 ? `${label(s)} on ${siteName(s.platform)}` : `now on ${siteName(s.platform)}`} · {s.highest} at its highest
        </span>
      </div>
      <div style={{ position: 'relative' }}>
        <span className="home-num" aria-hidden="true" style={{ position: 'absolute', left: 0, top: `${(y(hi) / H) * 100}%`, transform: 'translateY(-50%)' }}>
          {hi}
        </span>
        <span className="home-num" aria-hidden="true" style={{ position: 'absolute', left: 0, top: `${(y(lo) / H) * 100}%`, transform: 'translateY(-50%)' }}>
          {lo}
        </span>
        <svg
          className="home-chart"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${label(s)} rating over ${n} games, from ${s.points[0].rating} to ${s.now}.`}
        >
          <line x1={PAD_X} x2={W} y1={y(hi)} y2={y(hi)} stroke="var(--border)" strokeWidth="1" />
          <line x1={PAD_X} x2={W} y1={y(lo)} y2={y(lo)} stroke="var(--border)" strokeWidth="1" />
          <polyline points={line} fill="none" stroke="var(--text)" strokeWidth="1.5" />
          {habits.map(({ p, i }) => {
            const dot = <rect x={x(i) - 4} y={y(p.rating) - 4} width="8" height="8" fill="var(--blunder)" />
            const what = `${p.result === 'win' ? 'Win' : p.result === 'loss' ? 'Loss' : 'Draw'}${p.opponent ? ` against ${p.opponent}` : ''}, ${shortDate(p.at)}, rating ${p.rating}`
            return p.analysed ? (
              <a key={p.id} href={`/games/${p.id}/review`} aria-label={`${what}. Open the review.`}>
                <title>{what}</title>
                {dot}
              </a>
            ) : (
              <g key={p.id}>
                <title>{what}</title>
                {dot}
              </g>
            )
          })}
        </svg>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }} className="home-kicker">
        <span>{shortDate(s.points[0].at)}</span>
        <span>{shortDate(s.points[n - 1].at)}</span>
      </div>
      {habits.length > 0 && (
        <p className="home-kicker" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--blunder)' }} />
          A game where your habit came up. Press one to open it.
        </p>
      )}
    </section>
  )
}
