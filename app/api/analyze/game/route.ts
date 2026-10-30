import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkLimits, RATE_LIMITS, SITE_KEY, tooManyRequests, userKey } from '@/lib/ratelimit'
import { pgnAnalysable, pgnParses } from '@/lib/sync/standard'
import { RUNNING_JOB_WINDOW_MS } from '@/lib/games/analyze-job'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { gameId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const gameId = body.gameId
  if (!gameId || typeof gameId !== 'string') {
    return NextResponse.json({ error: 'gameId required' }, { status: 400 })
  }
  if (!UUID.test(gameId)) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }

  const userId = user.id

  const perUser = await checkLimits([{ rule: RATE_LIMITS.gameAnalysis, key: userKey(userId) }])
  if (!perUser.allowed) return tooManyRequests(perUser)

  const { data: game } = await supabase
    .from('games')
    .select('id, is_analyzed, pgn')
    .eq('id', gameId)
    .eq('user_id', userId)
    .single()

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }

  if (game.is_analyzed) {
    return NextResponse.json({ error: 'Game already analyzed' }, { status: 409 })
  }

  if (!pgnAnalysable(game.pgn) || !pgnParses(game.pgn)) {
    return NextResponse.json({ error: 'not_standard_chess' }, { status: 422 })
  }

  const { data: running } = await supabase
    .from('analysis_jobs')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .eq('status', 'queued')
    .gte('queued_at', new Date(Date.now() - RUNNING_JOB_WINDOW_MS).toISOString())
    .order('queued_at', { ascending: false })
    .limit(1)
  const runningId = Array.isArray(running) ? (running[0] as { id?: unknown } | undefined)?.id : undefined
  if (typeof runningId === 'string') return NextResponse.json({ jobId: runningId, alreadyRunning: true })

  const siteWide = await checkLimits([{ rule: RATE_LIMITS.allAnalyses, key: SITE_KEY }])
  if (!siteWide.allowed) return tooManyRequests(siteWide)

  const { data: job, error: jobError } = await supabase
    .from('analysis_jobs')
    .insert({
      user_id: userId,
      game_id: gameId,
      status: 'queued',
    })
    .select('id')
    .single()

  if (jobError || !job) {
    return NextResponse.json(
      { error: 'Failed to create job' },
      { status: 500 }
    )
  }

  try {
    const { Redis } = await import('@upstash/redis')
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })

    const { data: profile } = await supabase
      .from('profiles')
      .select('calibration_level')
      .eq('id', userId)
      .single()

    await redis.lpush(
      'analysis:queue',
      JSON.stringify({
        jobId: job.id,
        gameId,
        userId,
        calibrationLevel: profile?.calibration_level ?? 2,
        batchSize: 1,
        gameCount: 1,
        queuedAt: new Date().toISOString(),
      })
    )

    await redis.set(
      `job:${job.id}`,
      JSON.stringify({ status: 'queued', progress: 0, gameCount: 1, stage: 1, stageDetail: null }),
      { ex: 3600 }
    )
  } catch (err) {
    console.error('[analyze/game] could not queue job:', err)
    await supabase
      .from('analysis_jobs')
      .update({
        status: 'failed',
        error_message: 'Could not reach the analysis queue',
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)
    return NextResponse.json(
      { error: 'Could not queue the analysis. Try again in a minute.' },
      { status: 503 }
    )
  }

  return NextResponse.json({ jobId: job.id })
}
