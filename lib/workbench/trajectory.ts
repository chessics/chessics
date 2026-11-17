import type { Trajectory, UserPattern } from '@/lib/supabase/types'

export const MIN_SNAPSHOTS_FOR_TREND = 2

export function trajectoriesWithHistory(
  rows: ReadonlyArray<Pick<UserPattern, 'pattern_type' | 'trajectory' | 'batch_history'>>
): Record<string, Trajectory> {
  const out: Record<string, Trajectory> = {}
  for (const row of rows) {
    const snapshots = Array.isArray(row.batch_history) ? row.batch_history.length : 0
    if (snapshots >= MIN_SNAPSHOTS_FOR_TREND) out[row.pattern_type] = row.trajectory
  }
  return out
}
