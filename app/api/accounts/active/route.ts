import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { linkedAccountsEnabled } from '@/lib/flags'
import { listAccounts } from '@/lib/accounts/store'
import { activeCookie } from '@/lib/accounts/cookie'

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!linkedAccountsEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: { id?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (typeof body.id !== 'string') return NextResponse.json({ error: 'not_found' }, { status: 404 })
  try {
    const account = (await listAccounts(supabase, user.id)).find((a) => a.id === body.id)
    if (!account) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const res = NextResponse.json({ activeId: account.id })
    res.cookies.set(activeCookie(account.id))
    return res
  } catch (err) {
    console.error('[accounts] set active:', err)
    return NextResponse.json({ error: 'read_failed' }, { status: 500 })
  }
}
