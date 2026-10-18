import { statusSaysLost } from './poll'

export type LoadPlan =
  | { kind: 'resume'; jobId: string }
  | { kind: 'finished'; jobId: string }
  | { kind: 'fresh' }

export async function planOnLoad(
  jobId: string | undefined,
  fetchStatus: (jobId: string) => Promise<Response>
): Promise<LoadPlan> {
  if (!jobId) return { kind: 'fresh' }
  let res: Response
  try {
    res = await fetchStatus(jobId)
  } catch {
    return { kind: 'resume', jobId }
  }
  if (res.status === 404) return { kind: 'fresh' }
  if (!res.ok) return { kind: 'resume', jobId }
  let body: { status?: unknown; lost?: unknown }
  try {
    body = (await res.json()) as { status?: unknown; lost?: unknown }
  } catch {
    return { kind: 'resume', jobId }
  }
  const status = body?.status
  if (status === 'complete') return { kind: 'finished', jobId }
  if (status === 'failed') return { kind: 'fresh' }
  if (statusSaysLost(body)) return { kind: 'fresh' }
  return { kind: 'resume', jobId }
}
