import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { createClient } from '@/lib/supabase/server'
import { linkedAccountsEnabled } from '@/lib/flags'
import { checkLimits, RATE_LIMITS, tooManyRequests, userKey } from '@/lib/ratelimit'
import { gameCounts, linkAccount, listAccounts } from '@/lib/accounts/store'
import { checkName } from '@/lib/accounts/exists'
import { activeCookie } from '@/lib/accounts/cookie'
import { ACTIVE_ACCOUNT_COOKIE, cleanUsername, findAccount, isAccountPlatform, MAX_LINKED_ACCOUNTS, pickActive } from '@/lib/accounts/rules'
import { importAccountPlatform } from '@/lib/import/account'
import { IMPORT_BUDGET_MS } from '@/lib/import/run'

export const maxDuration = 30

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!linkedAccountsEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const accounts = await listAccounts(supabase, user.id)
    const counts = await gameCounts(supabase, user.id, accounts)
    const active = pickActive(accounts, req.cookies.get(ACTIVE_ACCOUNT_COOKIE)?.value)
    return NextResponse.json({
      accounts: accounts.map((a) => ({ id: a.id, platform: a.platform, username: a.username, games: counts[a.id] ?? 0 })),
      activeId: active?.id ?? null,
      max: MAX_LINKED_ACCOUNTS,
    })
  } catch (err) {
    console.error('[accounts] list:', err)
    return NextResponse.json({ error: 'read_failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now()
  if (!linkedAccountsEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { platform?: unknown; username?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (!isAccountPlatform(body.platform)) return NextResponse.json({ error: 'invalid_platform' }, { status: 400 })
  const typed = cleanUsername(body.username)
  if (!typed) return NextResponse.json({ error: 'invalid_username' }, { status: 400 })
  const platform = body.platform

  const limit = await checkLimits([{ rule: RATE_LIMITS.accountLink, key: userKey(user.id) }])
  if (!limit.allowed) return tooManyRequests(limit)

  let accounts
  try {
    accounts = await listAccounts(supabase, user.id)
  } catch (err) {
    console.error('[accounts] list:', err)
    return NextResponse.json({ error: 'read_failed' }, { status: 500 })
  }
  const already = findAccount(accounts, platform, typed)
  if (!already && accounts.length >= MAX_LINKED_ACCOUNTS) {
    return NextResponse.json({ error: 'too_many_accounts', max: MAX_LINKED_ACCOUNTS }, { status: 409 })
  }

  let username = already?.username ?? typed
  if (!already) {
    const check = await checkName(platform, typed)
    if (check.kind === 'not_found') return NextResponse.json({ error: 'username_not_found' }, { status: 404 })
    if (check.kind === 'unknown') return NextResponse.json({ error: 'site_unavailable' }, { status: 503 })
    username = check.username
  }

  let linked
  try {
    linked = await linkAccount(supabase, user.id, platform, username)
  } catch (err) {
    console.error('[accounts] link:', err)
    return NextResponse.json({ error: 'link_failed' }, { status: 500 })
  }

  let imported = 0
  try {
    const result = await importAccountPlatform({
      supabase,
      redis,
      userId: user.id,
      platform,
      username: linked.account.username,
      accountId: linked.account.id,
      deadline: startedAt + IMPORT_BUDGET_MS,
    })
    imported = result.inserted
  } catch (err) {
    console.error('[accounts] first import:', err)
  }

  const res = NextResponse.json(
    {
      account: { id: linked.account.id, platform, username: linked.account.username },
      created: linked.created,
      claimed: linked.claimed,
      imported,
    },
    { status: linked.created ? 201 : 200 }
  )
  res.cookies.set(activeCookie(linked.account.id))
  return res
}
