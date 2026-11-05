import { buildPlayContext, PLAY_GAME_SELECT, type ContextError, type PlayContext, type PlayGameRow } from './context'
import { PLAY_UUID } from './move'

export type LoadResult =
  | { ok: true; context: PlayContext; row: PlayGameRow }
  | { ok: false; status: 404 | 400 | 500; error: 'not_found' | 'lookup_failed' | ContextError }

interface GamesReader {
  from(table: 'games'): {
    select(cols: string): {
      eq(col: string, v: string): {
        eq(col: string, v: string): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> }
      }
    }
  }
}

export async function loadOwnGame(client: unknown, userId: string, gameId: string, ply: number): Promise<LoadResult> {
  const db = client as GamesReader
  if (!PLAY_UUID.test(gameId)) return { ok: false, status: 404, error: 'not_found' }
  const { data, error } = await db.from('games').select(PLAY_GAME_SELECT).eq('id', gameId).eq('user_id', userId).maybeSingle()
  if (error) return { ok: false, status: 500, error: 'lookup_failed' }
  if (!data) return { ok: false, status: 404, error: 'not_found' }
  const row = data as PlayGameRow
  const built = buildPlayContext(row, ply)
  if (!built.ok) return { ok: false, status: 400, error: built.error }
  return { ok: true, context: built.context, row }
}
