import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import BatchReportSummary from '@/components/workbench/BatchReportSummary'
import GuestTransferRetry from '@/components/auth/GuestTransferRetry'
import AutoImport from '@/components/workbench/AutoImport'
import { autoImportEnabled } from '@/lib/flags'
import SignedOut from '@/components/layout/SignedOut'
import LoadFailed from '@/components/layout/LoadFailed'
import { scopeAccountId } from '@/lib/accounts/active'
import { cookies } from 'next/headers'
import { loadHome, HOME_SEEN_COOKIE, type HomeData } from '@/lib/home/load'
import { loadWorkbenchReport } from '@/lib/workbench/load'
import HomeView from '@/components/home/HomeView'

export const metadata: Metadata = { title: 'Home' }

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

  let loadFailed = false
  let home: HomeData | null = null
  let hasReport = false

  if (session) {
    const userId = session.user.id
    const report = await loadWorkbenchReport(supabase, userId)
    loadFailed = report.loadFailed
    hasReport = !!report.latestBatch

    if (!loadFailed && report.scope !== null) {
      const groups = [...(report.recounted ?? report.latestBatch?.pattern_groups ?? [])].sort((a, b) => b.score - a.score)
      const top = groups.find((g) => g.recurring) ?? null
      home = await loadHome({
        supabase,
        userId,
        accountId: scopeAccountId(report.scope),
        accountName: report.scope.scoped ? report.scope.active?.username ?? null : null,
        headline: top ? { tag: top.tag, label: top.label, gameIds: top.gameIds ?? [] } : null,
        batchId: report.latestBatch?.id ?? null,
        lastSeen: lastSeen(),
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
          {home?.name ?? 'Home'}
        </h1>
      </div>
      {!session ? (
        <SignedOut line="Sign in to see your games and your report." />
      ) : loadFailed ? (
        <LoadFailed what="Your report" href="/workbench" />
      ) : (
        <>
          {home && <HomeView data={home} />}
          {!hasReport && (
            <BatchReportSummary latestBatch={null} trajectories={{}} allBatches={[]} />
          )}
        </>
      )}
    </div>
  )
}
