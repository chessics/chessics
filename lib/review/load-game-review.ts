import type { createClient } from '@/lib/supabase/server'
import type { GameReviewProps, ChainWithNodes } from '@/components/workbench/GameReviewClient'
import type { Game, Move, GameAnalysis, CausalChain, CausalChainNode } from '@/lib/supabase/types'
import { livePlayEnabled } from '@/lib/play/engine'
import { reviewEvalGraphEnabled, reviewMoveWhyEnabled, reviewSlideBoardsEnabled, reviewTryFirstEnabled, reviewTheirReplyEnabled } from '@/lib/flags'

export async function loadGameReview(
  supabase: Awaited<ReturnType<typeof createClient>>, gameId: string, userId: string,
): Promise<GameReviewProps | null> {
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .eq('user_id', userId)
    .single()

  if (gameError || !game) return null

  const [movesResult, analysisResult] = await Promise.all([
    supabase
      .from('moves')
      .select('*')
      .eq('game_id', gameId)
      .order('ply_number', { ascending: true }),

    supabase
      .from('game_analyses')
      .select('*')
      .eq('game_id', gameId)
      .maybeSingle(),
  ])

  const gated = reviewTryFirstEnabled() || reviewTheirReplyEnabled()
  if (gated && (movesResult.error || analysisResult.error)) throw new Error('Could not load the game review')

  const moves = (movesResult.data ?? []) as Move[]
  const analysis = (analysisResult.data ?? null) as GameAnalysis | null

  let causalChains: ChainWithNodes[] = []

  if (analysis) {
    const { data: chains, error: chainsError } = await supabase
      .from('causal_chains')
      .select('*')
      .eq('game_analysis_id', analysis.id)
      .order('root_move_ply', { ascending: true })

    if (gated && chainsError) throw new Error('Could not load the review chains')
    if (chains && chains.length > 0) {
      const chainIds = chains.map((c: CausalChain) => c.id)
      const { data: nodes, error: nodesError } = await supabase
        .from('causal_chain_nodes')
        .select('*')
        .in('causal_chain_id', chainIds)
        .order('order_index', { ascending: true })

      if (gated && nodesError) throw new Error('Could not load the review moves')
      const nodeList = (nodes ?? []) as CausalChainNode[]
      causalChains = (chains as CausalChain[]).map((chain) => ({
        ...chain,
        nodes: nodeList.filter((n) => n.causal_chain_id === chain.id),
      }))
    }
  }

  return {
    game: game as Game, moves, analysis, causalChains,
    showMoveWhy: reviewMoveWhyEnabled(),
    showEvalGraph: reviewEvalGraphEnabled(),
    showSlideBoards: reviewSlideBoardsEnabled(),
    takeOver: game.user_id === userId && livePlayEnabled() ? 'live' : null,
  }
}
