import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GameReviewClient, {
  type ChainWithNodes,
} from '@/components/workbench/GameReviewClient'
import type { Game, Move, GameAnalysis, CausalChain, CausalChainNode } from '@/lib/supabase/types'

interface Props {
  params: { id: string }
  searchParams: { chain?: string }
}

export default async function GameReviewPage({ params, searchParams }: Props) {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) redirect('/login')

  const gameId = String(params.id)
  const userId = session.user.id

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .eq('user_id', userId)
    .single()

  if (gameError || !game) notFound()

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

  const moves = (movesResult.data ?? []) as Move[]
  const analysis = (analysisResult.data ?? null) as GameAnalysis | null

  let causalChains: ChainWithNodes[] = []

  if (analysis) {
    const { data: chains } = await supabase
      .from('causal_chains')
      .select('*')
      .eq('game_analysis_id', analysis.id)
      .order('root_move_ply', { ascending: true })

    if (chains && chains.length > 0) {
      const chainIds = chains.map((c: CausalChain) => c.id)
      const { data: nodes } = await supabase
        .from('causal_chain_nodes')
        .select('*')
        .in('causal_chain_id', chainIds)
        .order('order_index', { ascending: true })

      const nodeList = (nodes ?? []) as CausalChainNode[]
      causalChains = (chains as CausalChain[]).map((chain) => ({
        ...chain,
        nodes: nodeList.filter((n) => n.causal_chain_id === chain.id),
      }))
    }
  }

  const chainRootPly = searchParams.chain ? parseInt(searchParams.chain, 10) : null

  return (
    <GameReviewClient
      game={game as Game}
      moves={moves}
      analysis={analysis}
      causalChains={causalChains}
      initialChainRootPly={Number.isFinite(chainRootPly) ? chainRootPly : null}
    />
  )
}
