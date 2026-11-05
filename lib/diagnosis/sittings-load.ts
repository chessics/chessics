import type { SupabaseClient } from '@supabase/supabase-js'
import { MAX_IDS_PER_REQUEST, SUPABASE_MAX_ROWS, allRows, gamesByPliesQueries } from '../supabase/row-cap'
import type { GameResult } from './finding'
import {
  EVAL_PROBE_PLIES,
  hasEngineEvals,
  sittingReport,
  type BlunderMove,
  type HistoryGame,
  type ScopeGame,
  type SittingReport,
} from './sittings'

export const ACCOUNT_GAME_COLUMNS = 'id, platform, played_at, time_control, result, user_color, opponent_username, is_analyzed'
export const BLUNDER_COLUMNS = 'game_id, ply_number, eval_before, eval_after'
export const PROBE_COLUMNS = 'game_id, eval_before, eval_after'

const MAX_PAGES = 50

interface GameRow {
  id: string
  platform: string | null
  played_at: string | null
  time_control: string | null
  result: GameResult | null
  user_color: 'white' | 'black' | null
  opponent_username: string | null
  is_analyzed: boolean | null
}
interface BlunderRow {
  game_id: string
  ply_number: number
  eval_before: number | string | null
  eval_after: number | string | null
}
type ProbeRow = Omit<BlunderRow, 'ply_number'>

const num = (v: number | string | null): number | null => (v === null || !Number.isFinite(Number(v)) ? null : Number(v))

export interface AccountSittingInputs {
  history: HistoryGame[]
  scope: ScopeGame[]
  blunders: BlunderMove[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the server and the service clients differ only in generics
type AnyClient = SupabaseClient<any, any, any>

export async function loadAccountSittings(supabase: AnyClient, userId: string): Promise<SittingReport | null> {
  const inputs = await loadAccountSittingInputs(supabase, userId)
  return inputs ? sittingReport(inputs.history, inputs.scope, inputs.blunders, 'account') : null
}

export async function loadAccountSittingInputs(supabase: AnyClient, userId: string): Promise<AccountSittingInputs | null> {
  try {
    const games = await allRows<GameRow>(
      (from, to) =>
        supabase
          .from('games')
          .select(ACCOUNT_GAME_COLUMNS)
          .eq('user_id', userId)
          .order('played_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      SUPABASE_MAX_ROWS,
      MAX_PAGES
    )
    if (games.error || games.data.length >= SUPABASE_MAX_ROWS * MAX_PAGES) return null
    const analysed = games.data.filter((g) => g.is_analyzed)
    const ids = analysed.map((g) => g.id)

    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) chunks.push(ids.slice(i, i + MAX_IDS_PER_REQUEST))
    const plies = Array.from({ length: EVAL_PROBE_PLIES }, (_, i) => i + 1)
    const [blunderReads, probeReads] = await Promise.all([
      Promise.all(
        chunks.map((chunk) =>
          allRows<BlunderRow & { id?: string }>(
            (from, to) =>
              supabase
                .from('moves')
                .select(BLUNDER_COLUMNS)
                .in('game_id', chunk)
                .eq('classification', 'blunder')
                .order('id', { ascending: true })
                .range(from, to),
            SUPABASE_MAX_ROWS,
            MAX_PAGES
          )
        )
      ),
      Promise.all(
        gamesByPliesQueries(ids, plies).map((q) =>
          supabase.from('moves').select(PROBE_COLUMNS).in('game_id', q.gameIds).in('ply_number', q.plies)
        )
      ),
    ])
    if (blunderReads.some((r) => r.error) || probeReads.some((r) => r.error)) return null

    const probed = new Map<string, ProbeRow[]>()
    for (const r of probeReads)
      for (const m of (r.data ?? []) as ProbeRow[]) probed.set(m.game_id, [...(probed.get(m.game_id) ?? []), m])

    const history: HistoryGame[] = games.data.map((g) => ({
      id: g.id,
      platform: g.platform,
      playedAt: g.played_at,
      timeControl: g.time_control,
      result: g.result,
    }))
    const scope: ScopeGame[] = analysed.map((g) => ({
      id: g.id,
      playedAt: g.played_at,
      opponent: g.opponent_username,
      result: g.result,
      userColor: g.user_color,
      analysed: true,
      evaluated: hasEngineEvals(probed.get(g.id) ?? []),
    }))
    const blunders: BlunderMove[] = blunderReads.flatMap((r) =>
      r.data.map((m) => ({ gameId: m.game_id, ply: m.ply_number, evalBefore: num(m.eval_before), evalAfter: num(m.eval_after) }))
    )
    return { history, scope, blunders }
  } catch {
    return null
  }
}
