import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import BatchReportSummary from '@/components/workbench/BatchReportSummary'
import GuestTransferRetry from '@/components/auth/GuestTransferRetry'
import AutoImport from '@/components/workbench/AutoImport'
import { autoImportEnabled } from '@/lib/flags'
import type { BatchPatternGroup, BatchReport, Game, Trajectory, UserPattern } from '@/lib/supabase/types'
import { loadBatchDiagnosis } from '@/lib/diagnosis/load'
import SignedOut from '@/components/layout/SignedOut'
import LoadFailed from '@/components/layout/LoadFailed'
import { trajectoriesWithHistory } from '@/lib/workbench/trajectory'
import { accountScope } from '@/lib/accounts/active'
import { batchReportsForAccount } from '@/lib/accounts/batches'

export const metadata: Metadata = { title: 'Report' }

export default async function WorkbenchPage() {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  let latestBatch: BatchReport | null = null
  let trajectories: Record<string, Trajectory> = {}
  let allBatches: Array<{ overall_accuracy: number | null; generated_at: string }> = []
  let results: Record<string, 'win' | 'loss' | 'draw' | null> | undefined
  let recounted: BatchPatternGroup[] | undefined
  let loadFailed = false

  if (session) {
    const userId = session.user.id

    const scope = await accountScope(supabase, userId).catch((err) => {
      console.error('[workbench] linked accounts:', err)
      return null
    })

    if (scope === null) {
      loadFailed = true
    } else if (scope.scoped) {
      const own = await batchReportsForAccount(supabase, userId, scope.active?.id ?? null)
      const latestId = own.data[0]?.id
      const batchResult = latestId
        ? await supabase.from('batch_reports').select('*').eq('id', latestId).maybeSingle()
        : { data: null, error: null }
      loadFailed = !!own.error || !!batchResult.error
      latestBatch = (batchResult.data ?? null) as BatchReport | null
      allBatches = [...own.data].reverse().map(({ overall_accuracy, generated_at }) => ({ overall_accuracy, generated_at }))
      if (scope.accounts.length <= 1) {
        const patternsResult = await supabase.from('user_patterns').select('pattern_type, trajectory, batch_history').eq('user_id', userId)
        trajectories = trajectoriesWithHistory(
          (patternsResult.data ?? []) as Pick<UserPattern, 'pattern_type' | 'trajectory' | 'batch_history'>[]
        )
      }
    } else {
    const [batchResult, patternsResult, allBatchesResult] = await Promise.all([
      supabase
        .from('batch_reports')
        .select('*')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase.from('user_patterns').select('pattern_type, trajectory, batch_history').eq('user_id', userId),

      supabase
        .from('batch_reports')
        .select('overall_accuracy, generated_at')
        .eq('user_id', userId)
        .order('generated_at', { ascending: true }),
    ])

    loadFailed = !!batchResult.error
    latestBatch = (batchResult.data ?? null) as BatchReport | null
    trajectories = trajectoriesWithHistory(
      (patternsResult.data ?? []) as Pick<UserPattern, 'pattern_type' | 'trajectory' | 'batch_history'>[]
    )
    allBatches = allBatchesResult.data ?? []
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
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <GuestTransferRetry signedIn={!!session} />
      <AutoImport signedIn={!!session} enabled={autoImportEnabled()} />
      <div>
        <h1 className="text-2xl font-headline" style={{ color: 'var(--text)' }}>
          Report
        </h1>
      </div>
      {!session ? (
        <SignedOut line="Sign in to see your report." />
      ) : loadFailed ? (
        <LoadFailed what="Your report" href="/workbench" />
      ) : (
        <BatchReportSummary
          latestBatch={latestBatch}
          trajectories={trajectories}
          allBatches={allBatches}
          results={results}
          recounted={recounted}
        />
      )}
    </div>
  )
}
