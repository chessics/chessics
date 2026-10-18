import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
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

  const userId = session.user.id

  const { data: game } = await supabase
    .from('games')
    .select('id, is_analyzed')
    .eq('id', gameId)
    .eq('user_id', userId)
    .single()

  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }

  if (game.is_analyzed) {
    return NextResponse.json({ error: 'Game already analyzed' }, { status: 409 })
  }

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
