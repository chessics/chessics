import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import GamesLibraryClient from '@/components/workbench/GamesLibraryClient'
import { withAccuracy, type GameWithAccuracy, type GameWithEmbeddedAnalysis } from '@/lib/games/accuracy'

export const metadata: Metadata = { title: 'Games' }

export default async function GamesPage() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return (
      <div className="max-w-5xl mx-auto">
        <p style={{ color: 'var(--text-muted)' }}>Please log in to view your games.</p>
      </div>
    )
  }

  const userId = session.user.id

  const { data: games } = await supabase
    .from('games')
    .select(`
      *,
      game_analyses(overall_accuracy)
    `)
    .eq('user_id', userId)
    .order('played_at', { ascending: false })

  const flatGames: GameWithAccuracy[] = ((games ?? []) as GameWithEmbeddedAnalysis[]).map(withAccuracy)

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1
            className="text-2xl font-semibold"
            style={{ color: 'var(--text)' }}
          >
            Game Library
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {flatGames.length > 0
              ? `${flatGames.length} games · ${flatGames.filter((g) => g.is_analyzed).length} analyzed`
              : 'No games synced yet'}
          </p>
        </div>

        <Link
          href="/"
          style={{
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 500,
            background: 'var(--gold)',
            color: '#1a1512',
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          + Import games
        </Link>
      </div>

      {flatGames.length === 0 ? (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            No games imported yet.
          </p>
          <p
            style={{
              color: 'var(--text-dim)',
              fontSize: 12,
              marginTop: 4,
              marginBottom: 20,
            }}
          >
            Start by entering your Chess.com or Lichess username on the home page.
          </p>
          <Link
            href="/"
            style={{
              padding: '8px 20px',
              background: 'var(--gold)',
              color: '#1a1512',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Import from Chess.com / Lichess
          </Link>
        </div>
      ) : (
        <GamesLibraryClient games={flatGames} />
      )}
    </div>
  )
}
