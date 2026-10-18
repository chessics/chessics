import { createClient } from '@/lib/supabase/server'
import BatchReportSummary from '@/components/workbench/BatchReportSummary'
import type { BatchReport, Trajectory, UserPattern } from '@/lib/supabase/types'

export default async function WorkbenchPage() {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  let latestBatch: BatchReport | null = null
  let trajectories: Record<string, Trajectory> = {}
  let allBatches: Array<{ overall_accuracy: number | null; generated_at: string }> = []

  if (session) {
    const userId = session.user.id

    const [batchResult, patternsResult, allBatchesResult] = await Promise.all([
      supabase
        .from('batch_reports')
        .select('*')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase.from('user_patterns').select('pattern_type, trajectory').eq('user_id', userId),

      supabase
        .from('batch_reports')
        .select('overall_accuracy, generated_at')
        .eq('user_id', userId)
        .order('generated_at', { ascending: true }),
    ])

    latestBatch = (batchResult.data ?? null) as BatchReport | null
    trajectories = Object.fromEntries(
      ((patternsResult.data ?? []) as Pick<UserPattern, 'pattern_type' | 'trajectory'>[]).map(
        (p) => [p.pattern_type, p.trajectory]
      )
    )
    allBatches = allBatchesResult.data ?? []
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-headline" style={{ color: 'var(--text)' }}>
          Workbench
        </h1>
      </div>
      <BatchReportSummary
        latestBatch={latestBatch}
        trajectories={trajectories}
        allBatches={allBatches}
      />
    </div>
  )
}
