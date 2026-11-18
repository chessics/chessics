'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Game } from '@/lib/supabase/types'
import { DAILY_CAP_CODE, dailyCapMessage, failureMessage } from '@/lib/ratelimit-message'
import { formatTimeControl } from '@/lib/review/time-control'
import { countNoun } from '@/lib/count-noun'
import { createStatusPoller, POLL_INTERVAL_MS } from '@/lib/sync/poll'
import { nextRowJob, rowJobAnnouncement, rowJobLabel, STATUS_LOST_LABEL, type RowJob } from '@/lib/games/analyze-job'

const RETRY_LABEL = "Couldn't queue, retry"
export const NOT_STANDARD_LABEL = "Variant, can't analyze"

interface GameRow extends Game {
  overall_accuracy?: number | null
}

interface Props {
  games: GameRow[]
}

type ResultFilter = 'all' | 'win' | 'loss' | 'draw'
type ColorFilter = 'all' | 'white' | 'black'

export const RESULT_BADGE = {
  win: { letter: 'W', word: 'Win', color: 'var(--good)', border: 'var(--good)' },
  loss: { letter: 'L', word: 'Loss', color: 'var(--text)', border: 'var(--oxblood)' },
  draw: { letter: 'D', word: 'Draw', color: 'var(--text-muted)', border: 'var(--border-strong)' },
} as const

function ResultBadge({ result }: { result: Game['result'] }) {
  const s = result ? RESULT_BADGE[result] : null
  return (
    <span
      style={{
        display: 'inline-block',
        width: 22,
        height: 22,
        lineHeight: '20px',
        textAlign: 'center',
        fontSize: 12,
        fontWeight: 700,
        color: s?.color ?? 'var(--text-muted)',
        border: `1px solid ${s?.border ?? 'var(--border-strong)'}`,
        flexShrink: 0,
      }}
    >
      <span aria-hidden="true">{s?.letter ?? '?'}</span>
      <span className="sr-only">{s?.word ?? 'Result unknown'}</span>
    </span>
  )
}

function PlatformLabel({ platform }: { platform: Game['platform'] }) {
  const label = platform === 'chess_com' ? 'CC' : platform === 'lichess' ? 'Li' : 'U'
  const name = platform === 'chess_com' ? 'Chess.com' : platform === 'lichess' ? 'Lichess' : 'Uploaded'
  return (
    <span
      style={{
        display: 'inline-block',
        whiteSpace: 'nowrap',
        fontSize: 12,
        padding: '1px 5px',
        background: 'var(--surface-3)',
        color: 'var(--text-dim)',
        fontFamily: 'JetBrains Mono, monospace',
        letterSpacing: '0.05em',
        flexShrink: 0,
      }}
    >
      <span className="games-label-full">{name}</span>
      <span className="games-label-short"><span aria-hidden="true">{label}</span><span className="sr-only">{name}</span></span>
    </span>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  })
}

function Placeholder({ words }: { words?: string }) {
  return (
    <>
      <span aria-hidden="true">—</span>
      {words && <span className="sr-only">{words}</span>}
    </>
  )
}

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="games-filter"
    >
      {children}
    </button>
  )
}

export default function GamesLibraryClient({ games }: Props) {
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')
  const [colorFilter, setColorFilter] = useState<ColorFilter>('all')
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [jobs, setJobs] = useState<Map<string, RowJob>>(new Map())
  const timers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())
  const router = useRouter()
  const [failedIds, setFailedIds] = useState<Map<string, string>>(new Map())
  const [announcement, setAnnouncement] = useState('')
  const focusedButton = useRef<string | null>(null)
  const pendingFocus = useRef<string | null>(null)

  const announce = useCallback(
    (gameId: string, job: RowJob) => {
      const opponent = games.find((g) => g.id === gameId)?.opponent_username || null
      setAnnouncement(rowJobAnnouncement(opponent, job))
    },
    [games]
  )

  useEffect(() => {
    const id = pendingFocus.current
    if (!id) return
    const el = document.querySelector<HTMLElement>(`[data-focus-game="${CSS.escape(id)}"]`)
    if (!el) return
    const active = document.activeElement
    if (active && active !== document.body && active !== el) {
      pendingFocus.current = null
      return
    }
    el.focus()
    if (el.classList.contains('games-grid')) pendingFocus.current = null
  })

  const filtered = useMemo(() => {
    return games.filter((g) => {
      const matchResult =
        resultFilter === 'all' || g.result === resultFilter
      const matchColor =
        colorFilter === 'all' || g.user_color === colorFilter
      return matchResult && matchColor
    })
  }, [games, resultFilter, colorFilter])

  useEffect(() => {
    const running = timers.current
    return () => running.forEach((t) => clearInterval(t))
  }, [])

  const stopWatching = (gameId: string) => {
    const t = timers.current.get(gameId)
    if (t) clearInterval(t)
    timers.current.delete(gameId)
  }

  const setJob = useCallback(
    (gameId: string, job: RowJob) => {
      if (job.phase === 'done' && focusedButton.current === gameId) pendingFocus.current = gameId
      setJobs((prev) => new Map(prev).set(gameId, job))
      announce(gameId, job)
    },
    [announce]
  )

  const watchJob = (gameId: string, jobId: string) => {
    stopWatching(gameId)
    let current: RowJob = { phase: 'starting', jobId }
    setJob(gameId, current)
    const tick = createStatusPoller<{ status?: unknown }>({
      fetchStatus: () => fetch(`/api/sync/status?jobId=${encodeURIComponent(jobId)}`),
      onStatus: (body) => {
        const next = nextRowJob(current, body)
        if (!next) return
        current = next
        setJob(gameId, next)
        if (next.phase === 'done') {
          stopWatching(gameId)
          router.refresh()
        } else if (next.phase === 'failed') {
          stopWatching(gameId)
        }
      },
      onGiveUp: () => {
        stopWatching(gameId)
        current = { phase: 'failed', label: STATUS_LOST_LABEL }
        setJob(gameId, current)
      },
    })
    void tick()
    timers.current.set(gameId, setInterval(() => void tick(), POLL_INTERVAL_MS))
  }

  const handleAnalyze = async (gameId: string) => {
    setAnalyzingId(gameId)
    try {
      const res = await fetch('/api/analyze/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId }),
      })
      const ok = res.ok
      const data = await res.json().catch(() => null)
      const jobId = ok ? data?.jobId : undefined
      if (typeof jobId === 'string') watchJob(gameId, jobId)
      let refused: string | null = null
      if (!ok) {
        refused = res.status === 422 ? NOT_STANDARD_LABEL : failureMessage(res.status, RETRY_LABEL)
        if (res.status === 429 && data?.error === DAILY_CAP_CODE) {
          refused = dailyCapMessage(Number(res.headers.get('Retry-After')))
        }
      }
      setFailedIds((prev) => {
        const next = new Map(prev)
        if (refused === null) next.delete(gameId)
        else next.set(gameId, refused)
        return next
      })
      if (refused !== null) announce(gameId, { phase: 'failed', label: refused })
    } catch {
      setFailedIds((prev) => new Map(prev).set(gameId, RETRY_LABEL))
      announce(gameId, { phase: 'failed', label: RETRY_LABEL })
    } finally {
      setAnalyzingId(null)
    }
  }

  return (
    <div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <div className="games-filters">
        <div role="group" aria-label="Filter by result" style={{ display: 'flex', gap: 3 }}>
          {(['all', 'win', 'loss', 'draw'] as const).map((r) => (
            <FilterTab
              key={r}
              active={resultFilter === r}
              onClick={() => setResultFilter(r)}
            >
              {r === 'all' ? 'All' : r === 'win' ? 'Wins' : r === 'loss' ? 'Losses' : 'Draws'}
            </FilterTab>
          ))}
        </div>

        <div
          style={{
            width: 1,
            height: 20,
            background: 'var(--border)',
            margin: '0 4px',
          }}
        />

        <div role="group" aria-label="Filter by color" style={{ display: 'flex', gap: 3 }}>
          {(['all', 'white', 'black'] as const).map((c) => (
            <FilterTab
              key={c}
              active={colorFilter === c}
              onClick={() => setColorFilter(c)}
            >
              {c === 'all' ? (
                'Both colors'
              ) : (
                <>
                  {c === 'white' ? 'White' : 'Black'}
                </>
              )}
            </FilterTab>
          ))}
        </div>

        <span
          style={{
            marginLeft: 'auto',
            fontSize: 12,
            color: 'var(--text-dim)',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          {countNoun(filtered.length, 'game')}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            No games match this filter.
          </p>
        </div>
      ) : (
        <div
          style={{
            borderBlock: '1px solid var(--border)',
          }}
        >
          <div
            aria-hidden="true"
            className="games-grid games-head"
            style={{
              padding: '8px 16px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            {['Date', '', '', 'Opponent', 'Opening', 'Time', 'Acc.', ''].map(
              (h, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 12,
                    letterSpacing: '0.02em',
                    color: 'var(--text-dim)',
                    fontWeight: 600,
                    padding: '0 4px',
                  }}
                >
                  {h}
                </span>
              )
            )}
          </div>

          {filtered.map((game, idx) => {
            const job = jobs.get(game.id)
            const jobFailed = job?.phase === 'failed' ? job.label : undefined
            const isBeingAnalyzed = analyzingId === game.id
            const running = isBeingAnalyzed || job?.phase === 'starting' || job?.phase === 'analyzing'
            const rowStyle: React.CSSProperties = {
              padding: '10px 16px',
              borderBottom:
                idx < filtered.length - 1
                  ? '1px solid var(--border)'
                  : 'none',
            }

            const cells = (
              <>
                <span
                  className="games-cell-date"
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    padding: '0 4px',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  {game.played_at ? formatDate(game.played_at) : <Placeholder />}
                </span>

                <div className="games-cell-result" style={{ padding: '0 2px' }}>
                  <ResultBadge result={game.result} />
                </div>

                <div className="games-cell-platform" style={{ padding: '0 2px' }}>
                  <PlatformLabel platform={game.platform} />
                </div>

                <span
                  className="games-cell-opponent"
                  style={{
                    fontSize: 13,
                    color: 'var(--text)',
                    padding: '0 4px',
                    overflowWrap: 'anywhere',
                    minWidth: 0,
                  }}
                >
                  {game.opponent_username || <Placeholder words="Opponent unknown" />}
                </span>

                <span
                  className="games-cell-opening"
                  data-empty={game.opening_name ? undefined : ''}
                  style={{
                    fontSize: 12,
                    color: 'var(--text-dim)',
                    padding: '0 4px',
                    overflowWrap: 'anywhere',
                    minWidth: 0,
                  }}
                >
                  {game.opening_name ?? <Placeholder />}
                </span>

                <span
                  className="games-cell-time"
                  style={{
                    fontSize: 11,
                    color: 'var(--text-dim)',
                    padding: '0 4px',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  {formatTimeControl(game.time_control) ?? <Placeholder />}
                </span>

                <span
                  className="games-cell-accuracy"
                  style={{
                    fontSize: 12,
                    color:
                      game.overall_accuracy == null
                        ? 'var(--text-dim)'
                        : game.overall_accuracy >= 85
                          ? 'var(--good)'
                          : game.overall_accuracy >= 65
                            ? 'var(--gold)'
                            : 'var(--mistake)',
                    padding: '0 4px',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontWeight: 500,
                  }}
                >
                  {game.overall_accuracy != null ? (
                    <>
                      {`${game.overall_accuracy.toFixed(0)}%`}
                      <span className="sr-only"> accuracy</span>
                    </>
                  ) : (
                    <Placeholder />
                  )}
                </span>

                <div className="games-cell-action" style={{ padding: '0 4px' }}>
                  {game.is_analyzed ? (
                    <span className="games-review-link">
                      <span className="games-label-full">View review</span>
                      <span className="games-label-short">Review</span>
                      <span aria-hidden="true"> →</span>
                    </span>
                  ) : job?.phase === 'done' ? (
                    <Link
                      href={`/games/${game.id}/review`}
                      data-focus-game={game.id}
                      style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 500,
                        color: 'var(--gold)',
                        border: '1px solid rgba(201,165,92,0.25)',
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Review
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!running) void handleAnalyze(game.id)
                      }}
                      onFocus={() => {
                        focusedButton.current = game.id
                      }}
                      onBlur={() => {
                        if (focusedButton.current === game.id) focusedButton.current = null
                      }}
                      aria-disabled={running || undefined}
                      style={{
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 500,
                        color: 'var(--text-muted)',
                        background: 'transparent',
                        border: running ? '1px solid transparent' : '1px solid var(--border)',
                        cursor: running ? 'default' : 'pointer',
                        whiteSpace: failedIds.has(game.id) || jobFailed ? 'normal' : 'nowrap',
                        transition: 'border-color 0.15s, color 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        if (!running) {
                          e.currentTarget.style.borderColor = 'var(--gold-dim)'
                          e.currentTarget.style.color = 'var(--text)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = running ? 'transparent' : 'var(--border)'
                        e.currentTarget.style.color = 'var(--text-muted)'
                      }}
                    >
                      {isBeingAnalyzed
                        ? 'Queuing…'
                        : job && (job.phase === 'starting' || job.phase === 'analyzing')
                          ? rowJobLabel(job)
                          : failedIds.get(game.id) ?? jobFailed ?? 'Analyze'}
                    </button>
                  )}
                </div>
              </>
            )

            return game.is_analyzed ? (
              <Link
                key={game.id}
                href={`/games/${game.id}/review`}
                data-focus-game={game.id}
                className="games-grid games-row"
                style={{ ...rowStyle, color: 'inherit', textDecoration: 'none' }}
              >
                {cells}
              </Link>
            ) : (
              <div key={game.id} className="games-grid games-row" style={rowStyle}>
                {cells}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
