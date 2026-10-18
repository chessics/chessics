'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { Game } from '@/lib/supabase/types'

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
        borderRadius: 4,
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
        borderRadius: 3,
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
        borderRadius: 20,
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
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set())

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
        const next = new Set(prev)
        if (ok) next.delete(gameId)
        else next.add(gameId)
        return next
      })
    } catch {
      setFailedIds((prev) => new Set([...Array.from(prev), gameId]))
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
            borderRadius: 8,
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
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '90px 28px 28px 140px 1fr 80px 72px 100px',
              gap: 0,
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

            return (
              <div
                key={game.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 28px 28px 140px 1fr 80px 72px 100px',
                  gap: 0,
                  padding: '10px 16px',
                  borderBottom:
                    idx < filtered.length - 1
                      ? '1px solid var(--border)'
                      : 'none',
                  alignItems: 'center',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(201,165,92,0.04)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    padding: '0 4px',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  {formatDate(game.played_at)}
                </span>

                <div style={{ padding: '0 2px' }}>
                  <ResultBadge result={game.result} />
                </div>

                <div style={{ padding: '0 2px' }}>
                  <PlatformDot platform={game.platform} />
                </div>

                <span
                  style={{
                    fontSize: 13,
                    color: 'var(--text)',
                    padding: '0 4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {game.opponent_username ?? '—'}
                </span>

                <span
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
                  style={{
                    fontSize: 11,
                    color: 'var(--text-dim)',
                    padding: '0 4px',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  {game.time_control ?? '—'}
                </span>

                <span
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

                <div style={{ padding: '0 4px' }}>
                  {game.is_analyzed ? (
                    <Link
                      href={`/games/${game.id}/review`}
                      style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 500,
                        color: 'var(--gold)',
                        background: 'rgba(201,165,92,0.1)',
                        border: '1px solid rgba(201,165,92,0.25)',
                        borderRadius: 5,
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          'rgba(201,165,92,0.2)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background =
                          'rgba(201,165,92,0.1)'
                      }}
                    >
                      View review
                    </Link>
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
                        borderRadius: 5,
                        cursor: isBeingAnalyzed ? 'default' : 'pointer',
                        whiteSpace: 'nowrap',
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
                      {isBeingAnalyzed ? 'Queuing…' : failedIds.has(game.id) ? "Couldn't queue, retry" : 'Analyze'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
