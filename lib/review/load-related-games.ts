import type { GameReviewProps } from '@/components/workbench/GameReviewClient'
import { reviewRelatedGamesEnabled } from '@/lib/flags'
import type { createClient } from '@/lib/supabase/server'
import type { Game } from '@/lib/supabase/types'
import { comparisonPosition, relatedBoards, type ComparisonPosition, type RelatedBoard } from './related-games'
import type { DecidedAtChain } from './decided-at'

type Peer = Pick<Game, 'id' | 'result' | 'user_color' | 'opponent_username'> & { game_analyses: { id: string } }
type PeerWithMoves = Peer & {
  moves: Parameters<typeof comparisonPosition>[1]
  game_analyses: { causal_chains: DecidedAtChain[] }
}

const positions = new Map<string, ComparisonPosition | null>()
function cacheKey(owner: string, game: Peer): string {
  return JSON.stringify([owner, game.id, game.game_analyses.id, game.result, game.user_color, game.opponent_username])
}

export async function loadRelatedBoards(db: Awaited<ReturnType<typeof createClient>>, review: GameReviewProps): Promise<RelatedBoard[]> {
  if (!reviewRelatedGamesEnabled()) return []
  const { game, moves, causalChains } = review
  const current = comparisonPosition(game, moves, causalChains)
  if (!current) return []

  const { data: peers, error } = await db.from('games')
    .select('id, result, user_color, opponent_username, game_analyses!inner(id)')
    .eq('user_id', game.user_id).neq('id', game.id).eq('is_analyzed', true).in('result', ['loss', 'draw'])
    .order('played_at', { ascending: false, nullsFirst: false }).order('id').limit(25).returns<Peer[]>()
  if (error || !peers?.length) return []
  const keys = peers.map(peer => cacheKey(game.user_id, peer))
  const summaries = new Map<string, ComparisonPosition | null>()
  const missing: string[] = []
  peers.forEach((peer, index) => {
    const key = keys[index]
    const cached = positions.get(key)
    if (cached === undefined) missing.push(peer.id)
    else summaries.set(key, cached)
  })
  if (missing.length) {
    const { data, error: readError } = await db.from('games')
      .select('id, result, user_color, opponent_username, game_analyses!inner(id, causal_chains(root_move_ply, terminal_blunder_ply)), moves(ply_number, san, fen_before, fen_after, eval_before, eval_after)')
      .eq('user_id', game.user_id).eq('is_analyzed', true).in('id', missing)
      .order('ply_number', { referencedTable: 'moves' }).returns<PeerWithMoves[]>()
    for (const peer of readError ? [] : data ?? []) {
      const summary = comparisonPosition(peer, peer.moves, peer.game_analyses.causal_chains)
      const key = cacheKey(game.user_id, peer)
      summaries.set(key, summary)
      positions.set(key, summary)
      if (positions.size > 150) positions.delete(positions.keys().next().value!)
    }
  }
  return relatedBoards(current, keys.map(key => summaries.get(key) ?? null))
}
