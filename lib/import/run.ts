import type { FetchWindow, SyncedGame, TimeControlFilter, WindowResult } from '@/lib/sync/chess-com'
import type { LichessSyncedGame } from '@/lib/sync/lichess'

export type ImportGame = SyncedGame | LichessSyncedGame

export const DAY_MS = 86_400_000
export const IMPORT_WINDOW_MS = 90 * DAY_MS
export const OVERLAP_MS = DAY_MS
export const IMPORT_MAX_PER_PLATFORM = 200
export const IMPORT_BUDGET_MS = 20_000

export interface Bounds {
  newest: number
  oldest: number
}

export interface Pass {
  kind: 'first' | 'up' | 'down'
  window: Pick<FetchWindow, 'after' | 'before' | 'order'>
}

export function importPasses(bounds: Bounds | null, now: number, floorReached: boolean): Pass[] {
  const windowStart = now - IMPORT_WINDOW_MS
  if (!bounds) return [{ kind: 'first', window: { after: windowStart, before: null, order: 'desc' } }]
  const passes: Pass[] = [{ kind: 'up', window: { after: bounds.newest - OVERLAP_MS, before: null, order: 'asc' } }]
  if (!floorReached && bounds.oldest > windowStart) {
    passes.push({ kind: 'down', window: { after: windowStart, before: bounds.oldest + OVERLAP_MS, order: 'desc' } })
  }
  return passes
}

export interface ImportDeps {
  fetchWindow: (w: FetchWindow) => Promise<WindowResult<ImportGame>>
  bounds: () => Promise<Bounds | null>
  insert: (games: ImportGame[]) => Promise<number>
  floorReached: () => Promise<boolean>
  markFloorReached: () => Promise<void>
  now: () => number
  deadline: number
  max?: number
  filter?: TimeControlFilter
}

export interface ImportResult {
  inserted: number
  fetched: number
  cut: boolean
}

export async function importPlatform(d: ImportDeps): Promise<ImportResult> {
  const max = d.max ?? IMPORT_MAX_PER_PLATFORM
  const filter = d.filter ?? 'rapid_blitz'
  const bounds = await d.bounds()
  const floor = bounds !== null && (await d.floorReached())
  const result: ImportResult = { inserted: 0, fetched: 0, cut: false }

  for (const pass of importPasses(bounds, d.now(), floor)) {
    const left = max - result.fetched
    if (left <= 0 || d.now() > d.deadline) {
      result.cut = true
      break
    }
    const { games, complete } = await d.fetchWindow({ ...pass.window, max: left, deadline: d.deadline, filter })
    result.fetched += games.length
    result.inserted += await d.insert(games)
    if (!complete) result.cut = true
    if (complete && pass.kind !== 'up') await d.markFloorReached()
  }
  if (bounds && bounds.oldest <= d.now() - IMPORT_WINDOW_MS && !floor) await d.markFloorReached()
  return result
}
