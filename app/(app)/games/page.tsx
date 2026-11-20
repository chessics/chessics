import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { allRows } from '@/lib/supabase/row-cap'
import GamesLibraryClient from '@/components/workbench/GamesLibraryClient'
import AutoImport from '@/components/workbench/AutoImport'
import { autoImportEnabled, playerLookupEnabled } from '@/lib/flags'
import PlayerLookupButton from '@/components/games/PlayerLookupButton'
import SignedOut from '@/components/layout/SignedOut'
import { accountScope, scopeAccountId } from '@/lib/accounts/active'
import { onAccount } from '@/lib/accounts/rules'
import LoadFailed from '@/components/layout/LoadFailed'
import { countNoun } from '@/lib/count-noun'
import { withAccuracy, type GameWithAccuracy, type GameWithEmbeddedAnalysis } from '@/lib/games/accuracy'

export const metadata: Metadata = { title: 'Games' }

export default async function GamesPage() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return (
      <div className="collection-page">
        <h1 className="collection-heading editorial-title">
          Game library
        </h1>
        <SignedOut line="Sign in to see your games." />
      </div>
    )
  }

  const userId = session.user.id

  const scope = await accountScope(supabase, userId).catch((err) => {
    console.error('[games] linked accounts:', err)
    return null
  })
  const accountId = scope ? scopeAccountId(scope) : undefined
  const { data: games, error } = scope === null
    ? { data: [] as GameWithEmbeddedAnalysis[], error: { message: 'linked accounts read failed' } }
    : await allRows<GameWithEmbeddedAnalysis>((from, to) =>
    onAccount(
      supabase
        .from('games')
        .select(`
      *,
      game_analyses(overall_accuracy)
    `)
        .eq('user_id', userId),
      accountId
    )
      .order('played_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to)
      .returns<GameWithEmbeddedAnalysis[]>()
  )

  const flatGames: GameWithAccuracy[] = ((games ?? []) as GameWithEmbeddedAnalysis[]).map(withAccuracy)
  const analysed = flatGames.filter((g) => g.is_analyzed).length

  return (
    <div className="collection-page">
      <AutoImport signedIn enabled={autoImportEnabled()} />
      <div className="collection-heading">
        <div>
          <h1 className="editorial-title">
            Game library
          </h1>
          {!error && flatGames.length > 0 && (
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {countNoun(flatGames.length, 'game')} · {analysed} analyzed
            </p>
          )}
        </div>

        <div className="collection-actions">
          {playerLookupEnabled() && <PlayerLookupButton />}
          {!error && flatGames.length > 0 && (
            <Link href="/" className="editorial-action">
              Analyze games
            </Link>
          )}
        </div>
      </div>

      {error ? (
        <LoadFailed what="Your games" href="/games" />
      ) : flatGames.length === 0 ? (
        <div
          className="flex flex-col items-start gap-4 p-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-base font-medium" style={{ color: 'var(--text)' }}>
            No games yet.
          </p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Enter your Chess.com or Lichess username on the start page to analyze your last games.
          </p>
          <Link
            href="/"
            className="px-5 py-2.5 text-sm font-medium"
            style={{ background: 'var(--gold)', color: 'var(--bg)', textDecoration: 'none' }}
          >
            Analyze my games
          </Link>
        </div>
      ) : (
        <GamesLibraryClient games={flatGames} />
      )}
    </div>
  )
}
