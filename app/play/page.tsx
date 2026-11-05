import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PlayOut from '@/components/play/PlayOut'
import StatusPage from '@/components/layout/StatusPage'
import { engineKind, livePlayEnabled } from '@/lib/play/engine'
import { loadOwnGame } from '@/lib/play/load'
import { backHrefFor, setupFromContext, userSideEval } from '@/lib/play/setup'

export const metadata: Metadata = { title: 'Play it out' }
export const dynamic = 'force-dynamic'

interface Props {
  searchParams: { game?: string; ply?: string; from?: string }
}

export default async function PlayPage({ searchParams }: Props) {
  if (!livePlayEnabled()) notFound()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const gameId = String(searchParams.game ?? '')
  const ply = /^\d{1,4}$/.test(searchParams.ply ?? '') ? Number(searchParams.ply) : -1
  const loaded = await loadOwnGame(supabase, user.id, gameId, ply)
  if (!loaded.ok) {
    if (loaded.error === 'game_over') {
      return (
        <main className="min-h-screen flex items-center px-4 sm:px-6 py-12" style={{ background: 'var(--bg)' }}>
          <StatusPage headline="Nothing left to play" sentence="The game is already over in that position.">
            <a href={`/games/${encodeURIComponent(gameId)}/review`} className="text-sm" style={{ color: 'var(--brass)' }}>
              See the full game
            </a>
          </StatusPage>
        </main>
      )
    }
    if (loaded.status === 500) throw new Error('play: game lookup failed')
    notFound()
  }

  const { data: move } = await supabase
    .from('moves')
    .select('eval_before')
    .eq('game_id', loaded.context.gameId)
    .eq('ply_number', ply + 1)
    .maybeSingle()

  const setup = setupFromContext(loaded.context, {
    mode: 'live',
    engine: engineKind(),
    startEvalCp: userSideEval((move as { eval_before: number | null } | null)?.eval_before, loaded.context.userColor),
    gameHref: `/games/${encodeURIComponent(loaded.context.gameId)}/review`,
    backHref: backHrefFor('live', searchParams.from),
  })

  return (
    <main className="min-h-screen px-4 sm:px-6 py-8" style={{ background: 'var(--bg)' }}>
      <PlayOut setup={setup} />
    </main>
  )
}
