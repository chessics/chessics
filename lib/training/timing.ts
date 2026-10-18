export const TIME_CAP_MS = 90_000

export const TIMER_IS_NEVER_DISPLAYED = true

export function isUnderFloor(timeToCommitMs: number, timeFloorMs: number): boolean {
  return timeToCommitMs < timeFloorMs
}
