import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { jobIsLost } from '@/lib/sync/job-status'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)
  const sessionToken = searchParams.get('sessionToken')
  const jobId = searchParams.get('jobId')

  if (!sessionToken) {
    return NextResponse.json({ error: 'sessionToken is required' }, { status: 400 })
  }

  const resultExists = await redis.exists(`guest:${sessionToken}:result`)
  if (resultExists) {
    return NextResponse.json({ status: 'ready' })
  }

  if (jobId) {
    const raw = await redis.get(`job:${jobId}`)
    if (raw) {
      const job = typeof raw === 'string' ? JSON.parse(raw) : raw as { status: string; updatedAt?: string }
      if (jobIsLost(job, Date.now())) {
        return NextResponse.json({ status: 'lost' })
      }
      if (job.status === 'complete') {
        return NextResponse.json({ status: 'ready' })
      }
      if (job.status === 'queued' || job.status === 'processing') {
        return NextResponse.json({ status: 'processing' })
      }
      if (job.status === 'failed') {
        return NextResponse.json({ status: 'failed' })
      }
    }
  }

  return NextResponse.json({ status: 'not_found' })
}
