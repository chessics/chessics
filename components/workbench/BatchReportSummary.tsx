'use client'

import Link from 'next/link'
import RecurrenceStrip from './RecurrenceStrip'
import type { BatchPatternGroup, Trajectory } from '@/lib/supabase/types'

interface BatchReportSummaryProps {
  latestBatch: {
    id: string
    game_count: number
    calibration_level_used: number
    claude_narrative: string | null
    overall_accuracy: number | null
    accuracy_delta: number | null
    pattern_groups: BatchPatternGroup[]
    game_ids: string[]
    generated_at: string
  } | null
  trajectories: Record<string, Trajectory>
  allBatches: Array<{ overall_accuracy: number | null; generated_at: string }>
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function TrajectoryLabel({ trajectory }: { trajectory: Trajectory | undefined }) {
  if (trajectory === 'improving') return <span style={{ color: 'var(--good)' }}>↑ improving</span>
  if (trajectory === 'declining') return <span style={{ color: 'var(--oxblood)' }}>↓ worsening</span>
  return <span style={{ color: 'var(--text-muted)' }}>→ stable</span>
}

function Sparkline({ batches }: { batches: Array<{ overall_accuracy: number | null; generated_at: string }> }) {
  const valid = batches.filter((b) => b.overall_accuracy !== null) as Array<{
    overall_accuracy: number
    generated_at: string
  }>

  if (valid.length < 2) {
    return (
      <div
        className="flex items-center justify-center w-full"
        style={{ height: 48, fontSize: 12, color: 'var(--text-dim)' }}
      >
        More batches needed for a trend
      </div>
    )
  }

  const W = 600
  const H = 48
  const pad = 6
  const values = valid.map((b) => b.overall_accuracy)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range = maxVal - minVal || 1

  const pts = values.map((v, i) => ({
    x: pad + (i / (values.length - 1)) * (W - pad * 2),
    y: H - pad - ((v - minVal) / range) * (H - pad * 2),
  }))

  let d = `M ${pts[0].x},${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]
    const curr = pts[i]
    const cpx = (prev.x + curr.x) / 2
    d += ` C ${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`
  }
  const last = pts[pts.length - 1]

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', height: 48 }}>
      <path d={d} fill="none" stroke="var(--brass)" strokeWidth="1.5" />
      <circle cx={last.x} cy={last.y} r="3" fill="var(--brass)" />
    </svg>
  )
}

export default function BatchReportSummary({
  latestBatch,
  trajectories,
  allBatches,
}: BatchReportSummaryProps) {
  if (!latestBatch) {
    return (
      <div
        className="p-10 flex flex-col items-center gap-4 text-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <p className="text-base font-medium" style={{ color: 'var(--text)' }}>
          No analysis yet
        </p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Analyze your last games to find the habit behind your losses
        </p>
        <Link
          href="/"
          className="inline-flex items-center px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
          style={{ background: 'var(--brass)', color: '#1a1512' }}
        >
          Analyze my games →
        </Link>
      </div>
    )
  }

  const groups = [...(latestBatch.pattern_groups ?? [])].sort((a, b) => b.score - a.score)
  const headline = groups.find((g) => g.recurring) ?? null
  const affected = new Set(headline?.gameIds ?? [])
  const bars = (latestBatch.game_ids ?? []).map((id) =>
    affected.has(id) ? ('affected' as const) : ('quiet' as const)
  )
  const verdict = headline?.insight ?? latestBatch.claude_narrative?.split(/(?<=[.!?])\s+/)[0] ?? null

  return (
    <div
      className="p-6 flex flex-col gap-5"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {verdict && (
        <p className="font-headline" style={{ fontSize: 24, lineHeight: 1.3, color: 'var(--text)' }}>
          {verdict}
        </p>
      )}
      {bars.length > 0 && <RecurrenceStrip bars={bars} height={22} />}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
          Last {latestBatch.game_count} games · {formatDate(latestBatch.generated_at)}
        </p>
        <div className="flex items-center gap-3">
          {latestBatch.overall_accuracy !== null && (
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              {latestBatch.overall_accuracy}% accuracy
            </span>
          )}
          <span
            className="text-xs font-mono"
            style={{
              color:
                latestBatch.accuracy_delta === null
                  ? 'var(--text-dim)'
                  : latestBatch.accuracy_delta >= 0
                    ? 'var(--good)'
                    : 'var(--oxblood)',
            }}
          >
            {latestBatch.accuracy_delta === null
              ? '—'
              : `${latestBatch.accuracy_delta >= 0 ? '↑' : '↓'}${Math.abs(latestBatch.accuracy_delta)}%`}
          </span>
        </div>
      </div>

      {groups.length > 0 && (
        <div className="flex flex-col">
          {groups.slice(0, 5).map((g) => (
            <div
              key={g.tag}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2"
              style={{ borderTop: '1px solid var(--border)' }}
            >
              <span className="text-sm flex-1 min-w-[10rem]" style={{ color: 'var(--text)' }}>
                {g.label}
              </span>
              <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                {g.frequency} of {latestBatch.game_count} games
              </span>
              <span className="text-xs" style={{ width: 84, textAlign: 'right' }}>
                <TrajectoryLabel trajectory={trajectories[g.tag]} />
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        <Sparkline batches={allBatches} />
      </div>

      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/workbench/batch/${latestBatch.id}`}
          className="text-sm transition-opacity hover:opacity-70"
          style={{ color: 'var(--brass)' }}
        >
          Open full report →
        </Link>
        <Link
          href="/train"
          className="text-sm px-4 py-2 transition-colors"
          style={{ color: 'var(--bg)', background: 'var(--brass)' }}
        >
          Train these positions
        </Link>
      </div>
    </div>
  )
}
