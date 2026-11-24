import type { SupabaseClient } from '@supabase/supabase-js'
import { accountInstances, pliesNeeded, type AccountRows } from './account'
import type { GroupFacts, InstanceFacts } from './finding'
import { mergeEvidence, type StandAloneByTag } from './instance'
import { chainGameIds, recountGroups } from './recount'
import { SUPABASE_MAX_ROWS, allRows, gamesByPliesQueries } from '@/lib/supabase/row-cap'
import { suddenBlunderInstances } from './out-of-nowhere'

export interface BatchDiagnosis<G extends GroupFacts> {
  groups: G[]
  instances: Map<string, InstanceFacts[]>
  chainGames: number
  chainGameIds: string[]
  outOfNowhere: string[] | null
  suddenBlunders: InstanceFacts[]
}

interface BlunderRow {
  game_id: string
  ply_number: number
  san: string
  fen_before: string
  eval_before: number | string | null
  eval_after: number | string | null
}
const num = (v: number | string | null): number | null => (v === null || !Number.isFinite(Number(v)) ? null : Number(v))

export async function loadBatchDiagnosis<G extends GroupFacts>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the server and the service clients differ only in generics
  supabase: SupabaseClient<any, any, any>,
  storedGroups: readonly G[],
  gameIds: readonly string[],
  games: AccountRows['games'],
  analyses: AccountRows['analyses']
): Promise<BatchDiagnosis<G>> {
  const [positionsResult, chainsResult, blunderResult] = await Promise.all([
    gameIds.length > 0
      ? supabase.from('training_positions').select('game_id, root_ply, tag').in('game_id', [...gameIds])
      : Promise.resolve({ data: [] }),
    analyses.length > 0
      ? supabase
          .from('causal_chains')
          .select('game_analysis_id, root_move_ply, terminal_blunder_ply')
          .in('game_analysis_id', analyses.map((a) => a.id))
      : Promise.resolve({ data: [] }),
    gameIds.length > 0
      ? allRows<BlunderRow>(
          (from, to) =>
            supabase
              .from('moves')
              .select('game_id, ply_number, san, fen_before, eval_before, eval_after')
              .in('game_id', [...gameIds])
              .eq('classification', 'blunder')
              .order('id', { ascending: true })
              .range(from, to),
          SUPABASE_MAX_ROWS,
          20
        ).catch(() => ({ data: [] as BlunderRow[], error: { message: 'threw' } }))
      : Promise.resolve({ data: [] as BlunderRow[], error: null }),
  ])
  const rows: Omit<AccountRows, 'moves'> = {
    groups: [...storedGroups],
    games,
    analyses,
    chains: (chainsResult.data ?? []) as AccountRows['chains'],
    positions: (positionsResult.data ?? []) as AccountRows['positions'],
  }
  const plies = pliesNeeded(rows)
  const moveReads = await Promise.all(
    gamesByPliesQueries(gameIds, plies).map((q) =>
      supabase
        .from('moves')
        .select('game_id, ply_number, san, fen_before, eval_before, eval_after')
        .in('game_id', q.gameIds)
        .in('ply_number', q.plies)
    )
  )
  const moves = moveReads.flatMap((r) => r.data ?? []) as AccountRows['moves']
  const standAlone: StandAloneByTag = new Map()
  const notOnBoard: StandAloneByTag = new Map()
  const instances = accountInstances({ ...rows, moves }, standAlone, notOnBoard)
  const suddenBlunders = blunderResult.error
    ? []
    : suddenBlunderInstances(
        games,
        blunderResult.data.map((m) => ({
          gameId: m.game_id,
          ply: m.ply_number,
          san: m.san,
          fenBefore: m.fen_before,
          evalBefore: num(m.eval_before),
          evalAfter: num(m.eval_after),
        }))
      )
  const outOfNowhere = blunderResult.error ? null : suddenBlunders.map((i) => i.gameId)
  const chains = chainGameIds(storedGroups, instances, standAlone, notOnBoard)
  return {
    groups: recountGroups(storedGroups, instances, mergeEvidence(standAlone, notOnBoard)),
    instances,
    chainGames: chains.size,
    chainGameIds: Array.from(chains),
    outOfNowhere,
    suddenBlunders,
  }
}
