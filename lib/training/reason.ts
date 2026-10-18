export const GOALS = ['wins_material', 'stops_threat', 'makes_threat', 'improves_worst_piece'] as const
export type Goal = (typeof GOALS)[number]

export function isGoal(v: unknown): v is Goal {
  return typeof v === 'string' && (GOALS as readonly string[]).includes(v)
}

export const GOAL_LABEL: Record<Goal, string> = {
  wins_material: 'Wins material',
  stops_threat: 'Stops a threat',
  makes_threat: 'Makes a threat',
  improves_worst_piece: 'Improves my worst piece',
}

export const REASON_EVERY = 4
export function asksForReason(presentationIndex: number): boolean {
  return presentationIndex % REASON_EVERY === 1
}

function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function chipOrder(positionId: string): Goal[] {
  const order = [...GOALS]
  const rand = seeded(hash(positionId))
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

export const DIAGNOSES = ['clean', 'execution_gap', 'misread', 'incoherent', 'right_move_wrong_reason'] as const
export type ReasonDiagnosis = (typeof DIAGNOSES)[number]

export type CheckStatus = 'served' | 'not_served' | 'not_evaluable' | 'unavailable'

export function bestServes(status: CheckStatus): boolean | null {
  if (status === 'unavailable') return null
  return status !== 'not_served'
}

export function chosenServes(status: CheckStatus): boolean | null {
  if (status === 'served') return true
  if (status === 'not_served') return false
  return null
}

export function diagnose(a: boolean | null, b: boolean | null, c: boolean | null): ReasonDiagnosis | null {
  if (a === null || b === null || c === null) return null
  if (a && b && c) return 'clean'
  if (a && b && !c) return 'execution_gap'
  if (!a && b && !c) return 'misread'
  if (a && !b && !c) return 'incoherent'
  if (!a && !b && c) return 'right_move_wrong_reason'
  return null
}

export interface GoalCheck {
  goal: Goal
  move: string
  status: CheckStatus
  note?: string
  detail?: Record<string, number>
}

export interface CheckEval {
  cp: number
  depth: number
  pv?: string[]
}

export interface ReasonChecks {
  engine: string
  depth: number | null
  evals: Record<string, CheckEval>
  best: GoalCheck
  chosen: GoalCheck
  best_goals: Partial<Record<Goal, CheckStatus>>
  pieces: { best: string; chosen: string }
  threat: { move: string; eval_after_cp: number } | null
}

export interface ReasonResult {
  declared_goal: Goal | null
  best_serves_goal: boolean | null
  chosen_serves_goal: boolean | null
  diagnosis: ReasonDiagnosis | null
  checks: ReasonChecks | null
}

const NEED: Record<Goal, string> = {
  wins_material: 'winning material',
  stops_threat: 'stopping a threat',
  makes_threat: 'making a threat',
  improves_worst_piece: 'a more active piece',
}

function does(goal: Goal, piece: string): string {
  switch (goal) {
    case 'wins_material':
      return 'wins material'
    case 'stops_threat':
      return 'stops a threat'
    case 'makes_threat':
      return 'makes a threat'
    case 'improves_worst_piece':
      return `gives the ${piece} more squares`
  }
}

function doesNot(goal: Goal, piece: string): string {
  switch (goal) {
    case 'wins_material':
      return "doesn't win material"
    case 'stops_threat':
      return "doesn't stop a threat"
    case 'makes_threat':
      return "doesn't make a threat"
    case 'improves_worst_piece':
      return `doesn't give the ${piece} more squares`
  }
}

export function namedGoal(checks: ReasonChecks, except?: Goal): Goal | null {
  return GOALS.find(g => g !== except && checks.best_goals[g] === 'served') ?? null
}

export interface ReasonWords {
  declared: string | null
  lines: string[]
}

export function reasonWords(
  r: ReasonResult,
  chosenSan: string | null,
  bestSan: string | null,
  sameMove: boolean
): ReasonWords {
  if (r.declared_goal === null) return { declared: null, lines: [] }
  const goal = r.declared_goal
  const declared = `Your reason: ${GOAL_LABEL[goal].charAt(0).toLowerCase()}${GOAL_LABEL[goal].slice(1)}.`
  if (chosenSan === null) {
    return { declared, lines: ["No move was committed, so the reason wasn't checked."] }
  }
  const c = r.checks
  if (!c) return { declared, lines: ["The reason couldn't be checked on this position."] }

  const best = bestSan ?? 'the best move'
  const mine = chosenSan
  const aShown = c.best.status === 'served'
  const bestPiece = c.pieces.best
  const myPiece = c.pieces.chosen

  switch (r.diagnosis) {
    case 'clean':
      return {
        declared,
        lines: aShown
          ? ['Right move, right reason.']
          : ['Right move.', "Your reason couldn't be tested on this board, so it counts."],
      }
    case 'execution_gap':
      return {
        declared,
        lines: [
          aShown ? `You saw what the position needed: ${NEED[goal]}.` : `${mine} ${does(goal, myPiece)}.`,
          aShown
            ? `${mine} does that too, but the engine rates ${best} higher.`
            : `But the engine rates ${best} higher.`,
        ],
      }
    case 'incoherent':
      return {
        declared,
        lines: aShown
          ? [`You saw what the position needed: ${NEED[goal]}.`, `${mine} ${doesNot(goal, myPiece)}; ${best} does.`]
          : [`${mine} ${doesNot(goal, myPiece)}.`],
      }
    case 'misread': {
      const other = namedGoal(c, goal)
      return {
        declared,
        lines: [
          `${mine} does ${doesWhat(goal, myPiece)}, but the position needed something else.`,
          other ? `${best} ${does(other, bestPiece)}.` : `The best move was ${best}.`,
        ],
      }
    }
    case 'right_move_wrong_reason': {
      const other = sameMove ? namedGoal(c, goal) : null
      const lines = [`Right move, but not for that reason: ${mine} ${doesNot(goal, myPiece)}.`]
      if (other) lines.push(`It ${does(other, bestPiece)}.`)
      return { declared, lines }
    }
    default:
      return { declared, lines: [undiagnosed(c, mine, best, sameMove)] }
  }
}

function doesWhat(goal: Goal, piece: string): string {
  switch (goal) {
    case 'wins_material':
      return 'win material'
    case 'stops_threat':
      return 'stop a threat'
    case 'makes_threat':
      return 'make a threat'
    case 'improves_worst_piece':
      return `give the ${piece} more squares`
  }
}

function undiagnosed(c: ReasonChecks, mine: string, best: string, sameMove: boolean): string {
  const goal = c.chosen.goal
  const b = c.chosen.status
  const a = c.best.status
  if (a === 'unavailable' || b === 'unavailable') return "The engine couldn't check your reason just now, so it isn't marked."
  if (b === 'not_evaluable' && !sameMove) return `Whether ${mine} ${does(goal, c.pieces.chosen)} couldn't be tested on this board.`
  if (b === 'served') return `${mine} ${does(goal, c.pieces.chosen)}.`
  if (b === 'not_served' && a === 'not_served') return `${mine} ${doesNot(goal, c.pieces.chosen)}, and neither does ${best}.`
  if (b === 'not_served') return `${mine} ${doesNot(goal, c.pieces.chosen)}.`
  return "Your reason couldn't be tested on this board."
}

export const REASON_SELECT = 'declared_goal, goal_before_move, best_serves_goal, chosen_serves_goal, reason_diagnosis, reason_checks'

export interface StoredReason {
  declared_goal: string | null
  goal_before_move: boolean | null
  best_serves_goal: boolean | null
  chosen_serves_goal: boolean | null
  reason_diagnosis: string | null
  reason_checks: ReasonChecks | null
}

export function reasonColumns(r: ReasonResult) {
  return {
    declared_goal: r.declared_goal,
    goal_before_move: true,
    best_serves_goal: r.best_serves_goal,
    chosen_serves_goal: r.chosen_serves_goal,
    reason_diagnosis: r.diagnosis,
    reason_checks: r.checks,
  }
}

export function reasonFromRow(row: StoredReason): ReasonResult | null {
  if (row.goal_before_move !== true) return null
  return {
    declared_goal: isGoal(row.declared_goal) ? row.declared_goal : null,
    best_serves_goal: row.best_serves_goal,
    chosen_serves_goal: row.chosen_serves_goal,
    diagnosis: (DIAGNOSES as readonly string[]).includes(row.reason_diagnosis ?? '') ? (row.reason_diagnosis as ReasonDiagnosis) : null,
    checks: row.reason_checks,
  }
}
