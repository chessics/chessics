import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchChessComWindow, type FetchWindow, type TimeControlFilter, type WindowResult } from '@/lib/sync/chess-com'
import { fetchLichessWindow } from '@/lib/sync/lichess'
import { OWNER_SAMPLE, ownerName } from '@/lib/sync/owner'
import { importPlatform, type Bounds, type ImportGame, type ImportResult } from './run'

export type Platform = 'chess_com' | 'lichess'
export const PLATFORMS: readonly Platform[] = ['chess_com', 'lichess']

export interface ImportRedis {
  get(key: string): Promise<unknown>
  set(key: string, value: string, opts?: { ex?: number; nx?: boolean }): Promise<unknown>
  del(key: string): Promise<unknown>
}

export const floorKey = (userId: string, platform: Platform) => `import:floor:${userId}:${platform}`
const FLOOR_TTL_S = 100 * 86_400

export const IMPORT_EVERY_S = 3600
export const recentKey = (userId: string) => `import:recent:${userId}`

export const INSERT_CHUNK = 100

export class ImportWriteError extends Error {}

export function fetchWindowFor(platform: Platform, username: string) {
  return (w: FetchWindow): Promise<WindowResult<ImportGame>> =>
    platform === 'chess_com' ? fetchChessComWindow(username, w) : fetchLichessWindow(username, w)
}

export async function accountOwners(supabase: SupabaseClient, userId: string): Promise<Partial<Record<Platform, string>>> {
  const owners: Partial<Record<Platform, string>> = {}
  for (const platform of PLATFORMS) {
    const { data, error } = await supabase
      .from('games')
      .select('pgn, platform, user_color')
      .eq('user_id', userId)
      .eq('platform', platform)
      .order('created_at', { ascending: true })
      .limit(OWNER_SAMPLE)
    if (error) throw new ImportWriteError(`read owner: ${error.message}`)
    const name = ownerName(Array.isArray(data) ? data : [], platform)
    if (name) owners[platform] = name
  }
  return owners
}

export async function platformBounds(supabase: SupabaseClient, userId: string, platform: Platform): Promise<Bounds | null> {
  const edge = async (ascending: boolean): Promise<number | null> => {
    const { data, error } = await supabase
      .from('games')
      .select('played_at')
      .eq('user_id', userId)
      .eq('platform', platform)
      .not('played_at', 'is', null)
      .order('played_at', { ascending })
      .limit(1)
    if (error) throw new ImportWriteError(`read bounds: ${error.message}`)
    const at = Date.parse((data as Array<{ played_at: string }> | null)?.[0]?.played_at ?? '')
    return Number.isFinite(at) ? at : null
  }
  const newest = await edge(false)
  const oldest = await edge(true)
  return newest === null || oldest === null ? null : { newest, oldest }
}

export function gameRow(userId: string, g: ImportGame) {
  return {
    user_id: userId,
    pgn: g.pgn,
    platform: g.platform,
    platform_game_id: g.platform_game_id,
    played_at: g.played_at,
    time_control: g.time_control,
    opening_name: g.opening_name,
    opening_eco: g.opening_eco,
    user_color: g.user_color,
    opponent_username: g.opponent_username,
    result: g.result,
    user_rating_at_time: g.user_rating_at_time,
    opponent_rating_at_time: g.opponent_rating_at_time,
    is_analyzed: false,
  }
}

export async function insertNewGames(supabase: SupabaseClient, userId: string, games: ImportGame[]): Promise<number> {
  let inserted = 0
  for (let i = 0; i < games.length; i += INSERT_CHUNK) {
    const { data, error } = await supabase
      .from('games')
      .upsert(games.slice(i, i + INSERT_CHUNK).map((g) => gameRow(userId, g)), {
        onConflict: 'platform,platform_game_id,user_id',
        ignoreDuplicates: true,
      })
      .select('id')
    if (error) throw new ImportWriteError(`insert games: ${error.message}`)
    inserted += Array.isArray(data) ? data.length : 0
  }
  return inserted
}

export interface AccountImportArgs {
  supabase: SupabaseClient
  redis: ImportRedis
  userId: string
  platform: Platform
  username: string
  deadline: number
  now?: () => number
  fetchWindow?: (w: FetchWindow) => Promise<WindowResult<ImportGame>>
}

export async function importAccountPlatform(a: AccountImportArgs): Promise<ImportResult> {
  const key = floorKey(a.userId, a.platform)
  return importPlatform({
    fetchWindow: a.fetchWindow ?? fetchWindowFor(a.platform, a.username),
    bounds: () => platformBounds(a.supabase, a.userId, a.platform),
    insert: (games) => insertNewGames(a.supabase, a.userId, games),
    floorReached: async () => {
      try {
        return (await a.redis.get(key)) !== null
      } catch {
        return false
      }
    },
    markFloorReached: async () => {
      try {
        await a.redis.set(key, '1', { ex: FLOOR_TTL_S })
      } catch (err) {
        console.error('[import] floor marker not written:', err)
      }
    },
    now: a.now ?? Date.now,
    deadline: a.deadline,
  })
}

export async function fetchOlder(
  a: AccountImportArgs & { needed: number; filter: TimeControlFilter }
): Promise<{ inserted: number; complete: boolean }> {
  const bounds = await platformBounds(a.supabase, a.userId, a.platform)
  const { games, complete } = await (a.fetchWindow ?? fetchWindowFor(a.platform, a.username))({
    after: null,
    before: bounds ? bounds.oldest : null,
    order: 'desc',
    max: a.needed,
    deadline: a.deadline,
    filter: a.filter,
  })
  return { inserted: await insertNewGames(a.supabase, a.userId, games), complete }
}

export async function nextBatchGames(
  supabase: SupabaseClient,
  userId: string,
  batchSize: number
): Promise<Array<{ id: string; user_rating_at_time: number | null }>> {
  const { data, error } = await supabase
    .from('games')
    .select('id, user_rating_at_time')
    .eq('user_id', userId)
    .eq('is_analyzed', false)
    .order('played_at', { ascending: false })
    .limit(batchSize)
  if (error) throw new ImportWriteError(`read unanalysed: ${error.message}`)
  return (data ?? []) as Array<{ id: string; user_rating_at_time: number | null }>
}
