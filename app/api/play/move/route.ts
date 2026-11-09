import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkLimits, RATE_LIMITS, tooManyRequests, userKey } from '@/lib/ratelimit'
import { NO_STORE_HEADERS } from '@/lib/training/position-payload'
import { maiaFromEnv } from '@/lib/play/engine'
import { track } from '@/lib/analytics/track'
import { loadOwnGame } from '@/lib/play/load'
import { engineReply, parseMoveBody } from '@/lib/play/move'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE_HEADERS })

  const limited = await checkLimits([{ rule: RATE_LIMITS.playMove, key: userKey(user.id) }])
  if (!limited.allowed) return tooManyRequests(limited, NO_STORE_HEADERS)

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: NO_STORE_HEADERS })
  }
  const body = parseMoveBody(raw)
  if (typeof body === 'string') return NextResponse.json({ error: body }, { status: 400, headers: NO_STORE_HEADERS })

  const game = await loadOwnGame(supabase, user.id, body.game_id, body.start_ply)
  if (!game.ok) return NextResponse.json({ error: game.error }, { status: game.status, headers: NO_STORE_HEADERS })

  const { client, engine } = maiaFromEnv()
  const answer = await engineReply(game.context, body, client, engine, Math.random)
  if (answer.status === 200 && body.moves.length <= 1) track('play_started', { userId: user.id })
  return NextResponse.json(answer.body, { status: answer.status, headers: NO_STORE_HEADERS })
}
