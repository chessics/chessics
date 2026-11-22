'use client'

import { useEffect, useState } from 'react'
import { buildCalendar, localDay, type CalendarCell } from '@/lib/home/summary'

const OPACITY = [0, 0.3, 0.6, 1] as const

function dateOf(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function dayLabel(day: string): string {
  return dateOf(day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function monthLabels(cells: readonly CalendarCell[]): string[] {
  const cols = Math.ceil(cells.length / 7)
  const month = (c: number) => cells[c * 7]?.day.slice(0, 7)
  const out: string[] = []
  for (let c = 0; c < cols; c++) {
    const starts = c > 0 && month(c) !== month(c - 1)
    const firstOk = c === 0 && month(1) === month(0) && month(2) === month(0)
    out.push(starts || firstOk ? dateOf(cells[c * 7].day).toLocaleDateString('en-US', { month: 'short' }) : '')
  }
  return out
}

export default function ActivityCalendar({
  title,
  events,
  levels,
  colour,
  noun,
  markLabel,
}: {
  title: string
  events: ReadonlyArray<{ at: string; marked?: boolean }>
  levels: readonly [number, number, number]
  colour: string
  noun: [string, string]
  markLabel?: string
}) {
  const [cells, setCells] = useState<CalendarCell[] | null>(null)
  useEffect(() => {
    setCells(buildCalendar(events, new Date(), localDay, levels))
  }, [events, levels])

  const count = (n: number) => `${n} ${n === 1 ? noun[0] : noun[1]}`
  const describe = (c: CalendarCell) => `${dayLabel(c.day)}: ${c.count === 0 ? 'none' : count(c.count)}${c.marked && markLabel ? `, ${markLabel}` : ''}`
  return (
    <div className="home-cal-wrap" role="group" aria-label={title}>
      <h3 className="home-title" style={{ marginBottom: 4 }}>
        {title}
      </h3>
      <div className="home-months" aria-hidden="true">
        {(cells ? monthLabels(cells) : []).map((m, i) => (
          <span key={i}>{m}</span>
        ))}
      </div>
      <div className="home-cal" role="list" aria-label={`${title}, one square per day, last 13 weeks`}>
        {(cells ?? []).map((c) => (
          <span key={c.day} role="listitem" className="home-cell" title={describe(c)} aria-label={describe(c)}>
            {c.level > 0 && <span className="home-cell-fill" style={{ background: colour, opacity: OPACITY[c.level] }} />}
            {c.marked && <span className="home-cell-mark" />}
          </span>
        ))}
      </div>
      <div className="home-legend" aria-hidden="true">
        <span>Fewer</span>
        {[0, 1, 2, 3].map((l) => (
          <span key={l} className="home-cell">
            {l > 0 && <span className="home-cell-fill" style={{ background: colour, opacity: OPACITY[l] }} />}
          </span>
        ))}
        <span>More</span>
        {markLabel && (
          <>
            <span className="home-cell" style={{ marginLeft: 12 }}>
              <span className="home-cell-mark" />
            </span>
            <span>{markLabel}</span>
          </>
        )}
      </div>
    </div>
  )
}
