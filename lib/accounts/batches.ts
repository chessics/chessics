import type { SupabaseClient } from '@supabase/supabase-js'
import { MAX_IDS_PER_REQUEST } from '@/lib/supabase/row-cap'
import { NO_ACCOUNT } from './rules'

export interface AccountBatch {
  id: string
  generated_at: string
  overall_accuracy: number | null
}

export async function batchReportsForAccount(
  supabase: SupabaseClient,
  userId: string,
  accountId: string | null
): Promise<{ data: AccountBatch[]; error: { message: string } | null }> {
  if (accountId === null || accountId === NO_ACCOUNT) return { data: [], error: null }
  const { data: reports, error } = await supabase
    .from('batch_reports')
    .select('id, generated_at, overall_accuracy, game_ids')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })
  if (error) return { data: [], error }
  const rows = (reports ?? []) as Array<AccountBatch & { game_ids: string[] | null }>
  const firsts = Array.from(new Set(rows.map((r) => r.game_ids?.[0]).filter((g): g is string => !!g)))
  const mine = new Set<string>()
  for (let i = 0; i < firsts.length; i += MAX_IDS_PER_REQUEST) {
    const { data, error: gamesError } = await supabase
      .from('games')
      .select('id')
      .eq('account_id', accountId)
      .in('id', firsts.slice(i, i + MAX_IDS_PER_REQUEST))
    if (gamesError) return { data: [], error: gamesError }
    for (const g of data ?? []) mine.add(g.id as string)
  }
  return {
    data: rows
      .filter((r) => r.game_ids?.[0] && mine.has(r.game_ids[0]))
      .map(({ id, generated_at, overall_accuracy }) => ({ id, generated_at, overall_accuracy })),
    error: null,
  }
}
