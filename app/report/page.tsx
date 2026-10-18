'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Chess } from 'chess.js'
import RecurrenceStrip from '@/components/workbench/RecurrenceStrip'
import ChessBoard from '@/components/workbench/ChessBoard'
import BatchControls from '@/components/workbench/BatchControls'
import type { GuestSessionResult } from '@/types/guest'

function moveNum(ply: number): number {
  return Math.ceil(ply / 2)
}

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

  const groups = useMemo(
    () => [...(result?.pattern_groups ?? [])].sort((a, b) => b.score - a.score),
    [result]
  )
  const recurring = groups.filter((g) => g.recurring)
  const headlined = recurring.slice(0, 3)
  const watchList = groups.filter((g) => !headlined.includes(g))
  const headline = headlined[0] ?? null
  const exhibitGroup =
    headline ?? (groups.length > 0 ? groups.reduce((a, b) => (b.exhibit.swingCp > a.exhibit.swingCp ? b : a)) : null)

  const exhibit = useMemo(() => {
    if (!result || !exhibitGroup) return null
    const game = result.games.find((g) => g.analysis_data.gameId === exhibitGroup.exhibit.gameId)
    if (!game) return null
    const byPly = new Map(game.analysis_data.moves.map((m) => [m.ply_number, m]))
    const rootMove = byPly.get(exhibitGroup.exhibit.rootPly)
    const blunderMove = byPly.get(exhibitGroup.exhibit.blunderPly)
    if (!rootMove || !blunderMove) return null
    try {
      const chess = new Chess(rootMove.fen_before)
      const root = chess.move(rootMove.san)
      const fenAfterRoot = chess.fen()
      const chess2 = new Chess(blunderMove.fen_before)
      const blunder = chess2.move(blunderMove.san)
      if (!root || !blunder) return null
      return {
        fen: fenAfterRoot,
        rootSquare: root.to,
        blunderSquare: blunder.to,
        orientation: game.user_color,
      }
    } catch {
      return null
    }
  }, [result, exhibitGroup])

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
  const affected = new Set(headline?.gameIds ?? exhibitGroup?.gameIds ?? [])
  const bars = gameIds.map((id) => (affected.has(id) ? ('affected' as const) : ('quiet' as const)))
  const verdict = result.batch_report.verdict
  const gamesById = new Map(result.games.map((g) => [g.analysis_data.gameId, g]))

  return (
    <main className="min-h-screen px-4 py-12" style={{ background: 'var(--bg)' }}>
      <div className="flex flex-col gap-10 max-w-4xl mx-auto">
        <div className="flex items-baseline justify-between gap-4">
          <a href="/" className="font-logo" style={{ fontSize: 22, color: 'var(--text)', textDecoration: 'none' }}>
            chess<span style={{ color: 'var(--brass)' }}>ics</span>
          </a>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {result.batch_report.game_count} games analyzed
          </p>
        </div>

        <div className="flex flex-col gap-6">
          <h1 className="font-headline" style={{ fontSize: 34, lineHeight: 1.25, color: 'var(--text)', fontWeight: 500 }}>
            {verdict}
          </h1>
          <RecurrenceStrip bars={bars} />
          {result.batch_report.claude_narrative !== verdict && (
            <p className="text-base" style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
              {result.batch_report.claude_narrative.slice(verdict.length).trim()}
            </p>
          )}
        </div>

        {exhibitGroup && exhibit && (
          <div className="flex flex-col gap-4">
            <hr className="hairline" />
            <div className="flex gap-8 flex-wrap items-start">
              <ChessBoard
                fen={exhibit.fen}
                orientation={exhibit.orientation}
                size={288}
                shapes={[
                  { orig: exhibit.rootSquare, brush: 'brass' },
                  { orig: exhibit.blunderSquare, brush: 'oxblood' },
                  { orig: exhibit.rootSquare, dest: exhibit.blunderSquare, brush: 'brass' },
                ]}
              />
              <div className="flex flex-col gap-2 flex-1 min-w-56">
                <p className="text-sm" style={{ color: 'var(--text-dim)' }}>The worst instance</p>
                <p className="text-base" style={{ color: 'var(--text)' }}>
                  <span className="font-mono" style={{ color: 'var(--brass)' }}>{exhibitGroup.exhibit.rootSan}</span>{' '}
                  at move {moveNum(exhibitGroup.exhibit.rootPly)} led to{' '}
                  <span className="font-mono" style={{ color: 'var(--oxblood)' }}>{exhibitGroup.exhibit.blunderSan}</span>{' '}
                  at move {moveNum(exhibitGroup.exhibit.blunderPly)}.
                </p>
                <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                  Sign up to open full game reviews with every chain.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <hr className="hairline" />
          <h2 className="text-base font-medium py-3" style={{ color: 'var(--text)' }}>Recurring weaknesses</h2>
          {headlined.length === 0 && (
            <p className="text-sm pb-3" style={{ color: 'var(--text-dim)' }}>
              No habit appeared in 3 or more games of this batch — analyze more games to confirm or clear one.
            </p>
          )}
          {headlined.map((g) => (
            <div key={g.tag} className="flex flex-col gap-1 py-3" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <p className="text-base" style={{ color: 'var(--text)' }}>{g.label}</p>
                <p className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
                  {g.frequency} of {result.batch_report.game_count} games
                </p>
              </div>
              {g.insight && (
                <p className="text-sm" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>{g.insight}</p>
              )}
            </div>
          ))}
          {watchList.length > 0 && (
            <div className="flex flex-col gap-1 pt-4">
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Watch list — seen, not yet confirmed as habits</p>
              {watchList.map((g) => (
                <div key={g.tag} className="flex items-baseline justify-between gap-4 py-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{g.label}</p>
                  <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                    {g.frequency} of {result.batch_report.game_count} games
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

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
