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
import { accountScope, scopeAccountId } from '@/lib/accounts/active'
import { batchReportsForAccount } from '@/lib/accounts/batches'
import { earlierReports, headlineReport, trendReports, type ReportRow } from '@/lib/workbench/report-choice'
import EarlierReports from '@/components/workbench/EarlierReports'
import { cookies } from 'next/headers'
import { loadHome, HOME_SEEN_COOKIE, type HomeData } from '@/lib/home/load'
import HomeView from '@/components/home/HomeView'

export const metadata: Metadata = { title: 'Report' }

function lastSeen(): number | null {
  try {
    const n = Number(cookies().get(HOME_SEEN_COOKIE)?.value)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

export default async function WorkbenchPage() {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  let latestBatch: BatchReport | null = null
  let trajectories: Record<string, Trajectory> = {}
  let allBatches: Array<{ overall_accuracy: number | null; generated_at: string }> = []
  let earlier: ReportRow[] = []
  let results: Record<string, 'win' | 'loss' | 'draw' | null> | undefined
  let recounted: BatchPatternGroup[] | undefined
  let loadFailed = false
  let home: HomeData | null = null

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

    if (!loadFailed && scope !== null) {
      const groups = [...(recounted ?? latestBatch?.pattern_groups ?? [])].sort((a, b) => b.score - a.score)
      const top = groups.find((g) => g.recurring) ?? null
      const seen = lastSeen()
      home = await loadHome({
        supabase,
        userId,
        accountId: scopeAccountId(scope),
        accountName: scope.scoped ? scope.active?.username ?? null : null,
        headline: top ? { tag: top.tag, label: top.label, gameIds: top.gameIds ?? [] } : null,
        batchId: latestBatch?.id ?? null,
        lastSeen: seen,
        now: Date.now(),
      }).catch((err) => {
        console.error('[workbench] home:', err)
        return null
      })
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-screen-xl mx-auto w-full">
      <GuestTransferRetry signedIn={!!session} />
      <AutoImport signedIn={!!session} enabled={autoImportEnabled()} />
      <div>
        <h1 className="font-headline" style={{ color: 'var(--text)', fontSize: 30, lineHeight: 1.15 }}>
          {home?.name ?? 'Report'}
        </h1>
      </div>
      {!session ? (
        <SignedOut line="Sign in to see your report." />
      ) : loadFailed ? (
        <LoadFailed what="Your report" href="/workbench" />
      ) : (
        <>
          {home && <HomeView data={home} />}
          {home && latestBatch && (
            <h2
              className="font-headline"
              style={{ color: 'var(--text)', fontSize: 22, lineHeight: 1.2, fontWeight: 500, borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 16 }}
            >
              Latest report
            </h2>
          )}
        <BatchReportSummary
          latestBatch={latestBatch}
          trajectories={trajectories}
          allBatches={allBatches}
          results={results}
          recounted={recounted}
        />
        </>
      )}
      {session && !loadFailed && <EarlierReports reports={earlier} />}
    </div>
  )
}
