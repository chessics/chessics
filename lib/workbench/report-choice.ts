export interface ReportRow {
  id: string
  generated_at: string
  game_count: number | null
  overall_accuracy: number | null
}

export const isMultiGame = (r: Pick<ReportRow, 'game_count'>) => (r.game_count ?? 0) > 1

export function headlineReport<T extends ReportRow>(newestFirst: readonly T[]): T | null {
  return newestFirst.find(isMultiGame) ?? newestFirst[0] ?? null
}

export function earlierReports<T extends ReportRow>(newestFirst: readonly T[], headlineId: string | null): T[] {
  return newestFirst.filter((r) => isMultiGame(r) && r.id !== headlineId)
}

export function trendReports<T extends ReportRow>(newestFirst: readonly T[]): T[] {
  const multi = newestFirst.filter(isMultiGame)
  return [...(multi.length > 0 ? multi : newestFirst)].reverse()
}
