import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sharePositionsEnabled } from '@/lib/flags'
import { checkLimits, clientIp, ipKey, RATE_LIMITS, tooManyRequests } from '@/lib/ratelimit'
import { trackShareOnce } from '@/lib/analytics/track'
import { isShareSlug } from '@/lib/share/slug'
import { loadShareAnswerSource } from '@/lib/share/read'
import { answerShare } from '@/lib/share/answer'
import { parseShareCommitBody } from '@/lib/share/commit-body'
import { legalUci } from '@/lib/training/grading'
import { createGradingEngine } from '@/lib/training/grading-engine'
import { NO_STORE_HEADERS } from '@/lib/training/position-payload'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 15

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE_HEADERS })

export async function POST(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!sharePositionsEnabled('live')) return json({ error: 'Not found' }, 404)
  if (!isShareSlug(params.id)) return json({ error: 'Not found' }, 404)

  const limited = await checkLimits([{ rule: RATE_LIMITS.shareCommit, key: ipKey(request.headers) }])
  if (!limited.allowed) return tooManyRequests(limited, NO_STORE_HEADERS)

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const body = parseShareCommitBody(raw)
  if (typeof body === 'string') return json({ error: body }, 400)

  let db
  try {
    db = createServiceClient()
  } catch {
    console.error('[share] no service client for the public commit')
    return json({ error: 'Lookup failed' }, 500)
  }

  const source = await loadShareAnswerSource(db as never, params.id)
  if (source.kind === 'error') return json({ error: 'Lookup failed' }, 500)
  if (source.kind === 'missing') return json({ error: 'Not found' }, 404)

  if (body.chosen_move !== null && legalUci(source.value.fen, body.chosen_move) === null) {
    return json({ error: 'chosen_move is not legal in this position' }, 400)
  }

  const answer = await answerShare(source.value, body.chosen_move, createGradingEngine())
  trackShareOnce('share_answered', params.id, clientIp(request.headers))
  return json(answer)
}
