import type { SupabaseClient } from '@supabase/supabase-js'
import { accountInstances, pliesNeeded, type AccountRows } from './account'
import type { GroupFacts, InstanceFacts } from './finding'
import type { StandAloneByTag } from './instance'
import { recountGroups } from './recount'
import { gamesByPliesQueries } from '@/lib/supabase/row-cap'

export interface BatchDiagnosis<G extends GroupFacts> {
  groups: G[]
  instances: Map<string, InstanceFacts[]>
}

export async function loadBatchDiagnosis<G extends GroupFacts>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the server and the service clients differ only in generics
  supabase: SupabaseClient<any, any, any>,
  storedGroups: readonly G[],
  gameIds: readonly string[],
  games: AccountRows['games'],
  analyses: AccountRows['analyses']
): Promise<BatchDiagnosis<G>> {
  const [positionsResult, chainsResult] = await Promise.all([
    gameIds.length > 0
      ? supabase.from('training_positions').select('game_id, root_ply, tag').in('game_id', [...gameIds])
      : Promise.resolve({ data: [] }),
    analyses.length > 0
      ? supabase
          .from('causal_chains')
          .select('game_analysis_id, root_move_ply, terminal_blunder_ply')
          .in('game_analysis_id', analyses.map((a) => a.id))
      : Promise.resolve({ data: [] }),
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
  const instances = accountInstances({ ...rows, moves }, standAlone)
  return { groups: recountGroups(storedGroups, instances, standAlone), instances }
}
