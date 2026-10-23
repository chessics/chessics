'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import RecurrenceStrip from '@/components/workbench/RecurrenceStrip'
import BatchControls from '@/components/workbench/BatchControls'
import Diagnosis from '@/components/diagnosis/Diagnosis'
import SittingLine from '@/components/diagnosis/SittingLine'
import { PROSE_MEASURE, REPORT_COLUMN, VERDICT_FONT_SIZE } from '@/components/report/column'
import { buildFindings, selectFindings } from '@/lib/diagnosis/finding'
import { guestFatigue, guestInstances } from '@/lib/diagnosis/guest'
import { ANALYZE_MORE_ID, MORE_GAMES_HINT, verdictFor, withoutEmDash } from '@/lib/diagnosis/verdict'
import type { GuestSessionResult } from '@/types/guest'

export default function GuestReportPage() {
  const router = useRouter()
  const [result, setResult] = useState<GuestSessionResult | null>(null)
  const [sessionMeta, setSessionMeta] = useState<{ username: string; platform: 'chess.com' | 'lichess' } | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')

  useEffect(() => {
    const raw = localStorage.getItem('chessics_session')
    if (!raw) {
      router.replace('/')
      return
    }
    let token: string | undefined
    try {
      const session = JSON.parse(raw) as { sessionToken?: string; username?: string; platform?: 'chess.com' | 'lichess' }
      token = session.sessionToken
      if (session.username && session.platform) {
        setSessionMeta({ username: session.username, platform: session.platform })
      }
    } catch {  }
    if (!token) {
      router.replace('/')
      return
    }
    fetch(`/api/guest/result?sessionToken=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          setState('missing')
          return
        }
        setResult((await res.json()) as GuestSessionResult)
        setState('ready')
      })
      .catch(() => setState('missing'))
  }, [router])

  const findings = useMemo(
    () => (result ? buildFindings(result.pattern_groups ?? [], guestInstances(result), result.batch_report.game_count) : []),
    [result]
  )
  const fatigue = useMemo(() => (result ? guestFatigue(result) : null), [result])
  const stripGroup = useMemo(() => selectFindings(result?.pattern_groups ?? []).ordered[0] ?? null, [result])

  if (state === 'loading') return null

  if (state === 'missing' || !result) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
        <div className="text-center flex flex-col gap-3">
          <p className="text-base" style={{ color: 'var(--text)' }}>This analysis has expired.</p>
          <a href="/" className="text-sm" style={{ color: 'var(--brass)' }}>Run a new one →</a>
        </div>
      </main>
    )
  }

  const gameIds = result.batch_report.game_ids ?? []
  const affected = new Set(stripGroup?.gameIds ?? [])
  const bars = gameIds.map((id) => (affected.has(id) ? ('affected' as const) : ('quiet' as const)))
  const storedVerdict = result.batch_report.verdict
  const verdict = verdictFor(storedVerdict, (result.pattern_groups ?? []).some((g) => g.recurring))
  const gamesById = new Map(result.games.map((g) => [g.analysis_data.gameId, g]))

  return (
    <main className="min-h-screen px-4 sm:px-8 lg:px-12 py-12" style={{ background: 'var(--bg)' }}>
      <div className={`flex flex-col gap-10 ${REPORT_COLUMN}`}>
        <div className="flex items-baseline justify-between gap-4">
          <a href="/" className="font-logo" style={{ fontSize: 22, color: 'var(--text)', textDecoration: 'none' }}>
            chess<span style={{ color: 'var(--brass)' }}>ics</span>
          </a>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {result.batch_report.game_count} games analyzed
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {verdict && (
            <h1 className="font-headline" style={{ fontSize: VERDICT_FONT_SIZE, lineHeight: 1.25, color: 'var(--text)', fontWeight: 500 }}>
              {verdict.text}
            </h1>
          )}
          {verdict?.needsMoreGames && (
            <a
              href={`#${ANALYZE_MORE_ID}`}
              className="text-base w-fit transition-opacity hover:opacity-80"
              style={{ color: 'var(--brass)', textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              {MORE_GAMES_HINT} ↓
            </a>
          )}
          <RecurrenceStrip bars={bars} />
          {result.batch_report.claude_narrative !== storedVerdict && (
            <p className="text-base" style={{ color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: PROSE_MEASURE }}>
              {withoutEmDash(result.batch_report.claude_narrative.slice(storedVerdict.length).trim())}
            </p>
          )}
        </div>

        <Diagnosis
          findings={findings}
          reviewLinks={false}
          sourcesNote="Sign up to open full game reviews with every chain."
        />

        <SittingLine line={fatigue} reviewLinks={false} />

        <div className="flex flex-col gap-3">
          <hr className="hairline" />
          <div className="flex items-center gap-8 py-2">
            <div>
              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Accuracy</p>
              <p className="text-lg font-mono" style={{ color: 'var(--text)' }}>
                {result.batch_report.overall_accuracy}%
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <hr className="hairline" />
          <h2 className="text-base font-medium py-3" style={{ color: 'var(--text)' }}>Games in this batch</h2>
          {gameIds.map((id) => {
            const game = gamesById.get(id)
            if (!game) return null
            const isAffected = affected.has(id)
            return (
              <div key={id} className="flex items-center gap-4 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                <span style={{ width: 3, alignSelf: 'stretch', background: isAffected ? 'var(--brass)' : 'transparent' }} />
                <span className="text-sm flex-1 truncate" style={{ color: 'var(--text)' }}>
                  {game.opponent_username ?? 'Unknown opponent'}
                </span>
                <span
                  className="text-sm capitalize"
                  style={{
                    width: 44,
                    color: game.result === 'win' ? 'var(--good)' : game.result === 'loss' ? 'var(--oxblood)' : 'var(--text-muted)',
                  }}
                >
                  {game.result}
                </span>
                <span className="text-xs font-mono text-right" style={{ width: 44, color: 'var(--text-muted)' }}>
                  {game.analysis_data.analysis.overall_accuracy}%
                </span>
              </div>
            )
          })}
        </div>

        <BatchControls
          username={sessionMeta?.username ?? null}
          platform={sessionMeta?.platform ?? null}
          calibrationLevel={result.calibration_level}
          isGuest
        />
      </div>
    </main>
  )
}
