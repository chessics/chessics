import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { allRows } from '@/lib/supabase/row-cap'
import { NO_STORE_HEADERS } from '@/lib/training/position-payload'
import { TRAINING_QUEUE_SOURCE_TABLE } from '@/lib/training/queue'
import { sessionSummary, type SummaryGame } from '@/lib/training/summary'
import { reasonGateEnabled, standaloneBlunderPositionsEnabled } from '@/lib/flags'
import {
  clampStartedAt,
  fromQueueSelectRow,
  nextStepBody,
  preTerminalLookups,
  preTerminalQueries,
  SESSION_UUID,
  withPreTerminalEvals,
  type MoveEvalRow,
  TRAINING_QUEUE_SELECT,
  type QueueSelectRow,
} from '@/lib/training/next-step'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface InteractionRow {
  position_id: string
  session_id: string
  chosen_move: string | null
  correct: boolean | null
  presentation_index: number
  created_at: string
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const url = new URL(request.url)
  const sessionId = url.searchParams.get('session_id') ?? ''
  if (!SESSION_UUID.test(sessionId)) return json({ error: 'session_id must be a UUID' }, 400)
  const startedAt = clampStartedAt(url.searchParams.get('started'), Date.now())

  const [positionsResult, interactionsResult] = await Promise.all([
    allRows<QueueSelectRow>((from, to) =>
      supabase
        .from(TRAINING_QUEUE_SOURCE_TABLE)
        .select(TRAINING_QUEUE_SELECT)
        .order('created_at', { ascending: false })
        .order('root_ply', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
        .returns<QueueSelectRow[]>()
    ),
    allRows<InteractionRow>((from, to) =>
      supabase
        .from('interactions')
        .select('position_id, session_id, chosen_move, correct, presentation_index, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
        .returns<InteractionRow[]>()
    ),
  ])

  if (positionsResult.error || interactionsResult.error) {
    return json({ error: 'Lookup failed' }, 500)
  }

  const selected = (positionsResult.data ?? []).map(fromQueueSelectRow)

  const queries = preTerminalQueries(preTerminalLookups(selected))
  let rows = selected
  if (queries.length > 0) {
    const results = await Promise.all(
      queries.map(q =>
        supabase
          .from('moves')
          .select('game_id, ply_number, eval_before')
          .in('game_id', q.gameIds)
          .in('ply_number', q.plies)
          .returns<MoveEvalRow[]>()
      )
    )
    for (const r of results) {
      if (r.error) console.error('[training/next] pre-terminal eval lookup failed:', r.error.message)
    }
    rows = withPreTerminalEvals(selected, results.flatMap(r => (r.error ? [] : r.data ?? [])))
  }
  const interactions = (interactionsResult.data ?? []).map(i => ({
    position_id: i.position_id,
    session_id: i.session_id,
    chosen_move: i.chosen_move,
    correct: i.correct,
    presentation_index: i.presentation_index,
    at: Date.parse(i.created_at),
  }))

  const body = nextStepBody(rows, interactions, sessionId, startedAt, {
    reasonGate: reasonGateEnabled('live'),
    standaloneBlunders: standaloneBlunderPositionsEnabled(),
  })
  if (!('done' in body) || !interactions.some(i => i.session_id === sessionId)) return json(body)

  const { data: games, error: gamesError } = await allRows<SummaryGame>((from, to) =>
    supabase
      .from('games')
      .select('id, played_at, result')
      .eq('user_id', user.id)
      .order('played_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to)
      .returns<SummaryGame[]>()
  )
  if (gamesError) return json(body)

  return json({ ...body, summary: sessionSummary(rows, interactions, sessionId, games ?? [], Date.now()) })
}
