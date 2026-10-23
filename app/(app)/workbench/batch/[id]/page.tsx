import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RecurrenceStrip from '@/components/workbench/RecurrenceStrip'
import BatchControls from '@/components/workbench/BatchControls'
import Diagnosis from '@/components/diagnosis/Diagnosis'
import SittingLine from '@/components/diagnosis/SittingLine'
import { PROSE_MEASURE, REPORT_COLUMN, VERDICT_FONT_SIZE } from '@/components/report/column'
import { accountInstances, pliesNeeded, type AccountRows } from '@/lib/diagnosis/account'
import { buildFindings, selectFindings } from '@/lib/diagnosis/finding'
import { userNameFromGames } from '@/lib/sync/user-from-games'
import { ANALYZE_MORE_ID, MORE_GAMES_HINT, verdictFor, withoutEmDash } from '@/lib/diagnosis/verdict'
import { HISTORY_LOOKBACK_MS, fatigueLine, type BlunderMove, type HistoryGame } from '@/lib/diagnosis/sittings'
import type { BatchPatternGroup, BatchReport, Game, GameAnalysis, Profile } from '@/lib/supabase/types'

export const metadata: Metadata = { title: 'Batch report' }

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
  const headline = groups.find((g) => g.recurring) ?? null
  const stripGroup = selectFindings(groups).ordered[0] ?? null

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

  const analysisRows = ((analysesResult.data as GameAnalysis[] | null) ?? []).map((a) => ({ id: a.id, game_id: a.game_id }))
  const [positionsResult, chainsResult] = await Promise.all([
    gameIds.length > 0
      ? supabase.from('training_positions').select('game_id, root_ply, tag').in('game_id', gameIds)
      : Promise.resolve({ data: [] }),
    analysisRows.length > 0
      ? supabase
          .from('causal_chains')
          .select('game_analysis_id, root_move_ply, terminal_blunder_ply')
          .in('game_analysis_id', analysisRows.map((a) => a.id))
      : Promise.resolve({ data: [] }),
  ])
  const diagnosisRows: Omit<AccountRows, 'moves'> = {
    groups,
    games: orderedGames.flatMap((g) =>
      g.user_color
        ? [{ id: g.id, played_at: g.played_at, opponent_username: g.opponent_username, result: g.result, user_color: g.user_color }]
        : []
    ),
    analyses: analysisRows,
    chains: (chainsResult.data ?? []) as AccountRows['chains'],
    positions: (positionsResult.data ?? []) as AccountRows['positions'],
  }
  const plies = pliesNeeded(diagnosisRows)
  const { data: diagnosisMoves } =
    gameIds.length > 0 && plies.length > 0
      ? await supabase
          .from('moves')
          .select('game_id, ply_number, san, fen_before, eval_before, eval_after')
          .in('game_id', gameIds)
          .in('ply_number', plies)
      : { data: [] }
  const findings = buildFindings(
    groups,
    accountInstances({ ...diagnosisRows, moves: (diagnosisMoves ?? []) as AccountRows['moves'] }),
    batch.game_count
  )

  const batchTimes = orderedGames.flatMap((g) => (g.played_at ? [Date.parse(g.played_at)] : [])).filter((t) => !Number.isNaN(t))
  const historyCols = 'id, platform, played_at, time_control'
  const windowStart = batchTimes.length > 0 ? new Date(Math.min(...batchTimes) - HISTORY_LOOKBACK_MS).toISOString() : null
  const windowEnd = batchTimes.length > 0 ? new Date(Math.max(...batchTimes)).toISOString() : null
  const [windowResult, beforeResult, blundersResult] = await Promise.all([
    windowStart && windowEnd
      ? supabase.from('games').select(historyCols).eq('user_id', userId).gte('played_at', windowStart).lte('played_at', windowEnd).order('played_at').limit(5000)
      : Promise.resolve({ data: [], error: null }),
    windowStart
      ? supabase.from('games').select(historyCols).eq('user_id', userId).lt('played_at', windowStart).order('played_at', { ascending: false }).limit(1)
      : Promise.resolve({ data: [], error: null }),
    gameIds.length > 0
      ? supabase.from('moves').select('game_id, ply_number, eval_before, eval_after').in('game_id', gameIds).eq('classification', 'blunder')
      : Promise.resolve({ data: [], error: null }),
  ])
  type HistoryRow = { id: string; platform: string | null; played_at: string | null; time_control: string | null }
  const fatigue =
    windowResult.error || beforeResult.error || blundersResult.error
      ? null
      : fatigueLine(
          [...((beforeResult.data ?? []) as HistoryRow[]), ...((windowResult.data ?? []) as HistoryRow[])].map(
            (g): HistoryGame => ({ id: g.id, platform: g.platform, playedAt: g.played_at, timeControl: g.time_control })
          ),
          orderedGames.map((g) => ({
            id: g.id,
            playedAt: g.played_at,
            opponent: g.opponent_username,
            result: g.result,
            userColor: g.user_color,
            analysed: g.is_analyzed,
          })),
          ((blundersResult.data ?? []) as { game_id: string; ply_number: number; eval_before: number | null; eval_after: number | null }[]).map(
            (m): BlunderMove => ({ gameId: m.game_id, ply: m.ply_number, evalBefore: m.eval_before, evalAfter: m.eval_after })
          )
        )

  const affected = new Set(stripGroup?.gameIds ?? [])
  const bars = gameIds.map((id) => (affected.has(id) ? ('affected' as const) : ('quiet' as const)))

  const syncedRating =
    orderedGames
      .filter((g) => g.user_rating_at_time !== null)
      .sort((a, b) => (b.played_at ?? '').localeCompare(a.played_at ?? ''))[0]
      ?.user_rating_at_time ?? profile?.current_rating ?? null

  const fromGames = userNameFromGames(orderedGames)
  const platform: 'chess.com' | 'lichess' | null = profile?.chess_com_username
    ? 'chess.com'
    : profile?.lichess_username
      ? 'lichess'
      : (fromGames?.platform ?? null)
  const platformUsername = profile?.chess_com_username ?? profile?.lichess_username ?? fromGames?.username ?? null

  const storedVerdict = headline?.insight ?? batch.claude_narrative?.split(/(?<=[.!?])\s+/)[0] ?? null
  const verdict = verdictFor(storedVerdict, headline !== null)

  return (
    <div className={`flex flex-col gap-10 ${REPORT_COLUMN}`}>
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
            style={{ fontSize: VERDICT_FONT_SIZE, lineHeight: 1.25, color: 'var(--text)', fontWeight: 500 }}
          >
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
        {batch.claude_narrative && storedVerdict && batch.claude_narrative !== storedVerdict && (
          <p className="text-base" style={{ color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: PROSE_MEASURE }}>
            {withoutEmDash(batch.claude_narrative.slice(storedVerdict.length).trim())}
          </p>
        )}
      </div>

      <Diagnosis findings={findings} reviewLinks />

      <SittingLine line={fatigue} reviewLinks />

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

      <Link
        href="/train"
        className="text-sm px-5 py-2.5 w-fit font-medium transition-opacity hover:opacity-80"
        style={{ color: 'var(--bg)', background: 'var(--brass)' }}
      >
        Train these positions
      </Link>

      <BatchControls
        username={platformUsername}
        platform={platform}
        calibrationLevel={profile?.preferred_calibration_override ?? batch.calibration_level_used}
        isGuest={false}
      />
    </div>
  )
}
