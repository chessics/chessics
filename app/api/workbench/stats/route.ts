import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  const [
    patternResult,
    drillsResult,
    gamesResult,
    openingsResult,
    batchResult,
    patternsResult,
    allBatchesResult,
  ] = await Promise.all([
    supabase
      .from('user_patterns')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),

    supabase
      .from('puzzle_schedules')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .lte('next_due_at', new Date().toISOString()),

    supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_analyzed', true),

    supabase
      .from('user_openings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),

    supabase
      .from('batch_reports')
      .select('*')
      .eq('user_id', userId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('user_patterns')
      .select('*')
      .eq('user_id', userId)
      .order('elo_cost_estimate', { ascending: false }),

    supabase
      .from('batch_reports')
      .select('overall_accuracy, generated_at')
      .eq('user_id', userId)
      .order('generated_at', { ascending: true }),
  ])

  return NextResponse.json({
    patternCount: patternResult.count ?? 0,
    drillsDue: drillsResult.count ?? 0,
    gamesAnalyzed: gamesResult.count ?? 0,
    openingsCount: openingsResult.count ?? 0,
    latestBatch: batchResult.data ?? null,
    patterns: patternsResult.data ?? [],
    allBatches: allBatchesResult.data ?? [],
  })
}
