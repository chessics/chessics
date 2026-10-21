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

export type LandingPlan = 'idle' | 'ready' | 'processing'

export async function landingPlan(
  session: { sessionToken?: string; jobId?: string; authed?: boolean } | null,
  doFetch: (url: string) => Promise<Response>
): Promise<LandingPlan> {
  if (!session?.sessionToken) return 'idle'
  const params = new URLSearchParams({ sessionToken: session.sessionToken })
  if (session.jobId) params.set('jobId', session.jobId)
  let status: unknown
  try {
    const res = await doFetch(`/api/guest/check?${params}`)
    status = ((await res.json()) as { status?: unknown })?.status
  } catch {
    return 'idle'
  }
  if (status === 'processing') return 'processing'
  if (status === 'ready') return session.authed === true ? 'idle' : 'ready'
  return 'idle'
}
