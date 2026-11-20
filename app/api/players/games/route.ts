import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { playerLookupEnabled } from '@/lib/flags'
import { checkLimits, RATE_LIMITS, tooManyRequests, userKey } from '@/lib/ratelimit'
import { fetchChessComWindow, type FetchWindow } from '@/lib/sync/chess-com'
import { fetchLichessWindow } from '@/lib/sync/lichess'
import {
  LOOKUP_BUDGET_MS,
  LOOKUP_DAYS,
  LOOKUP_MAX_GAMES,
  parseLookupQuery,
  toLookedUpGame,
} from '@/lib/games/player-lookup'

export const maxDuration = 20

const DAY_MS = 86_400_000

export async function GET(req: Request): Promise<NextResponse> {
  if (!playerLookupEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const query = parseLookupQuery(new URL(req.url).searchParams)
  if (typeof query === 'string') return NextResponse.json({ error: query }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const limit = await checkLimits([{ rule: RATE_LIMITS.playerLookup, key: userKey(user.id) }])
  if (!limit.allowed) return tooManyRequests(limit)

  const now = Date.now()
  const window: FetchWindow = {
    after: now - LOOKUP_DAYS * DAY_MS,
    before: null,
    order: 'desc',
    max: LOOKUP_MAX_GAMES,
    deadline: now + LOOKUP_BUDGET_MS,
    filter: 'live',
  }

  try {
    const { games, complete } =
      query.platform === 'chess_com'
        ? await fetchChessComWindow(query.username, window)
        : await fetchLichessWindow(query.username, window)
    if (games.length === 0 && !complete) {
      return NextResponse.json({ error: 'site_unreachable' }, { status: 502 })
    }
    return NextResponse.json(
      {
        platform: query.platform,
        username: query.username,
        games: games.map(toLookedUpGame),
        complete,
      },
      { headers: { 'Cache-Control': 'private, max-age=60' } }
    )
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 404) return NextResponse.json({ error: 'player_not_found' }, { status: 404 })
    if (status === 429) return NextResponse.json({ error: 'site_busy' }, { status: 503 })
    console.error(`[player-lookup] ${query.platform}:`, err)
    return NextResponse.json({ error: 'site_unreachable' }, { status: 502 })
  }
}
