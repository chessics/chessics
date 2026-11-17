import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { allRows } from '@/lib/supabase/row-cap'
import GamesLibraryClient from '@/components/workbench/GamesLibraryClient'
import AutoImport from '@/components/workbench/AutoImport'
import { autoImportEnabled } from '@/lib/flags'
import SignedOut from '@/components/layout/SignedOut'
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
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <h1 className="text-2xl font-headline" style={{ color: 'var(--text)' }}>
          Game library
        </h1>
        <SignedOut line="Sign in to see your games." />
      </div>
    )
  }

  const userId = session.user.id

  const { data: games, error } = await allRows<GameWithEmbeddedAnalysis>((from, to) =>
    supabase
      .from('games')
      .select(`
      *,
      game_analyses(overall_accuracy)
    `)
      .eq('user_id', userId)
      .order('played_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to)
      .returns<GameWithEmbeddedAnalysis[]>()
  )

  const flatGames: GameWithAccuracy[] = ((games ?? []) as GameWithEmbeddedAnalysis[]).map(withAccuracy)
  const analysed = flatGames.filter((g) => g.is_analyzed).length

  return (
    <div className="max-w-5xl mx-auto">
      <AutoImport signedIn enabled={autoImportEnabled()} />
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-headline" style={{ color: 'var(--text)' }}>
            Game library
          </h1>
          {!error && flatGames.length > 0 && (
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {countNoun(flatGames.length, 'game')} · {analysed} analyzed
            </p>
          )}
        </div>

        {!error && flatGames.length > 0 && (
          <Link
            href="/"
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 500,
              background: 'var(--gold)',
              color: 'var(--bg)',
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            Analyze games
          </Link>
        )}
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
