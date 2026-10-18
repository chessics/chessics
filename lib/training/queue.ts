export const TRAINING_QUEUE_SOURCE_TABLE = 'training_positions' as const

export const DELAYED_RETURN_MIN_GAP = 3

export interface QueueCandidate {
  id: string
  game_id: string
  tag: string | null
  eval_cp: number | null
  best_move: string | null
  refutation_line: string[]
  refutation_evals: number[]
  span_plies: number
  multipv_gap_cp?: number | null
}

export interface ServedPosition {
  position_id: string
  tag: string | null
  game_id: string
  correct: boolean | null
}

export type RejectionReason = 'no_best_move' | 'no_refutation' | 'no_sign_flip' | 'no_root_loss'

export interface Rejection {
  position: QueueCandidate
  reason: RejectionReason
}

export interface FilterResult {
  accepted: QueueCandidate[]
  rejected: Rejection[]
}

function hasSignFlip(c: QueueCandidate): boolean {
  if (c.eval_cp === null) return false
  if (c.refutation_evals.length === 0) return false

  const after = c.refutation_evals[c.refutation_evals.length - 1]
  return c.eval_cp > 0 && after < 0
}

function rootLostEval(c: QueueCandidate): boolean {
  if (c.eval_cp === null || c.refutation_evals.length === 0) return false
  return c.refutation_evals[0] < c.eval_cp
}

function hasClearBestMove(c: QueueCandidate): boolean {
  if (c.multipv_gap_cp === null || c.multipv_gap_cp === undefined) {
    return true
  }
  return true
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isNonTrivial(_c: QueueCandidate): boolean {
  return true
}

function illustratesTaggedWeakness(c: QueueCandidate): boolean {
  if (c.tag === null) return true

  return true
}

export function qualityFilter(candidates: QueueCandidate[]): FilterResult {
  const accepted: QueueCandidate[] = []
  const rejected: Rejection[] = []

  for (const c of candidates) {
    if (!c.best_move) {
      rejected.push({ position: c, reason: 'no_best_move' })
      continue
    }
    if (c.refutation_line.length === 0) {
      rejected.push({ position: c, reason: 'no_refutation' })
      continue
    }
    if (!hasSignFlip(c)) {
      rejected.push({ position: c, reason: 'no_sign_flip' })
      continue
    }
    if (!rootLostEval(c)) {
      rejected.push({ position: c, reason: 'no_root_loss' })
      continue
    }

    if (!hasClearBestMove(c) || !isNonTrivial(c) || !illustratesTaggedWeakness(c)) {
      continue
    }

    accepted.push(c)
  }

  return { accepted, rejected }
}

export type SelectionReason =
  | 'next'
  | 'delayed_return'
  | 'delayed_return_substitute'
  | 'interleave_blocked'
  | 'exhausted'

export interface QueueDecision {
  position: QueueCandidate | null
  reason: SelectionReason
  returning_for?: string
}

function violatesInterleave(candidate: QueueCandidate, previousTag: string | null | undefined): boolean {
  if (previousTag === undefined || previousTag === null) return false
  return candidate.tag === previousTag
}

function dueForReturn(served: ServedPosition[]): { position_id: string; missedAt: number }[] {
  const lastServe = new Map<string, { index: number; correct: boolean | null }>()

  served.forEach((s, index) => {
    lastServe.set(s.position_id, { index, correct: s.correct })
  })

  const due: { position_id: string; missedAt: number }[] = []
  for (const [position_id, { index, correct }] of Array.from(lastServe.entries())) {
    if (correct !== false) continue
    if (served.length - index < DELAYED_RETURN_MIN_GAP) continue
    due.push({ position_id, missedAt: index })
  }

  return due.sort((a, b) => a.missedAt - b.missedAt)
}

export function selectNext(pool: QueueCandidate[], served: ServedPosition[]): QueueDecision {
  const byId = new Map(pool.map(c => [c.id, c]))
  const servedIds = new Set(served.map(s => s.position_id))
  const previousTag = served.length > 0 ? served[served.length - 1].tag : undefined

  for (const { position_id } of dueForReturn(served)) {
    const original = byId.get(position_id)
    if (!original) continue

    const substitute = pool.find(
      c =>
        !servedIds.has(c.id) &&
        c.game_id !== original.game_id &&
        c.tag !== null &&
        c.tag === original.tag &&
        !violatesInterleave(c, previousTag)
    )

    if (substitute) {
      return {
        position: substitute,
        reason: 'delayed_return_substitute',
        returning_for: original.id,
      }
    }

    if (!violatesInterleave(original, previousTag)) {
      return { position: original, reason: 'delayed_return', returning_for: original.id }
    }
  }

  const unserved = pool.filter(c => !servedIds.has(c.id))

  if (unserved.length === 0) {
    return { position: null, reason: 'exhausted' }
  }

  const previousGame = served.length > 0 ? served[served.length - 1].game_id : undefined
  const allowed = unserved.filter(c => !violatesInterleave(c, previousTag))
  const next = allowed.find(c => c.game_id !== previousGame) ?? allowed[0]

  if (!next) {
    return { position: null, reason: 'interleave_blocked' }
  }

  return { position: next, reason: 'next' }
}

export function buildQueue(pool: QueueCandidate[], maxLength: number): QueueCandidate[] {
  const out: QueueCandidate[] = []
  const served: ServedPosition[] = []

  while (out.length < maxLength) {
    const decision = selectNext(pool, served)
    if (!decision.position) break

    out.push(decision.position)
    served.push({
      position_id: decision.position.id,
      tag: decision.position.tag,
      game_id: decision.position.game_id,
      correct: true,
    })
  }

  return out
}
