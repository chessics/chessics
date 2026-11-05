import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sharePositionsEnabled } from '@/lib/flags'
import { checkLimits, RATE_LIMITS, tooManyRequests, userKey } from '@/lib/ratelimit'
import { track } from '@/lib/analytics/track'
import { createShare } from '@/lib/share/create'
import { sharePath } from '@/lib/share/slug'
import { SESSION_UUID } from '@/lib/training/next-step'
import { NO_STORE_HEADERS } from '@/lib/training/position-payload'
import type { ShareCreated } from '@/lib/share/api-types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE_HEADERS })

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!sharePositionsEnabled('live')) return notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE_HEADERS })

  const limited = await checkLimits([{ rule: RATE_LIMITS.shareCreate, key: userKey(user.id) }])
  if (!limited.allowed) return tooManyRequests(limited, NO_STORE_HEADERS)

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: NO_STORE_HEADERS })
  }
  const positionId = (raw as { position_id?: unknown } | null)?.position_id
  if (typeof positionId !== 'string' || !SESSION_UUID.test(positionId)) {
    return NextResponse.json({ error: 'position_id must be a UUID' }, { status: 400, headers: NO_STORE_HEADERS })
  }

  const result = await createShare(supabase as never, user.id, positionId.toLowerCase())
  switch (result.kind) {
    case 'created':
      track('share_created', { userId: user.id })
      return NextResponse.json({ slug: result.slug, path: sharePath(result.slug) } satisfies ShareCreated, {
        status: 201,
        headers: NO_STORE_HEADERS,
      })
    case 'existing':
      return NextResponse.json({ slug: result.slug, path: sharePath(result.slug) } satisfies ShareCreated, {
        headers: NO_STORE_HEADERS,
      })
    case 'revoked':
      return NextResponse.json({ error: 'share_revoked' }, { status: 409, headers: NO_STORE_HEADERS })
    case 'answer_first':
      return NextResponse.json({ error: 'answer_first' }, { status: 409, headers: NO_STORE_HEADERS })
    case 'not_shareable':
      return NextResponse.json({ error: 'not_shareable' }, { status: 422, headers: NO_STORE_HEADERS })
    case 'not_found':
      return notFound()
    case 'error':
      console.error(`[share] create failed at ${result.step}`)
      return NextResponse.json({ error: 'share_failed' }, { status: 500, headers: NO_STORE_HEADERS })
  }
}
