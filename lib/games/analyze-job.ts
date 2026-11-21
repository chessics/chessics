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

export function rowJobAnnouncement(opponent: string | null, job: RowJob): string {
  const game = opponent ? `the game against ${opponent}` : 'this game'
  switch (job.phase) {
    case 'starting':
      return `Analysis queued for ${game}.`
    case 'analyzing':
      return `Analyzing ${game}.`
    case 'done':
      return `Analysis finished: ${game} is ready to review.`
    case 'failed': {
      const label = job.label.replace(/\.$/, '')
      return `${game.charAt(0).toUpperCase()}${game.slice(1)}: ${label.charAt(0).toLowerCase()}${label.slice(1)}.`
    }
  }
}

export function rowJobStep(phase: 'starting' | 'analyzing', progress: number | null): { label: string; percent: number } {
  if (phase === 'starting') return { label: 'Waiting for the engine', percent: 3 }
  const p = typeof progress === 'number' && Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 5
  if (p < 15) return { label: 'Loading the game', percent: Math.max(p, 5) }
  if (p < 80) return { label: 'The engine is checking every move', percent: p }
  if (p < 90) return { label: 'Finding where the game turned', percent: p }
  return { label: 'Writing up the review', percent: p }
}

export function elapsedLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s} s`
  return `${Math.floor(s / 60)} min ${s % 60} s`
}
