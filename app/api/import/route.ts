import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { createClient } from '@/lib/supabase/server'
import { trackSignup } from '@/lib/analytics/track'
import { autoImportEnabled, linkedAccountsEnabled } from '@/lib/flags'
import { claimGames, listAccounts } from '@/lib/accounts/store'
import { checkLimits, RATE_LIMITS, tooManyRequests, userKey } from '@/lib/ratelimit'
import { accountOwners, IMPORT_EVERY_S, importAccountPlatform, ImportWriteError, PLATFORMS, recentKey } from '@/lib/import/account'
import { IMPORT_BUDGET_MS } from '@/lib/import/run'

export const maxDuration = 30

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export async function POST(): Promise<NextResponse> {
  const startedAt = Date.now()
  if (!autoImportEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  trackSignup(user)

  const limit = await checkLimits([{ rule: RATE_LIMITS.gameImport, key: userKey(user.id) }])
  if (!limit.allowed) return tooManyRequests(limit)

  type Target = { platform: (typeof PLATFORMS)[number]; username: string; accountId?: string }
  let targets: Target[]
  let accounts: Awaited<ReturnType<typeof listAccounts>> = []
  try {
    if (linkedAccountsEnabled()) {
      accounts = await listAccounts(supabase, user.id)
      targets = accounts.map((a) => ({ platform: a.platform, username: a.username, accountId: a.id }))
    } else {
      const owners = await accountOwners(supabase, user.id)
      targets = PLATFORMS.filter((p) => owners[p]).map((p) => ({ platform: p, username: owners[p]! }))
    }
  } catch (err) {
    console.error('[import] owner read error:', err)
    return NextResponse.json({ error: 'import_failed' }, { status: 500 })
  }
  if (targets.length === 0) return NextResponse.json({ imported: 0, skipped: 'no_account_name' })

  try {
    const fresh = await redis.set(recentKey(user.id), String(startedAt), { nx: true, ex: IMPORT_EVERY_S })
    if (fresh === null) return NextResponse.json({ imported: 0, skipped: 'recent' })
  } catch (err) {
    console.error('[import] throttle unreachable, importing anyway:', err)
  }

  try {
    for (const a of accounts) await claimGames(supabase, user.id, a)
  } catch (err) {
    console.error('[import] claim games:', err)
  }

  let imported = 0
  let failed = false
  for (const target of targets) {
    try {
      const result = await importAccountPlatform({
        supabase,
        redis,
        userId: user.id,
        platform: target.platform,
        username: target.username,
        accountId: target.accountId,
        deadline: startedAt + IMPORT_BUDGET_MS,
      })
      imported += result.inserted
    } catch (err) {
      if (err instanceof ImportWriteError) failed = true
      console.error(`[import] ${target.platform} ${target.username}:`, err)
    }
  }

  if (failed) {
    try {
      await redis.del(recentKey(user.id))
    } catch {
    }
    return NextResponse.json({ error: 'import_failed', imported }, { status: 500 })
  }
  return NextResponse.json({ imported })
}
