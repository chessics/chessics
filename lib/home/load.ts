import type { SupabaseClient } from '@supabase/supabase-js'
import { allRows, MAX_IDS_PER_REQUEST } from '@/lib/supabase/row-cap'
import { onAccount } from '@/lib/accounts/rules'
import { userNameFromGames } from '@/lib/sync/user-from-games'
import {
  clockInLosses,
  habitCost,
  habitCostLine,
  openingsRecord,
  opponentsRecord,
  ratingChanges,
  ratingSeries,
  recentSummary,
  windowStart,
  type HomeGame,
  type OpeningRow,
  type OpponentsRecord,
  type RatingSeries,
  type RecentMove,
  type RecentSummary,
} from './summary'

export { HOME_SEEN_COOKIE } from './cookie'
export const RECENT_GAMES = 5
const CLOCK_PGN_READS = 40

export interface HomeHabit {
  label: string
  tag: string
  batchId: string
  games: number
  lost: string[] | null
  rest: string | null
}

export interface RecentCard {
  id: string
  at: string | null
  result: HomeGame['result']
  opponent: string | null
  timeControl: string | null
  change: number | null
  isNew: boolean
  summary: RecentSummary
}

export interface HomeData {
  name: string | null
  series: RatingSeries[]
  habit: HomeHabit | null
  gameDays: Array<{ at: string; marked: boolean }>
  trainingDays: string[] | null
  recent: RecentCard[]
  openings: OpeningRow[]
  opponents: OpponentsRecord
  clock: Array<{ id: string; low: boolean }> | null
}

export interface HeadlineGroup {
  tag: string
  label: string
  gameIds: string[]
}

const GAME_COLUMNS =
  'id, platform, played_at, time_control, opening_name, user_color, opponent_username, result, user_rating_at_time, opponent_rating_at_time, is_analyzed'

export async function loadHome(args: {
  supabase: SupabaseClient
  userId: string
  accountId: string | null | undefined
  accountName: string | null
  headline: HeadlineGroup | null
  batchId: string | null
  lastSeen: number | null
  now: number
}): Promise<HomeData | null> {
  const { supabase, userId, accountId, headline, batchId, now } = args
  const from = windowStart(now)

  const gamesRead = await allRows<HomeGame>((a, b) =>
    onAccount(supabase.from('games').select(GAME_COLUMNS).eq('user_id', userId), accountId)
      .order('played_at', { ascending: false })
      .order('id', { ascending: true })
      .range(a, b)
  )
  if (gamesRead.error) {
    console.error('[home] games:', gamesRead.error.message)
    return null
  }
  const games = gamesRead.data
  const habitIds = new Set(headline?.gameIds ?? [])
  const changes = ratingChanges(games)
  const inWindow = games.filter((g) => g.played_at && Date.parse(g.played_at) >= from)

  const recentGames = games.filter((g) => g.played_at).slice(0, RECENT_GAMES)
  const losses = inWindow.filter((g) => g.result === 'loss' && g.user_color).slice(0, CLOCK_PGN_READS)

  const [movesByGame, lossPgns, training, nameRow] = await Promise.all([
    Promise.all(
      recentGames.map(async (g) => {
        if (!g.is_analyzed) return [g.id, [] as RecentMove[]] as const
        const { data, error } = await supabase
          .from('moves')
          .select('ply_number, eval_before, eval_after, classification')
          .eq('game_id', g.id)
          .order('ply_number', { ascending: true })
        if (error) return [g.id, null] as const
        const moves = (data ?? []).map((m: { ply_number: number; eval_before: number | null; eval_after: number | null; classification: string | null }) => ({
          ply: m.ply_number,
          eval_before: m.eval_before === null ? null : Number(m.eval_before),
          eval_after: m.eval_after === null ? null : Number(m.eval_after),
          classification: m.classification,
        }))
        return [g.id, moves] as const
      })
    ),
    readPgns(supabase, losses.map((g) => g.id)),
    allRows<{ created_at: string; id: string }>((a, b) =>
      supabase
        .from('interactions')
        .select('id, created_at')
        .eq('user_id', userId)
        .gte('created_at', new Date(from).toISOString())
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(a, b)
    ),
    args.accountName || recentGames.length === 0
      ? Promise.resolve(null)
      : supabase.from('games').select('pgn, platform, user_color').eq('id', recentGames[0].id).maybeSingle(),
  ])

  const moves = new Map(movesByGame)
  const recent: RecentCard[] = recentGames.flatMap((g) => {
    const m = moves.get(g.id)
    if (m === null) return []
    return [
      {
        id: g.id,
        at: g.played_at,
        result: g.result,
        opponent: g.opponent_username,
        timeControl: g.time_control,
        change: changes.get(g.id) ?? null,
        isNew: args.lastSeen !== null && !!g.played_at && Date.parse(g.played_at) > args.lastSeen,
        summary: recentSummary(g, m ?? [], habitIds.has(g.id)),
      },
    ]
  })

  let habit: HomeHabit | null = null
  if (headline && batchId) {
    const line = habitCostLine(habitCost(games, habitIds, changes))
    habit = {
      label: headline.label,
      tag: headline.tag,
      batchId,
      games: games.filter((g) => habitIds.has(g.id)).length,
      lost: line ? line.lost : null,
      rest: line ? line.rest : null,
    }
  }

  let clock: HomeData['clock'] = null
  if (lossPgns) {
    clock = clockInLosses(
      losses.flatMap((g) => {
        const pgn = lossPgns.get(g.id)
        return pgn && g.user_color && g.played_at ? [{ id: g.id, at: g.played_at, pgn, user_color: g.user_color }] : []
      })
    )
  }

  const named =
    nameRow && 'data' in nameRow && nameRow.data
      ? userNameFromGames([nameRow.data as { pgn: string; platform: string; user_color: 'white' | 'black' | null }])?.username ?? null
      : null

  return {
    name: args.accountName ?? named,
    series: ratingSeries(games, habitIds, from),
    habit,
    gameDays: inWindow.map((g) => ({ at: g.played_at as string, marked: habitIds.has(g.id) })),
    trainingDays: training.error ? null : training.data.map((r) => r.created_at),
    recent,
    openings: openingsRecord(games, from),
    opponents: opponentsRecord(games, from),
    clock,
  }
}

async function readPgns(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string> | null> {
  const out = new Map<string, string>()
  for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
    const { data, error } = await supabase.from('games').select('id, pgn').in('id', ids.slice(i, i + MAX_IDS_PER_REQUEST))
    if (error) return null
    for (const r of (data ?? []) as Array<{ id: string; pgn: string }>) out.set(r.id, r.pgn)
  }
  return out
}
