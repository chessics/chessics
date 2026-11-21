import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import SignedOut from '@/components/layout/SignedOut'
import AnalyzeForm, { type AnalyzeAccount } from '@/components/analyze/AnalyzeForm'
import { accountScope } from '@/lib/accounts/active'
import { onAccount } from '@/lib/accounts/rules'
import { accountOwners } from '@/lib/import/account'

export const metadata: Metadata = { title: 'Analyze games' }

export default async function AnalyzePage({ searchParams }: { searchParams: { error?: string; retryAt?: string } }) {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return (
      <div className="collection-page">
        <h1 className="collection-heading editorial-title">Analyze games</h1>
        <SignedOut line="Sign in to analyze more of your games." />
      </div>
    )
  }

  const userId = session.user.id
  const scope = await accountScope(supabase, userId).catch((err) => {
    console.error('[analyze] linked accounts:', err)
    return null
  })

  let accounts: AnalyzeAccount[] = []
  let activeId: string | null = null
  if (scope?.scoped) {
    accounts = scope.accounts.map((a) => ({ id: a.id, platform: a.platform, username: a.username }))
    activeId = scope.active?.id ?? null
  } else {
    const owners = await accountOwners(supabase, userId).catch(() => ({}) as Awaited<ReturnType<typeof accountOwners>>)
    accounts = (['chess_com', 'lichess'] as const).flatMap((platform) => {
        const username = owners[platform]
        return username ? [{ id: platform, platform, username }] : []
      })
    activeId = accounts[0]?.id ?? null
  }

  const waiting: Record<string, number> = {}
  await Promise.all(
    accounts.map(async (a) => {
      const base = supabase
        .from('games')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_analyzed', false)
      const query = scope?.scoped ? onAccount(base, a.id) : base.eq('platform', a.platform)
      const { count, error } = await query
      if (!error && typeof count === 'number') waiting[a.id] = count
    })
  )

  const { data: profile } = await supabase
    .from('profiles')
    .select('preferred_calibration_override, calibration_level')
    .eq('id', userId)
    .maybeSingle()
  const calibrationLevel =
    (profile?.preferred_calibration_override as number | null | undefined) ??
    (profile?.calibration_level as number | null | undefined) ??
    2

  return (
    <div className="collection-page analyze-page">
      <div className="collection-heading">
        <div>
          <h1 className="editorial-title">Analyze games</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Your newest games that haven’t been analyzed go first. Each batch becomes a report.
          </p>
        </div>
      </div>
      <AnalyzeForm
        accounts={accounts}
        activeId={activeId}
        linked={!!scope?.scoped}
        waiting={waiting}
        calibrationLevel={calibrationLevel}
        errorCode={typeof searchParams.error === 'string' ? searchParams.error : null}
        retryAt={typeof searchParams.retryAt === 'string' ? searchParams.retryAt : null}
      />
    </div>
  )
}
