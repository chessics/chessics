export const STABLE_CP = -50

export function blunderStandsAlone(evalBeforeBlunderUserCp: number): boolean {
  return evalBeforeBlunderUserCp >= STABLE_CP
}

export function preTerminalEvalFromRow(spanPlies: number, refutationEvals: readonly number[]): number | null {
  if (!Number.isInteger(spanPlies) || spanPlies < 2) return null
  const i = spanPlies - 2
  return i < refutationEvals.length ? refutationEvals[i] : null
}

export function toUserEval(whitePerspectiveCp: number, userColor: 'white' | 'black'): number {
  return userColor === 'white' ? whitePerspectiveCp : -whitePerspectiveCp
}
