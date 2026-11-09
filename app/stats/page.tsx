import { notFound } from 'next/navigation'
import { Redis } from '@upstash/redis'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isStatsOwner } from '@/lib/stats/owner'
import { loadStats } from '@/lib/stats/load'
import type { ReadClient, ReadRedis } from '@/lib/analytics/usage-report'
import StatsView from '@/components/stats/StatsView'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 30

export default async function StatsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isStatsOwner(user?.id)) notFound()

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  const redis = url && token ? (new Redis({ url, token }) as unknown as ReadRedis) : null
  const data = await loadStats(createServiceClient() as unknown as ReadClient, redis, Date.now())

  return (
    <main className="min-h-screen px-6 pt-16 pb-16 sm:px-16" style={{ background: 'var(--bg)' }}>
      <StatsView data={data} />
    </main>
  )
}
