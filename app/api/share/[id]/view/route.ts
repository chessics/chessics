import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sharePositionsEnabled } from '@/lib/flags'
import { clientIp } from '@/lib/ratelimit'
import { trackShareOnce } from '@/lib/analytics/track'
import { isShareSlug } from '@/lib/share/slug'
import { loadPublicShare } from '@/lib/share/read'
import { NO_STORE_HEADERS } from '@/lib/training/position-payload'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!sharePositionsEnabled('live') || !isShareSlug(params.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE_HEADERS })
  }
  let found = false
  try {
    found = (await loadPublicShare(createServiceClient() as never, params.id)).kind === 'found'
  } catch {
  }
  if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE_HEADERS })
  trackShareOnce('share_viewed', params.id, clientIp(request.headers))
  return new NextResponse(null, { status: 204, headers: NO_STORE_HEADERS })
}
