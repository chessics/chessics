import {
  selectNext,
  type QueueCandidate,
  type QueueDecision,
  type ServedPosition,
} from './queue'

export const SESSION_LENGTH = 6
export const SESSION_MAX = 9

const DAY_MS = 24 * 60 * 60 * 1000

export const SPACING_MS = {
  afterMiss: 3 * DAY_MS,
  afterCorrect: [7 * DAY_MS, 14 * DAY_MS] as const,
  retireAfterCorrectStreak: 3,
}

export interface HistoryRow {
  position_id: string
  session_id: string
  correct: boolean | null
  at: number
}

type Schedule =
  | { kind: 'new' }
  | { kind: 'due'; overdueMs: number }
  | { kind: 'waiting'; dueInMs: number }
  | { kind: 'retired' }

function scheduleFor(rows: HistoryRow[], now: number): Schedule {
  if (rows.length === 0) return { kind: 'new' }

  const sorted = [...rows].sort((a, b) => a.at - b.at)
  const last = sorted[sorted.length - 1]

  let streak = 0
  for (let i = sorted.length - 1; i >= 0 && sorted[i].correct === true; i--) streak++

  if (streak >= SPACING_MS.retireAfterCorrectStreak) return { kind: 'retired' }

  const interval =
    streak === 0 ? SPACING_MS.afterMiss : SPACING_MS.afterCorrect[streak - 1]

  const dueAt = last.at + interval
  return dueAt <= now
    ? { kind: 'due', overdueMs: now - dueAt }
    : { kind: 'waiting', dueInMs: dueAt - now }
}

export function nextReturn(rows: HistoryRow[], now: number): { retired: true } | { retired: false; at: number } | null {
  const s = scheduleFor(rows, now)
  if (s.kind === 'new') return null
  if (s.kind === 'retired') return { retired: true }
  return { retired: false, at: s.kind === 'due' ? now - s.overdueMs : now + s.dueInMs }
}

export function orderPoolForSession(
  pool: QueueCandidate[],
  history: HistoryRow[],
  now: number
): QueueCandidate[] {
  const byPosition = new Map<string, HistoryRow[]>()
  for (const h of history) {
    const list = byPosition.get(h.position_id) ?? []
    list.push(h)
    byPosition.set(h.position_id, list)
  }

  const due: { c: QueueCandidate; overdueMs: number }[] = []
  const fresh: QueueCandidate[] = []
  const waiting: { c: QueueCandidate; dueInMs: number }[] = []

  for (const c of pool) {
    const s = scheduleFor(byPosition.get(c.id) ?? [], now)
    if (s.kind === 'due') due.push({ c, overdueMs: s.overdueMs })
    else if (s.kind === 'new') fresh.push(c)
    else if (s.kind === 'waiting') waiting.push({ c, dueInMs: s.dueInMs })
  }

  return [
    ...due.sort((a, b) => b.overdueMs - a.overdueMs).map(x => x.c),
    ...fresh,
    ...waiting.sort((a, b) => a.dueInMs - b.dueInMs).map(x => x.c),
  ]
}

function neutralise(served: ServedPosition[], positionId: string): ServedPosition[] {
  return served.map(s => (s.position_id === positionId ? { ...s, correct: null } : s))
}

function decideOnce(pool: QueueCandidate[], served: ServedPosition[]): {
  decision: QueueDecision
  served: ServedPosition[]
} {
  let effective = served
  let decision = selectNext(pool, effective)
  while (decision.reason === 'delayed_return' && decision.returning_for) {
    effective = neutralise(effective, decision.returning_for)
    decision = selectNext(pool, effective)
  }
  return { decision, served: effective }
}

export type SessionStep =
  | { kind: 'serve'; position: QueueCandidate; decision: QueueDecision }
  | { kind: 'done'; reason: 'complete' | 'exhausted' | 'interleave_blocked' | 'empty' }

export function nextSessionStep(
  pool: QueueCandidate[],
  sessionServed: ServedPosition[]
): SessionStep {
  if (pool.length === 0) return { kind: 'done', reason: 'empty' }

  let effective: ServedPosition[] = []
  for (const s of sessionServed) {
    const { decision, served } = decideOnce(pool, effective)
    effective = served
    if (
      decision.reason === 'delayed_return_substitute' &&
      decision.position?.id === s.position_id &&
      decision.returning_for
    ) {
      effective = neutralise(effective, decision.returning_for)
    }
    effective = [...effective, s]
  }

  if (sessionServed.length >= SESSION_MAX) return { kind: 'done', reason: 'complete' }

  const { decision } = decideOnce(pool, effective)

  if (!decision.position) {
    return {
      kind: 'done',
      reason: decision.reason === 'interleave_blocked' ? 'interleave_blocked' : 'exhausted',
    }
  }

  if (sessionServed.length >= SESSION_LENGTH && decision.reason !== 'delayed_return_substitute') {
    return { kind: 'done', reason: 'complete' }
  }

  return { kind: 'serve', position: decision.position, decision }
}

export interface SessionRowForLoop {
  position_id: string
  correct: boolean | null
  tag: string | null
  root_ply: number
}

export function openLoopSentence(rows: SessionRowForLoop[]): string {
  const lastByPosition = new Map<string, SessionRowForLoop>()
  for (const r of rows) lastByPosition.set(r.position_id, r)
  const finals = rows.filter(r => lastByPosition.get(r.position_id) === r)

  const open =
    [...finals].reverse().find(r => r.correct === false) ??
    [...finals].reverse().find(r => r.correct === null)

  if (!open) return 'Nothing left open from this session.'

  const move = Math.ceil(open.root_ply / 2)
  const what = open.tag ? `the ${tagLabel(open.tag)} from move ${move}` : `move ${move}`
  return `Still open: ${what} of your game. It comes back in three days.`
}

const TAG_LABELS: Record<string, string> = {
  hanging_piece: 'hanging piece',
  weak_back_rank: 'weak back rank',
  missed_tactical_shot: 'missed tactical shot',
  time_pressure_blunder: 'time-pressure blunder',
  failed_endgame_conversion: 'failed endgame conversion',
  premature_piece_exchange: 'premature piece exchange',
  king_safety: 'king safety issue',
  poor_piece_coordination: 'poor piece coordination',
  missed_mating_pattern: 'missed mating pattern',
  pawn_structure_weakness: 'pawn structure weakness',
  opening_preparation_gap: 'opening preparation gap',
  missed_knight_fork: 'missed knight fork',
  bad_bishop_trade: 'bad bishop trade',
  passive_rook_endgame: 'passive rook in the endgame',
}

export function tagLabel(tag: string): string {
  return TAG_LABELS[tag] ?? tag.replace(/_/g, ' ')
}
