import { allRows } from '@/lib/supabase/row-cap'
import type { createClient } from '@/lib/supabase/server'
import type { HistoryRow } from './session'

export async function loadPositionHistory(
  supabase: Awaited<ReturnType<typeof createClient>>, userId: string, positionId: string,
): Promise<HistoryRow[] | null> {
  type Interaction = { position_id: string; session_id: string; correct: boolean | null; created_at: string }
  const { data, error } = await allRows<Interaction>((from, to) =>
    supabase.from('interactions').select('position_id, session_id, correct, created_at')
      .eq('user_id', userId).eq('position_id', positionId)
      .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)
  )
  if (error) return null
  return data.map(row => ({ ...row, at: Date.parse(row.created_at) }))
}
