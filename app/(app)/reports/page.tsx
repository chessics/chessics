import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import BatchReportSummary from '@/components/workbench/BatchReportSummary'
import SignedOut from '@/components/layout/SignedOut'
import LoadFailed from '@/components/layout/LoadFailed'
import EarlierReports from '@/components/workbench/EarlierReports'
import { loadWorkbenchReport } from '@/lib/workbench/load'

export const metadata: Metadata = { title: 'Reports' }

export default async function ReportsPage() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const report = session ? await loadWorkbenchReport(supabase, session.user.id) : null

  return (
    <div className="flex flex-col gap-6 max-w-screen-xl mx-auto w-full">
      <div>
        <h1 className="font-headline" style={{ color: 'var(--text)', fontSize: 30, lineHeight: 1.15 }}>
          Reports
        </h1>
      </div>
      {!session || !report ? (
        <SignedOut line="Sign in to see your report." />
      ) : report.loadFailed ? (
        <LoadFailed what="Your report" href="/reports" />
      ) : (
        <>
          <BatchReportSummary
            latestBatch={report.latestBatch}
            trajectories={report.trajectories}
            allBatches={report.allBatches}
            results={report.results}
            recounted={report.recounted}
            outOfNowhere={report.outOfNowhere}
            chainGames={report.chainGames}
            suddenGameIds={report.suddenGameIds}
          />
          <EarlierReports reports={report.earlier} />
        </>
      )}
    </div>
  )
}
