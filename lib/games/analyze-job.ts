export type RowJob =
  | { phase: 'starting'; jobId: string }
  | { phase: 'analyzing'; jobId: string }
  | { phase: 'done' }
  | { phase: 'failed'; label: string }

export const ANALYSIS_FAILED_LABEL = "Analysis didn't finish, retry"
export const STATUS_LOST_LABEL = "Lost track of it, retry"

export function rowJobLabel(job: Extract<RowJob, { phase: 'starting' | 'analyzing' }>): string {
  return job.phase === 'starting' ? 'Starting…' : 'Analyzing…'
}

export function nextRowJob(current: RowJob, body: { status?: unknown }): RowJob | null {
  if (current.phase !== 'starting' && current.phase !== 'analyzing') return null
  switch (body.status) {
    case 'complete':
      return { phase: 'done' }
    case 'failed':
      return { phase: 'failed', label: ANALYSIS_FAILED_LABEL }
    case 'processing':
      return current.phase === 'analyzing' ? null : { phase: 'analyzing', jobId: current.jobId }
    default:
      return null
  }
}

export const RUNNING_JOB_WINDOW_MS = 10 * 60_000
