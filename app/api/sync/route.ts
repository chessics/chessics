import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { createClient } from '@/lib/supabase/server'
import { fetchChessComGames } from '@/lib/sync/chess-com'
import { fetchLichessGames } from '@/lib/sync/lichess'
import type { SyncedGame } from '@/lib/sync/chess-com'
import type { LichessSyncedGame } from '@/lib/sync/lichess'
import { checkLimits, ipKey, RATE_LIMITS, SITE_KEY, tooManyRequests, userKey } from '@/lib/ratelimit'
import { ALL_GAMES_ANALYSED, batchSizeAllowed, noGamesCode, parseSyncBody, SIGN_UP_FOR_LARGER_BATCHES } from '@/lib/sync/request'
import { accountMayHold, NOT_YOUR_USERNAME, OWNER_SAMPLE } from '@/lib/sync/owner'
import { batchFromLibrary, type LibraryBatch } from '@/lib/import/analyse'
import { IMPORT_BUDGET_MS } from '@/lib/import/run'
import type { SupabaseClient } from '@supabase/supabase-js'

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

function fetchErrorResponse(apiErr: Error & { status?: number; code?: string }): NextResponse {
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
  console.error('[sync] fetch error:', apiErr)
  return NextResponse.json({ error: 'Failed to fetch games' }, { status: 500 })
}

async function libraryHasGames(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase.from('games').select('id').eq('user_id', userId).limit(1)
  return Array.isArray(data) && data.length > 0
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now()
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

  let accountUserId = userId
  if (userId) {
    const { data: earliest, error: ownerError } = await supabase
      .from('games')
      .select('pgn, platform, user_color')
      .eq('user_id', userId)
      .eq('platform', platform)
      .order('created_at', { ascending: true })
      .limit(OWNER_SAMPLE)
    if (ownerError) {
      console.error('[sync] owner read error:', ownerError)
      return NextResponse.json({ error: 'Failed to read account' }, { status: 500 })
    }
    if (!accountMayHold(Array.isArray(earliest) ? earliest : [], platform, username)) {
      if (!sessionToken) return NextResponse.json({ error: NOT_YOUR_USERNAME }, { status: 403 })
      accountUserId = null
    }
  }

  type AnyGame = SyncedGame | LichessSyncedGame

  let ratingsOf: Array<number | null>
  let gameCount: number
  let guestGames: AnyGame[] | null = null
  if (accountUserId) {
    let batch: LibraryBatch
    try {
      batch = await batchFromLibrary({
        supabase,
        redis,
        userId: accountUserId,
        platform,
        username,
        batchSize,
        filter: timeControlFilter,
        deadline: startedAt + IMPORT_BUDGET_MS,
      })
    } catch (err) {
      console.error('[sync] library import error:', err)
      return NextResponse.json({ error: 'Failed to save games' }, { status: 500 })
    }
    if (batch.games.length === 0) {
      if (batch.fetchError) return fetchErrorResponse(batch.fetchError)
      if (batch.cut) return NextResponse.json({ error: 'no_recent_rapid_blitz_games' }, { status: 422 })
      if (await libraryHasGames(supabase, accountUserId)) {
        return NextResponse.json({ error: ALL_GAMES_ANALYSED }, { status: 422 })
      }
      return NextResponse.json({ error: noGamesCode(timeControlFilter) }, { status: 422 })
    }
    ratingsOf = batch.games.map((g) => g.user_rating_at_time)
    gameCount = batch.games.length
  } else {
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
      return fetchErrorResponse(err as Error & { status?: number; code?: string })
    }

    if (games.length === 0) {
      return NextResponse.json({ error: noGamesCode(timeControlFilter) }, { status: 422 })
    }

    guestGames = games
    ratingsOf = games.map((g) => g.user_rating_at_time)
    gameCount = games.length
  }

  const siteWide = await checkLimits([{ rule: RATE_LIMITS.allAnalyses, key: SITE_KEY }])
  if (!siteWide.allowed) return tooManyRequests(siteWide)

  const jobId = crypto.randomUUID()

  const ratings = ratingsOf
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

  if (guestGames) {
    try {
      await redis.set(
        `guest:${sessionToken}:games`,
        JSON.stringify(guestGames),
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
        userId: accountUserId ?? null,
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
    authed: !!accountUserId,
    ...(userId && !accountUserId ? { foreign: true } : {}),
    estimatedMinutes: estimatedMinutes(gameCount),
  })
}
