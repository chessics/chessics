export const FINISH_REDIRECT_MS = 800

export type FinishPlan = { kind: 'go'; href: string; afterMs: number } | { kind: 'wait'; href: string }

export function reportHref(authed: boolean): string {
  return authed ? '/workbench' : '/report'
}

export function finishPlan(authed: boolean, touchedPuzzle: boolean): FinishPlan {
  const href = reportHref(authed)
  return touchedPuzzle ? { kind: 'wait', href } : { kind: 'go', href, afterMs: FINISH_REDIRECT_MS }
}
