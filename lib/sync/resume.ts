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
  let status: unknown
  try {
    status = ((await res.json()) as { status?: unknown }).status
  } catch {
    return { kind: 'resume', jobId }
  }
  if (status === 'complete') return { kind: 'finished', jobId }
  if (status === 'failed') return { kind: 'fresh' }
  return { kind: 'resume', jobId }
}
