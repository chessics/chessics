import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

interface JobStatus {
  status: 'queued' | 'processing' | 'complete' | 'failed'
  progress: number
  gameCount: number
  stage: 1 | 2 | 3 | 4
  stageDetail: string | null
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)
  const jobId = searchParams.get('jobId')

  if (!jobId) {
    return NextResponse.json({ error: 'jobId query param is required' }, { status: 400 })
  }

  let raw: unknown
  try {
    raw = await redis.get(`job:${jobId}`)
  } catch (err) {
    console.error('[sync/status] redis error:', err)
    return NextResponse.json({ error: 'Failed to read job status' }, { status: 500 })
  }

  if (raw === null || raw === undefined) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const jobData: JobStatus =
    typeof raw === 'string' ? (JSON.parse(raw) as JobStatus) : (raw as JobStatus)

  return NextResponse.json({
    status: jobData.status,
    progress: jobData.progress ?? 0,
    gameCount: jobData.gameCount ?? 0,
    stage: jobData.stage ?? 1,
    stageDetail: jobData.stageDetail ?? null,
  })
}
