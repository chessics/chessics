import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { linkedAccountsEnabled } from '@/lib/flags'
import { listAccounts, unlinkAccount } from '@/lib/accounts/store'
import { activeCookie } from '@/lib/accounts/cookie'
import { ACTIVE_ACCOUNT_COOKIE, pickActive } from '@/lib/accounts/rules'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!linkedAccountsEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const id = String(params.id)
  if (!UUID.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    if (!(await unlinkAccount(supabase, user.id, id))) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const rest = await listAccounts(supabase, user.id)
    const active = pickActive(rest, req.cookies.get(ACTIVE_ACCOUNT_COOKIE)?.value)
    const res = NextResponse.json({ removed: id, activeId: active?.id ?? null })
    if (active) res.cookies.set(activeCookie(active.id))
    else res.cookies.delete(ACTIVE_ACCOUNT_COOKIE)
    return res
  } catch (err) {
    console.error('[accounts] unlink:', err)
    return NextResponse.json({ error: 'unlink_failed' }, { status: 500 })
  }
}
