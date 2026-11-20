import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { linkedAccountsEnabled } from '@/lib/flags'
import { listAccounts } from './store'
import { ACTIVE_ACCOUNT_COOKIE, pickActive, type LinkedAccount } from './rules'

export type AccountScope =
  | { scoped: false }
  | { scoped: true; accounts: LinkedAccount[]; active: LinkedAccount | null }

export async function accountScope(supabase: SupabaseClient, userId: string): Promise<AccountScope> {
  if (!linkedAccountsEnabled()) return { scoped: false }
  const accounts = await listAccounts(supabase, userId)
  const cookie = cookies().get(ACTIVE_ACCOUNT_COOKIE)?.value ?? null
  return { scoped: true, accounts, active: pickActive(accounts, cookie) }
}

export function scopeAccountId(scope: AccountScope): string | null | undefined {
  return scope.scoped ? scope.active?.id ?? null : undefined
}

export { onAccount } from './rules'
