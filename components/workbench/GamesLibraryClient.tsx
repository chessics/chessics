'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { Game } from '@/lib/supabase/types'
import { failureMessage } from '@/lib/ratelimit-message'
import { formatTimeControl } from '@/lib/review/time-control'

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

function ResultBadge({ result }: { result: Game['result'] }) {
  const map = {
    win: { label: 'W', bg: 'rgba(39,174,96,0.12)', color: 'var(--good)', border: 'rgba(39,174,96,0.3)' },
    loss: { label: 'L', bg: 'rgba(192,57,43,0.12)', color: 'var(--blunder)', border: 'rgba(192,57,43,0.3)' },
    draw: { label: 'D', bg: 'rgba(154,136,120,0.08)', color: 'var(--text-muted)', border: 'rgba(154,136,120,0.25)' },
  }
  const s = result ? map[result] : map.draw
  return (
    <span
      style={{
        display: 'inline-block',
        width: 22,
        height: 22,
        lineHeight: '22px',
        textAlign: 'center',
        fontSize: 11,
        fontWeight: 700,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        flexShrink: 0,
      }}
    >
      {s.label}
    </span>
  )
}

function PlatformDot({ platform }: { platform: Game['platform'] }) {
  const label = platform === 'chess_com' ? 'CC' : platform === 'lichess' ? 'Li' : 'U'
  return (
    <span
      style={{
        fontSize: 9,
        padding: '1px 5px',
        background: 'var(--surface-3)',
        color: 'var(--text-dim)',
        fontFamily: 'JetBrains Mono, monospace',
        letterSpacing: '0.05em',
        flexShrink: 0,
      }}
    >
      {label}
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
      onClick={onClick}
      style={{
        padding: '5px 12px',
        fontSize: 12,
        fontWeight: active ? 500 : 400,
        background: active ? 'rgba(201,165,92,0.14)' : 'transparent',
        color: active ? 'var(--gold)' : 'var(--text-muted)',
        border: `1px solid ${active ? 'rgba(201,165,92,0.3)' : 'transparent'}`,
        cursor: 'pointer',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

export default function GamesLibraryClient({ games }: Props) {
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')
  const [colorFilter, setColorFilter] = useState<ColorFilter>('all')
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set())
  const [failedIds, setFailedIds] = useState<Map<string, string>>(new Map())

  const filtered = useMemo(() => {
    return games.filter((g) => {
      const matchResult =
        resultFilter === 'all' || g.result === resultFilter
      const matchColor =
        colorFilter === 'all' || g.user_color === colorFilter
      return matchResult && matchColor
    })
  }, [games, resultFilter, colorFilter])

  const handleAnalyze = async (gameId: string) => {
    setAnalyzingId(gameId)
    try {
      const res = await fetch('/api/analyze/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId }),
      })
      const ok = res.ok
      setQueuedIds((prev) => (ok ? new Set([...Array.from(prev), gameId]) : prev))
      setFailedIds((prev) => {
        const next = new Map(prev)
        if (ok) next.delete(gameId)
        else next.set(gameId, res.status === 422 ? NOT_STANDARD_LABEL : failureMessage(res.status, RETRY_LABEL))
        return next
      })
    } catch {
      setFailedIds((prev) => new Map(prev).set(gameId, RETRY_LABEL))
    } finally {
      setAnalyzingId(null)
    }
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', gap: 3 }}>
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

        <div style={{ display: 'flex', gap: 3 }}>
          {(['all', 'white', 'black'] as const).map((c) => (
            <FilterTab
              key={c}
              active={colorFilter === c}
              onClick={() => setColorFilter(c)}
            >
              {c === 'all' ? 'Both colors' : c === 'white' ? '⬜ White' : '⬛ Black'}
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
          {filtered.length} game{filtered.length !== 1 ? 's' : ''}
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
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}
        >
          <div
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
                    fontSize: 10,
                    letterSpacing: '0.08em',

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
            const isQueued = queuedIds.has(game.id)
            const isBeingAnalyzed = analyzingId === game.id
            const rowStyle: React.CSSProperties = {
              padding: '10px 16px',
              borderBottom:
                idx < filtered.length - 1
                  ? '1px solid var(--border)'
                  : 'none',
              transition: 'background 0.1s',
            }
            const hover = {
              onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
                e.currentTarget.style.background = 'rgba(201,165,92,0.04)'
              },
              onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
                e.currentTarget.style.background = 'transparent'
              },
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
                  {formatDate(game.played_at)}
                </span>

                <div className="games-cell-result" style={{ padding: '0 2px' }}>
                  <ResultBadge result={game.result} />
                </div>

                <div className="games-cell-platform" style={{ padding: '0 2px' }}>
                  <PlatformDot platform={game.platform} />
                </div>

                <span
                  className="games-cell-opponent"
                  style={{
                    fontSize: 13,
                    color: 'var(--text)',
                    padding: '0 4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {game.opponent_username || '—'}
                </span>

                <span
                  className="games-cell-opening"
                  data-empty={game.opening_name ? undefined : ''}
                  style={{
                    fontSize: 12,
                    color: 'var(--text-dim)',
                    padding: '0 4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={game.opening_name ?? undefined}
                >
                  {game.opening_name ?? '—'}
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
                  {formatTimeControl(game.time_control) ?? '—'}
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
                  {game.overall_accuracy != null
                    ? `${game.overall_accuracy.toFixed(0)}%`
                    : '—'}
                </span>

                <div className="games-cell-action" style={{ padding: '0 4px' }}>
                  {game.is_analyzed ? (
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 500,
                        color: 'var(--gold)',
                        background: 'rgba(201,165,92,0.1)',
                        border: '1px solid rgba(201,165,92,0.25)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span className="games-label-full">View review</span>
                      <span className="games-label-short">Review</span>
                    </span>
                  ) : isQueued ? (
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--text-dim)',
                        padding: '4px 10px',
                        display: 'inline-block',
                      }}
                    >
                      Queued ✓
                    </span>
                  ) : (
                    <button
                      onClick={() => handleAnalyze(game.id)}
                      disabled={isBeingAnalyzed}
                      style={{
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 500,
                        color: 'var(--text-muted)',
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        cursor: isBeingAnalyzed ? 'default' : 'pointer',
                        whiteSpace: failedIds.has(game.id) ? 'normal' : 'nowrap',
                        opacity: isBeingAnalyzed ? 0.6 : 1,
                        transition: 'border-color 0.15s, color 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isBeingAnalyzed) {
                          e.currentTarget.style.borderColor = 'var(--gold-dim)'
                          e.currentTarget.style.color = 'var(--text)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)'
                        e.currentTarget.style.color = 'var(--text-muted)'
                      }}
                    >
                      {isBeingAnalyzed ? 'Queuing…' : failedIds.get(game.id) ?? 'Analyze'}
                    </button>
                  )}
                </div>
              </>
            )

            return game.is_analyzed ? (
              <Link
                key={game.id}
                href={`/games/${game.id}/review`}
                className="games-grid"
                style={{ ...rowStyle, color: 'inherit', textDecoration: 'none' }}
                {...hover}
              >
                {cells}
              </Link>
            ) : (
              <div key={game.id} className="games-grid" style={rowStyle} {...hover}>
                {cells}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
