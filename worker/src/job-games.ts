import type { SupabaseClient } from '@supabase/supabase-js'

export const IDLE_POLL_MS = 20_000

export interface JobGameSelection {
  gameId?: string | null
  batchSize: number
}

export interface JobGame {
  id: string
  user_id: string
  pgn: string
  user_color: 'white' | 'black'
  result: 'win' | 'loss' | 'draw'
  opening_name: string | null
  time_control: string | null
}

export async function selectGamesForJob(
  supabase: SupabaseClient,
  userId: string,
  job: JobGameSelection
): Promise<JobGame[]> {
  let query = supabase
    .from('games')
    .select('id, user_id, pgn, user_color, result, opening_name, time_control')
    .eq('user_id', userId)
    .eq('is_analyzed', false)

  query = job.gameId
    ? query.eq('id', job.gameId)
    : query.order('played_at', { ascending: false }).limit(job.batchSize)

  const { data, error } = await query
  if (error) throw new Error(`Could not read games to analyse: ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error(job.gameId ? `Game ${job.gameId} not found or already analysed` : 'No unanalysed games found')
  }
  return data as JobGame[]
}

export interface GameFailure {
  gameId: string
  message: string
}

export function assertSomeGamesAnalysed(attempted: number, failures: GameFailure[]): void {
  if (attempted > 0 && failures.length >= attempted) {
    throw new Error(
      `No game in this job could be analysed (${failures.length} of ${attempted} failed). First error: ${failures[0]?.message ?? 'unknown'}`
    )
  }
}

export async function analyseEach<G, R>(
  items: G[],
  idOf: (item: G) => string,
  analyse: (item: G) => Promise<R>,
  beforeEach: (done: number, total: number) => Promise<void>
): Promise<{ analysed: { item: G; result: R }[]; failures: GameFailure[] }> {
  const analysed: { item: G; result: R }[] = []
  const failures: GameFailure[] = []
  for (let i = 0; i < items.length; i++) {
    await beforeEach(i, items.length)
    try {
      analysed.push({ item: items[i], result: await analyse(items[i]) })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`Failed to analyse game ${idOf(items[i])}:`, message)
      failures.push({ gameId: idOf(items[i]), message })
    }
  }
  assertSomeGamesAnalysed(items.length, failures)
  return { analysed, failures }
}
