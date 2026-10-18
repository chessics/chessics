import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import type { GuestSessionResult } from '@/types/guest'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sessionToken = new URL(req.url).searchParams.get('sessionToken')
  if (!sessionToken) {
    return NextResponse.json({ error: 'sessionToken is required' }, { status: 400 })
  }

  const raw = await redis.get(`guest:${sessionToken}:result`)
  if (!raw) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const result: GuestSessionResult =
    typeof raw === 'string' ? JSON.parse(raw) : (raw as GuestSessionResult)

  return NextResponse.json(withoutTrainingPositions(result))
}

function withoutTrainingPositions(result: GuestSessionResult) {
  return {
    ...result,
    games: result.games.map(g => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose
      const { training_positions, ...analysis } = g.analysis_data
      return { ...g, analysis_data: analysis }
    }),
  }
}
