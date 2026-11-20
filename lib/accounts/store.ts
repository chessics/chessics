import type { SupabaseClient } from '@supabase/supabase-js'
import { userSideName } from '@/lib/sync/owner'
import { allRows, MAX_IDS_PER_REQUEST } from '@/lib/supabase/row-cap'
import { findAccount, sameName, type AccountPlatform, type LinkedAccount } from './rules'

export class AccountStoreError extends Error {}

const ACCOUNT_SELECT = 'id, platform, username, created_at'

export async function listAccounts(supabase: SupabaseClient, userId: string): Promise<LinkedAccount[]> {
  const { data, error } = await supabase
    .from('sync_accounts')
    .select(ACCOUNT_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw new AccountStoreError(`read accounts: ${error.message}`)
  return (data ?? []).filter((r) => r.platform === 'chess_com' || r.platform === 'lichess') as LinkedAccount[]
}

export async function claimGames(supabase: SupabaseClient, userId: string, account: LinkedAccount): Promise<number> {
  const { data, error } = await allRows<{ id: string; pgn: string; platform: string; user_color: 'white' | 'black' | null }>(
    (from, to) =>
      supabase
        .from('games')
        .select('id, pgn, platform, user_color')
        .eq('user_id', userId)
        .eq('platform', account.platform)
        .is('account_id', null)
        .order('id', { ascending: true })
        .range(from, to)
  )
  if (error) throw new AccountStoreError(`read unlinked games: ${error.message}`)
  const ids = data.filter((g) => {
    const name = userSideName(g)
    return name !== null && sameName(name, account.username)
  }).map((g) => g.id)
  for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
    const { error: updateError } = await supabase
      .from('games')
      .update({ account_id: account.id })
      .eq('user_id', userId)
      .is('account_id', null)
      .in('id', ids.slice(i, i + MAX_IDS_PER_REQUEST))
    if (updateError) throw new AccountStoreError(`claim games: ${updateError.message}`)
  }
  return ids.length
}

export async function linkAccount(
  supabase: SupabaseClient,
  userId: string,
  platform: AccountPlatform,
  username: string
): Promise<{ account: LinkedAccount; created: boolean; claimed: number }> {
  const existing = findAccount(await listAccounts(supabase, userId), platform, username)
  let account = existing
  let created = false
  if (!account) {
    const { data, error } = await supabase
      .from('sync_accounts')
      .insert({ user_id: userId, platform, username })
      .select(ACCOUNT_SELECT)
      .single()
    if (error) {
      if (error.code !== '23505') throw new AccountStoreError(`link account: ${error.message}`)
      account = findAccount(await listAccounts(supabase, userId), platform, username)
      if (!account) throw new AccountStoreError('link account: conflict but no row')
    } else {
      account = data as LinkedAccount
      created = true
    }
  }
  const claimed = await claimGames(supabase, userId, account)
  return { account, created, claimed }
}

export async function unlinkAccount(supabase: SupabaseClient, userId: string, accountId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('sync_accounts')
    .delete()
    .eq('user_id', userId)
    .eq('id', accountId)
    .select('id')
  if (error) throw new AccountStoreError(`unlink account: ${error.message}`)
  return Array.isArray(data) && data.length > 0
}

export async function gameCounts(
  supabase: SupabaseClient,
  userId: string,
  accounts: readonly LinkedAccount[]
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const a of accounts) {
    const { count, error } = await supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('account_id', a.id)
    if (error) throw new AccountStoreError(`count games: ${error.message}`)
    counts[a.id] = count ?? 0
  }
  return counts
}

export async function accountGameIds(
  supabase: SupabaseClient,
  userId: string,
  accountId: string
): Promise<{ ids: Set<string>; error: { message: string } | null }> {
  const { data, error } = await allRows<{ id: string }>((from, to) =>
    supabase
      .from('games')
      .select('id')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .order('id', { ascending: true })
      .range(from, to)
  )
  return { ids: new Set(data.map((g) => g.id)), error }
}
