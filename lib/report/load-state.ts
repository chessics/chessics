export type ReportLoadState = 'ready' | 'missing' | 'error'

export function reportLoadState(status: number | null): ReportLoadState {
  if (status !== null && status >= 200 && status < 300) return 'ready'
  if (status === 404) return 'missing'
  return 'error'
}
