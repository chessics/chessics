import type { SupabaseClient } from '@supabase/supabase-js'
import type { BatchPatternGroup, BatchReport, Game, Trajectory, UserPattern } from '@/lib/supabase/types'
import { loadBatchDiagnosis } from '@/lib/diagnosis/load'
import { trajectoriesWithHistory } from '@/lib/workbench/trajectory'
import { accountScope, type AccountScope } from '@/lib/accounts/active'
import { batchReportsForAccount } from '@/lib/accounts/batches'
import { earlierReports, headlineReport, trendReports, type ReportRow } from '@/lib/workbench/report-choice'

export interface WorkbenchReport {
  scope: AccountScope | null
  latestBatch: BatchReport | null
  trajectories: Record<string, Trajectory>
  allBatches: Array<{ overall_accuracy: number | null; generated_at: string }>
  earlier: ReportRow[]
  results: Record<string, 'win' | 'loss' | 'draw' | null> | undefined
  recounted: BatchPatternGroup[] | undefined
  loadFailed: boolean
}

export async function loadWorkbenchReport(supabase: SupabaseClient, userId: string): Promise<WorkbenchReport> {
  let latestBatch: BatchReport | null = null
  let trajectories: Record<string, Trajectory> = {}
  let allBatches: Array<{ overall_accuracy: number | null; generated_at: string }> = []
  let earlier: ReportRow[] = []
  let results: Record<string, 'win' | 'loss' | 'draw' | null> | undefined
  let recounted: BatchPatternGroup[] | undefined
  let loadFailed = false

  const scope = await accountScope(supabase, userId).catch((err) => {
    console.error('[workbench] linked accounts:', err)
    return null
  })

  if (scope === null) {
    loadFailed = true
  } else if (scope.scoped) {
    const own = await batchReportsForAccount(supabase, userId, scope.active?.id ?? null)
    const lead = headlineReport(own.data)
    const batchResult = lead
      ? await supabase.from('batch_reports').select('*').eq('id', lead.id).maybeSingle()
      : { data: null, error: null }
    loadFailed = !!own.error || !!batchResult.error
    latestBatch = (batchResult.data ?? null) as BatchReport | null
    earlier = earlierReports(own.data, lead?.id ?? null)
    allBatches = trendReports(own.data).map(({ overall_accuracy, generated_at }) => ({ overall_accuracy, generated_at }))
    if (scope.accounts.length <= 1) {
      const patternsResult = await supabase.from('user_patterns').select('pattern_type, trajectory, batch_history').eq('user_id', userId)
      trajectories = trajectoriesWithHistory(
        (patternsResult.data ?? []) as Pick<UserPattern, 'pattern_type' | 'trajectory' | 'batch_history'>[]
      )
    }
  } else {
    const [reportsResult, patternsResult] = await Promise.all([
      supabase
        .from('batch_reports')
        .select('id, generated_at, overall_accuracy, game_count')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false }),

      supabase.from('user_patterns').select('pattern_type, trajectory, batch_history').eq('user_id', userId),
    ])
    const rows = (reportsResult.data ?? []) as ReportRow[]
    const lead = headlineReport(rows)
    const batchResult = lead
      ? await supabase.from('batch_reports').select('*').eq('id', lead.id).maybeSingle()
      : { data: null, error: null }

    loadFailed = !!reportsResult.error || !!batchResult.error
    latestBatch = (batchResult.data ?? null) as BatchReport | null
    earlier = earlierReports(rows, lead?.id ?? null)
    trajectories = trajectoriesWithHistory(
      (patternsResult.data ?? []) as Pick<UserPattern, 'pattern_type' | 'trajectory' | 'batch_history'>[]
    )
    allBatches = trendReports(rows).map(({ overall_accuracy, generated_at }) => ({ overall_accuracy, generated_at }))
  }

  const ids = latestBatch?.game_ids ?? []
  if (latestBatch && ids.length > 0) {
    const [gamesRead, analysesRead] = await Promise.all([
      supabase.from('games').select('id, result, played_at, opponent_username, user_color').in('id', ids),
      supabase.from('game_analyses').select('id, game_id').in('game_id', ids),
    ])
    const games = (gamesRead.data ?? []) as Array<Pick<Game, 'id' | 'result' | 'played_at' | 'opponent_username' | 'user_color'>>
    if (!gamesRead.error && gamesRead.data) results = Object.fromEntries(games.map((g) => [g.id, g.result]))
    recounted = (
      await loadBatchDiagnosis(
        supabase,
        latestBatch.pattern_groups ?? [],
        ids,
        games.flatMap((g) => (g.user_color ? [{ ...g, user_color: g.user_color }] : [])),
        (analysesRead.data ?? []) as Array<{ id: string; game_id: string }>
      )
    ).groups
  }

  return { scope, latestBatch, trajectories, allBatches, earlier, results, recounted, loadFailed }
}
