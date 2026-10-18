import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Chess } from 'chess.js'
import { createClient } from '@/lib/supabase/server'
import RecurrenceStrip from '@/components/workbench/RecurrenceStrip'
import ExhibitBoard from '@/components/workbench/ExhibitBoard'
import BatchControls from '@/components/workbench/BatchControls'
import type { BatchPatternGroup, BatchReport, Game, GameAnalysis, Move, Profile } from '@/lib/supabase/types'

interface BatchPageProps {
  params: { id: string }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function moveNum(ply: number): number {
  return Math.ceil(ply / 2)
}

function moveSquares(fenBefore: string, san: string): { from: string; to: string; fenAfter: string } | null {
  try {
    const chess = new Chess(fenBefore)
    const move = chess.move(san)
    if (!move) return null
    return { from: move.from, to: move.to, fenAfter: chess.fen() }
  } catch {
    return null
  }
}

export default async function BatchReportPage({ params }: BatchPageProps) {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) notFound()
  const userId = session.user.id

  const [batchResult, profileResult] = await Promise.all([
    supabase
      .from('batch_reports')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
  ])

  const batch = batchResult.data as BatchReport | null
  if (!batch) notFound()
  const profile = (profileResult.data ?? null) as Profile | null

  const groups = (batch.pattern_groups ?? []) as BatchPatternGroup[]
  const recurring = groups.filter((g) => g.recurring)
  const headlined = recurring.slice(0, 3)
  const watchList = groups.filter((g) => !headlined.includes(g))
  const headline = headlined[0] ?? null

  const exhibitGroup =
    headline ??
    (groups.length > 0
      ? groups.reduce((a, b) => (b.exhibit.swingCp > a.exhibit.swingCp ? b : a))
      : null)

  const gameIds = batch.game_ids ?? []
  const [gamesResult, analysesResult] = await Promise.all([
    gameIds.length > 0
      ? supabase.from('games').select('*').in('id', gameIds)
      : Promise.resolve({ data: [] }),
    gameIds.length > 0
      ? supabase.from('game_analyses').select('*').in('game_id', gameIds)
      : Promise.resolve({ data: [] }),
  ])
  const gamesById = new Map((gamesResult.data as Game[] | null ?? []).map((g) => [g.id, g]))
  const analysesByGame = new Map(
    ((analysesResult.data as GameAnalysis[] | null) ?? []).map((a) => [a.game_id, a])
  )
  const orderedGames = gameIds
    .map((id) => gamesById.get(id))
    .filter((g): g is Game => !!g)

  let exhibitBoard: {
    fen: string
    rootSquare: string
    blunderSquare: string
    orientation: 'white' | 'black'
  } | null = null
  if (exhibitGroup) {
    const { data: exhibitMoves } = await supabase
      .from('moves')
      .select('ply_number, san, fen_before')
      .eq('game_id', exhibitGroup.exhibit.gameId)
      .in('ply_number', [exhibitGroup.exhibit.rootPly, exhibitGroup.exhibit.blunderPly])
    const byPly = new Map(((exhibitMoves ?? []) as Pick<Move, 'ply_number' | 'san' | 'fen_before'>[]).map((m) => [m.ply_number, m]))
    const rootMove = byPly.get(exhibitGroup.exhibit.rootPly)
    const blunderMove = byPly.get(exhibitGroup.exhibit.blunderPly)
    if (rootMove && blunderMove) {
      const root = moveSquares(rootMove.fen_before, rootMove.san)
      const blunder = moveSquares(blunderMove.fen_before, blunderMove.san)
      const exhibitGame = gamesById.get(exhibitGroup.exhibit.gameId)
      if (root && blunder) {
        exhibitBoard = {
          fen: root.fenAfter,
          rootSquare: root.to,
          blunderSquare: blunder.to,
          orientation: exhibitGame?.user_color ?? 'white',
        }
      }
    }
  }

  const affected = new Set(headline?.gameIds ?? exhibitGroup?.gameIds ?? [])
  const bars = gameIds.map((id) => (affected.has(id) ? ('affected' as const) : ('quiet' as const)))

  const syncedRating =
    orderedGames
      .filter((g) => g.user_rating_at_time !== null)
      .sort((a, b) => (b.played_at ?? '').localeCompare(a.played_at ?? ''))[0]
      ?.user_rating_at_time ?? profile?.current_rating ?? null

  const platform: 'chess.com' | 'lichess' | null = profile?.chess_com_username
    ? 'chess.com'
    : profile?.lichess_username
      ? 'lichess'
      : null
  const platformUsername = profile?.chess_com_username ?? profile?.lichess_username ?? null

  const verdict = headline?.insight ?? batch.claude_narrative?.split(/(?<=[.!?])\s+/)[0] ?? null

  return (
    <div className="flex flex-col gap-10 max-w-4xl mx-auto">
      <div className="flex flex-col gap-3">
        <Link
          href="/workbench"
          className="text-sm transition-opacity hover:opacity-70 w-fit"
          style={{ color: 'var(--text-dim)' }}
        >
          ← Workbench
        </Link>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {batch.game_count} games · {formatDate(batch.generated_at)}
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {verdict && (
          <h1
            className="font-headline"
            style={{ fontSize: 34, lineHeight: 1.25, color: 'var(--text)', fontWeight: 500 }}
          >
            {verdict}
          </h1>
        )}
        <RecurrenceStrip bars={bars} />
        {batch.claude_narrative && verdict && batch.claude_narrative !== verdict && (
          <p className="text-base" style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
            {batch.claude_narrative.slice(verdict.length).trim()}
          </p>
        )}
      </div>

      {exhibitGroup && exhibitBoard && (
        <div className="flex flex-col gap-4">
          <hr className="hairline" />
          <div className="flex gap-8 flex-wrap items-start">
            <ExhibitBoard
              fen={exhibitBoard.fen}
              rootSquare={exhibitBoard.rootSquare}
              blunderSquare={exhibitBoard.blunderSquare}
              orientation={exhibitBoard.orientation}
              gameId={exhibitGroup.exhibit.gameId}
              rootPly={exhibitGroup.exhibit.rootPly}
            />
            <div className="flex flex-col gap-2 flex-1 min-w-56">
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                The worst instance
              </p>
              <p className="text-base" style={{ color: 'var(--text)' }}>
                <span className="font-mono" style={{ color: 'var(--brass)' }}>
                  {exhibitGroup.exhibit.rootSan}
                </span>{' '}
                at move {moveNum(exhibitGroup.exhibit.rootPly)} led to{' '}
                <span className="font-mono" style={{ color: 'var(--oxblood)' }}>
                  {exhibitGroup.exhibit.blunderSan}
                </span>{' '}
                at move {moveNum(exhibitGroup.exhibit.blunderPly)}.
              </p>
              <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                Click the board to open this game&apos;s review at the chain.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <hr className="hairline" />
        <h2 className="text-base font-medium py-3" style={{ color: 'var(--text)' }}>
          Recurring weaknesses
        </h2>
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
                {g.frequency} of {batch.game_count} games
              </p>
            </div>
            {g.insight && (
              <p className="text-sm" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {g.insight}
              </p>
            )}
          </div>
        ))}
        {watchList.length > 0 && (
          <div className="flex flex-col gap-1 pt-4">
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
              Watch list — seen, not yet confirmed as habits
            </p>
            {watchList.map((g) => (
              <div
                key={g.tag}
                className="flex items-baseline justify-between gap-4 py-2"
                style={{ borderTop: '1px solid var(--border)' }}
              >
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{g.label}</p>
                <p className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                  {g.frequency} of {batch.game_count} games
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <hr className="hairline" />
        <div className="flex items-center gap-8 flex-wrap py-2">
          <div>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Rating</p>
            <p className="text-lg font-mono" style={{ color: 'var(--text)' }}>
              {syncedRating ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Accuracy</p>
            <p className="text-lg font-mono" style={{ color: 'var(--text)' }}>
              {batch.overall_accuracy !== null ? `${batch.overall_accuracy}%` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Vs previous batch</p>
            <p
              className="text-lg font-mono"
              style={{
                color:
                  batch.accuracy_delta === null
                    ? 'var(--text-dim)'
                    : batch.accuracy_delta >= 0
                      ? 'var(--good)'
                      : 'var(--oxblood)',
              }}
            >
              {batch.accuracy_delta === null
                ? '—'
                : `${batch.accuracy_delta >= 0 ? '+' : ''}${batch.accuracy_delta}%`}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <hr className="hairline" />
        <h2 className="text-base font-medium py-3" style={{ color: 'var(--text)' }}>
          Games in this batch
        </h2>
        {orderedGames.map((game) => {
          const analysis = analysesByGame.get(game.id)
          const isAffected = affected.has(game.id)
          return (
            <Link
              key={game.id}
              href={`/games/${game.id}/review`}
              className="flex items-center gap-4 py-2.5 transition-opacity hover:opacity-75"
              style={{ borderTop: '1px solid var(--border)', textDecoration: 'none' }}
            >
              <span
                style={{
                  width: 3,
                  alignSelf: 'stretch',
                  background: isAffected ? 'var(--brass)' : 'transparent',
                }}
              />
              <span className="text-sm flex-1 truncate" style={{ color: 'var(--text)' }}>
                {game.opponent_username ?? 'Unknown opponent'}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                {game.played_at ? formatDate(game.played_at) : '—'}
              </span>
              <span
                className="text-sm capitalize"
                style={{
                  width: 44,
                  color:
                    game.result === 'win'
                      ? 'var(--good)'
                      : game.result === 'loss'
                        ? 'var(--oxblood)'
                        : 'var(--text-muted)',
                }}
              >
                {game.result ?? '—'}
              </span>
              <span
                className="text-xs font-mono text-right"
                style={{ width: 44, color: 'var(--text-muted)' }}
              >
                {analysis?.overall_accuracy !== null && analysis?.overall_accuracy !== undefined
                  ? `${analysis.overall_accuracy}%`
                  : '—'}
              </span>
            </Link>
          )
        })}
        {orderedGames.length === 0 && (
          <p className="text-sm py-3" style={{ color: 'var(--text-dim)' }}>
            No game data available for this batch.
          </p>
        )}
      </div>

      <BatchControls
        username={platformUsername}
        platform={platform}
        calibrationLevel={profile?.preferred_calibration_override ?? batch.calibration_level_used}
        isGuest={false}
      />
    </div>
  )
}
