import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { createClient } from '@/lib/supabase/server'
import { fetchChessComGames } from '@/lib/sync/chess-com'
import { fetchLichessGames } from '@/lib/sync/lichess'
import type { SyncedGame } from '@/lib/sync/chess-com'
import type { LichessSyncedGame } from '@/lib/sync/lichess'
import { checkLimits, ipKey, RATE_LIMITS, SITE_KEY, tooManyRequests, userKey } from '@/lib/ratelimit'
import { batchSizeAllowed, noGamesCode, parseSyncBody, SIGN_UP_FOR_LARGER_BATCHES } from '@/lib/sync/request'

export const maxDuration = 30

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

function estimatedMinutes(gameCount: number): number {
  if (gameCount <= 25) return 4
  if (gameCount <= 50) return 8
  return 15
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = parseSyncBody(raw)
  if (typeof parsed === 'string') {
    return NextResponse.json({ error: parsed }, { status: 400 })
  }
  const { username, platform, batchSize, calibrationLevel, sessionToken, timeControlFilter } = parsed

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? null

  if (!userId && !sessionToken) {
    return NextResponse.json(
      { error: 'sessionToken required for pre-signup analysis' },
      { status: 400 }
    )
  }

  if (!batchSizeAllowed(batchSize, userId !== null)) {
    return NextResponse.json({ error: SIGN_UP_FOR_LARGER_BATCHES }, { status: 403 })
  }

  const perCaller = await checkLimits([
    userId
      ? { rule: RATE_LIMITS.userAnalysis, key: userKey(userId) }
      : { rule: RATE_LIMITS.guestAnalysis, key: ipKey(req.headers) },
  ])
  if (!perCaller.allowed) return tooManyRequests(perCaller)

  type AnyGame = SyncedGame | LichessSyncedGame

  let games: AnyGame[]

  try {
    if (platform === 'chess_com') {
      games = await fetchChessComGames(username, batchSize, timeControlFilter)
    } else if (platform === 'lichess') {
      games = await fetchLichessGames(username, batchSize, timeControlFilter)
    } else {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
    }
  } catch (err: unknown) {
    const apiErr = err as Error & { status?: number; code?: string }
    if (apiErr.code === 'no_recent_rapid_blitz_games') {
      return NextResponse.json({ error: apiErr.code }, { status: 422 })
    }
    if (apiErr.status === 404) {
      return NextResponse.json({ error: 'Username not found' }, { status: 404 })
    }
    if (apiErr.status === 429) {
      return NextResponse.json(
        { error: 'Rate limited, try again shortly' },
        { status: 429 }
      )
    }
    console.error('[sync] fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch games' }, { status: 500 })
  }

  if (games.length === 0) {
    return NextResponse.json({ error: noGamesCode(timeControlFilter) }, { status: 422 })
  }

  const siteWide = await checkLimits([{ rule: RATE_LIMITS.allAnalyses, key: SITE_KEY }])
  if (!siteWide.allowed) return tooManyRequests(siteWide)

  const gameCount = games.length
  const jobId = crypto.randomUUID()

  const ratings = games
    .map((g) => g.user_rating_at_time)
    .filter((r): r is number => typeof r === 'number' && r > 0)
  const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null
  const autoCalibration =
    avgRating === null ? 2 : avgRating < 800 ? 0 : avgRating < 1200 ? 1 : avgRating < 1500 ? 2 : avgRating < 1800 ? 3 : 4
  const effectiveCalibration = calibrationLevel ?? autoCalibration

  let finalCalibration = effectiveCalibration
  if (userId && calibrationLevel === undefined) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('preferred_calibration_override')
      .eq('id', userId)
      .maybeSingle()
    if (prof?.preferred_calibration_override !== null && prof?.preferred_calibration_override !== undefined) {
      finalCalibration = prof.preferred_calibration_override
    }
  }

  if (userId) {
    const gameInserts = games.map((g) => ({
      user_id: userId,
      pgn: g.pgn,
      platform: g.platform,
      platform_game_id: g.platform_game_id,
      played_at: g.played_at,
      time_control: g.time_control,
      opening_name: g.opening_name,
      opening_eco: g.opening_eco,
      user_color: g.user_color,
      opponent_username: g.opponent_username,
      result: g.result,
      user_rating_at_time: g.user_rating_at_time,
      opponent_rating_at_time: g.opponent_rating_at_time,
      is_analyzed: false,
    }))

    const { error: insertError } = await supabase
      .from('games')
      .upsert(gameInserts, {
        onConflict: 'platform,platform_game_id,user_id',
        ignoreDuplicates: false,
      })

    if (insertError) {
      console.error('[sync] game insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save games' }, { status: 500 })
    }
  } else {
    try {
      await redis.set(
        `guest:${sessionToken}:games`,
        JSON.stringify(games),
        { ex: 7 * 24 * 3600 }
      )
    } catch (err) {
      console.error('[sync] redis guest save error:', err)
      return NextResponse.json({ error: 'Failed to store guest games' }, { status: 500 })
    }
  }

  try {
    await redis.lpush(
      'analysis:queue',
      JSON.stringify({
        jobId,
        username,
        platform,
        batchSize,
        calibrationLevel: finalCalibration,
        userId: userId ?? null,
        sessionToken: sessionToken ?? null,
        gameCount,
        queuedAt: new Date().toISOString(),
      })
    )

    await redis.set(
      `job:${jobId}`,
      JSON.stringify({
        status: 'queued',
        progress: 0,
        gameCount,
        stage: 1,
        stageDetail: null,
      }),
      { ex: 3600 }
    )
  } catch (err) {
    console.error('[sync] redis error:', err)
    return NextResponse.json({ error: 'Failed to queue analysis job' }, { status: 500 })
  }

  return NextResponse.json({
    jobId,
    gameCount,
    authed: !!userId,
    estimatedMinutes: estimatedMinutes(gameCount),
  })
}
