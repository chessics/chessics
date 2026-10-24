import { NextResponse, type NextRequest } from 'next/server'
import { gamesWithTag, type RecurrenceRow } from '@/lib/training/recurrence'
import { allRows } from '@/lib/supabase/row-cap'
import { Chess } from 'chess.js'
import { createClient } from '@/lib/supabase/server'
import { NO_STORE_HEADERS } from '@/lib/training/position-payload'
import { isUnderFloor } from '@/lib/training/timing'
import { gradeCommit, gradingColumns, gradingFromRow, legalUci, type Grading, type StoredGrading } from '@/lib/training/grading'
import { createGradingEngine, gradingEngineUrl } from '@/lib/training/grading-engine'
import { reasonGateEnabled } from '@/lib/flags'
import { checkLimits, RATE_LIMITS, tooManyRequests, userKey } from '@/lib/ratelimit'
import { SESSION_UUID } from '@/lib/training/next-step'
import { checkReason, GOAL_BUDGET_MS } from '@/lib/training/goals'
import {
  asksForReason,
  isGoal,
  reasonColumns,
  reasonFromRow,
  REASON_SELECT,
  type Goal,
  type ReasonResult,
  type StoredReason,
} from '@/lib/training/reason'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 15

interface DrawnMove {
  from: string
  to: string
}

interface CommitBody {
  session_id: string
  chosen_move: string | null
  drawn_moves: DrawnMove[]
  time_to_commit_ms: number
  declared_goal: Goal | null
}

type ExistingInteraction = StoredGrading & {
  id: string
  presentation_index: number
  prior_exposures: number
  under_floor: boolean
} & Partial<StoredReason>

const MAX_DRAWN_MOVES = 64

const SQUARE = /^[a-h][1-8]$/
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/

function parseBody(raw: unknown, reasonGate: boolean): CommitBody | string {
  if (typeof raw !== 'object' || raw === null) return 'body must be an object'
  const b = raw as Record<string, unknown>

  if (typeof b.session_id !== 'string' || b.session_id.length === 0) {
    return 'session_id is required'
  }
  if (!SESSION_UUID.test(b.session_id)) return 'session_id must be a UUID'

  if (b.chosen_move !== null && typeof b.chosen_move !== 'string') {
    return 'chosen_move must be a UCI string or null'
  }
  if (typeof b.chosen_move === 'string' && !UCI.test(b.chosen_move)) {
    return 'chosen_move must be UCI, e.g. g1f3 or e7e8q'
  }

  if (!Array.isArray(b.drawn_moves)) return 'drawn_moves must be an array'
  if (b.drawn_moves.length > MAX_DRAWN_MOVES) return `drawn_moves holds at most ${MAX_DRAWN_MOVES} arrows`
  for (const m of b.drawn_moves) {
    if (
      typeof m !== 'object' ||
      m === null ||
      !SQUARE.test((m as DrawnMove).from) ||
      !SQUARE.test((m as DrawnMove).to)
    ) {
      return 'drawn_moves entries must be { from, to } squares'
    }
  }

  if (
    typeof b.time_to_commit_ms !== 'number' ||
    !Number.isFinite(b.time_to_commit_ms) ||
    b.time_to_commit_ms < 0
  ) {
    return 'time_to_commit_ms must be a non-negative number'
  }

  if (reasonGate && b.declared_goal !== undefined && b.declared_goal !== null && !isGoal(b.declared_goal)) {
    return 'declared_goal must be one of the four reasons'
  }

  return {
    session_id: b.session_id,
    chosen_move: b.chosen_move as string | null,
    drawn_moves: b.drawn_moves as DrawnMove[],
    time_to_commit_ms: b.time_to_commit_ms,
    declared_goal: reasonGate && isGoal(b.declared_goal) ? b.declared_goal : null,
  }
}

function sanToUci(fen: string, san: string): string | null {
  try {
    const chess = new Chess(fen)
    const move = chess.move(san)
    return move ? `${move.from}${move.to}${move.promotion ?? ''}` : null
  } catch {
    return null
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    )
  }

  const limited = await checkLimits([{ rule: RATE_LIMITS.commit, key: userKey(user.id) }])
  if (!limited.allowed) return tooManyRequests(limited, NO_STORE_HEADERS)

  if (!SESSION_UUID.test(params.id)) {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404, headers: NO_STORE_HEADERS }
    )
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400, headers: NO_STORE_HEADERS }
    )
  }

  const reasonGate = reasonGateEnabled('live')
  const body = parseBody(raw, reasonGate)
  if (typeof body === 'string') {
    return NextResponse.json(
      { error: body },
      { status: 400, headers: NO_STORE_HEADERS }
    )
  }

  const { data: position, error: positionError } = await supabase
    .from('training_positions')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (positionError) {
    return NextResponse.json(
      { error: 'Lookup failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
  if (!position) {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404, headers: NO_STORE_HEADERS }
    )
  }

  const chosenMove = body.chosen_move === null ? null : legalUci(position.fen, body.chosen_move.toLowerCase())
  if (body.chosen_move !== null && chosenMove === null) {
    return NextResponse.json(
      { error: 'chosen_move is not legal in this position' },
      { status: 400, headers: NO_STORE_HEADERS }
    )
  }

  const gameMoveUci = sanToUci(position.fen, position.root_move_san)

  const existingColumns =
    'id, presentation_index, prior_exposures, under_floor, correct, chosen_move, chosen_eval_cp, best_eval_cp, grading_engine, grading_depth'
  const { data: existing, error: existingError } = (await supabase
    .from('interactions')
    .select(reasonGate ? `${existingColumns}, ${REASON_SELECT}` : existingColumns)
    .eq('session_id', body.session_id)
    .eq('position_id', params.id)
    .maybeSingle()) as { data: ExistingInteraction | null; error: { message: string } | null }

  if (existingError) {
    return NextResponse.json(
      { error: 'Lookup failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }

  const underFloor = existing ? existing.under_floor : isUnderFloor(body.time_to_commit_ms, position.time_floor_ms)

  let presentationIndex: number
  let priorExposures: number

  if (existing) {
    presentationIndex = existing.presentation_index
    priorExposures = existing.prior_exposures
  } else {
    const [{ count: sessionCount }, { count: exposureCount }] = await Promise.all([
      supabase
        .from('interactions')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', body.session_id),
      supabase
        .from('interactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('position_id', params.id),
    ])

    presentationIndex = sessionCount ?? 0
    priorExposures = exposureCount ?? 0
  }

  const asks = reasonGate && !existing && asksForReason(presentationIndex)
  if (asks && chosenMove !== null && body.declared_goal === null) {
    return NextResponse.json(
      { error: 'declared_goal is required on this position' },
      { status: 400, headers: NO_STORE_HEADERS }
    )
  }

  const grading: Grading = existing
    ? gradingFromRow(existing, position, gameMoveUci)
    : await gradeCommit(
        { fen: position.fen, chosenMove, bestMove: position.best_move, gameMoveUci },
        createGradingEngine()
      )
  const correct = grading.correct

  let reason: ReasonResult | null = null
  if (reasonGate && existing) reason = reasonFromRow(existing as StoredReason)
  else if (asks) {
    reason = await checkReason(
      { fen: position.fen, bestMove: position.best_move, chosenMove, declaredGoal: body.declared_goal, correct },
      createGradingEngine(gradingEngineUrl(), fetch, Date.now, GOAL_BUDGET_MS)
    )
  }

  if (!existing) {
    const { error: insertError } = await supabase.from('interactions').insert({
      user_id: user.id,
      session_id: body.session_id,
      position_id: params.id,
      game_id: position.game_id,
      fen: position.fen,
      side_to_move: position.side_to_move,
      drawn_moves: body.drawn_moves,
      chosen_move: chosenMove,
      time_to_commit_ms: body.time_to_commit_ms,
      under_floor: underFloor,
      presentation_index: presentationIndex,
      prior_exposures: priorExposures,
      correct,
      ...gradingColumns(grading),
      ...(asks && reason ? reasonColumns(reason) : {}),
    })

    if (insertError) {
      return NextResponse.json(
        { error: 'Could not record commit' },
        { status: 500, headers: NO_STORE_HEADERS }
      )
    }
  }

  const recurrence =
    position.tag && position.span_plies !== 0 ? await buildRecurrence(supabase, user.id, position.tag, priorExposures) : null

  return NextResponse.json(
    {
      position_id: params.id,
      correct,
      under_floor: underFloor,

      best_move: position.best_move,
      best_move_san: position.best_move_san,
      pv: position.pv,
      eval_cp: position.eval_cp,
      tag: position.tag,

      refutation_line: position.refutation_line,
      refutation_evals: position.refutation_evals,

      root_move_san: position.root_move_san,
      root_move_uci: gameMoveUci,

      grading: {
        method: grading.method,
        chosen_eval_cp: grading.chosen_eval_cp,
        best_eval_cp: grading.best_eval_cp,
        engine: grading.engine,
        depth: grading.depth,
      },

      recurrence,

      ...(reasonGate ? { reason } : {}),

      receipt: {
        engine: position.engine,
        depth: position.depth,
        eval_cp: position.eval_cp,
        tag: position.tag,
        span_plies: position.span_plies,
      },
    },
    { headers: NO_STORE_HEADERS }
  )
}

const RECURRENCE_SELECT = 'game_id, tag, span_plies, refutation_evals'

async function buildRecurrence(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  tag: string,
  priorExposures: number
) {
  const [positions, analysed] = await Promise.all([
    allRows<RecurrenceRow>((from, to) =>
      supabase.from('training_positions').select(RECURRENCE_SELECT).order('id', { ascending: true }).range(from, to)
    ),
    allRows<{ id: string }>((from, to) =>
      supabase.from('games').select('id').eq('user_id', userId).eq('is_analyzed', true).order('id', { ascending: true }).range(from, to)
    ),
  ])

  const rows = (positions.data ?? []) as RecurrenceRow[]
  const withTag = gamesWithTag(rows, tag)

  const analysedGames = new Set<string>([
    ...((analysed.data ?? []) as { id: string }[]).map(g => g.id),
    ...rows.map(r => r.game_id),
  ])

  return {
    tag,
    exposure_ordinal: priorExposures + 1,
    games_with_tag: withTag,
    games_analysed: analysedGames.size,
  }
}
