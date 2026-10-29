import type { TimeControlFilter } from '@/lib/sync/chess-com'
import { fetchOlder, importAccountPlatform, ImportWriteError, nextBatchGames, type AccountImportArgs } from './account'

export interface LibraryBatch {
  games: Array<{ id: string; user_rating_at_time: number | null }>
  cut: boolean
  fetchError: (Error & { status?: number; code?: string }) | null
}

export async function batchFromLibrary(
  a: AccountImportArgs & { batchSize: number; filter: TimeControlFilter }
): Promise<LibraryBatch> {
  let cut = false
  let fetchError: LibraryBatch['fetchError'] = null
  const fetchFailed = (err: unknown) => {
    if (err instanceof ImportWriteError) throw err
    fetchError ??= err as LibraryBatch['fetchError']
  }

  try {
    cut = (await importAccountPlatform(a)).cut
  } catch (err) {
    fetchFailed(err)
  }

  let games = await nextBatchGames(a.supabase, a.userId, a.batchSize)
  if (games.length < a.batchSize && !fetchError) {
    try {
      const older = await fetchOlder({ ...a, needed: a.batchSize - games.length, filter: a.filter })
      if (!older.complete) cut = true
      if (older.inserted > 0) games = await nextBatchGames(a.supabase, a.userId, a.batchSize)
    } catch (err) {
      fetchFailed(err)
    }
  }
  return { games, cut, fetchError }
}
