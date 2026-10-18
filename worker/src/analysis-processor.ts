import { Chess } from 'chess.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { evaluateGame, engineLabel, DEFAULT_DEPTH, type EvaluatedMove } from './stockfish.js'
import { buildTrainingPositions, type TrainingPositionRow } from './training-positions.js'
import { generateGameReview } from './claude-service.js'
import { detectGamePatterns, primaryTagForChainRoot, isMateMissWhileWinning } from './pattern-detector.js'
import type { DetectedPattern, RootCauseRecord } from './pattern-detector.js'

interface GameRecord {
  id: string
  user_id: string
  pgn: string
  user_color: 'white' | 'black'
  result: 'win' | 'loss' | 'draw'
  opening_name: string | null
}

export interface GameAnalysisData {
  gameId: string
  moves: Array<{
    ply_number: number
    san: string
    fen_before: string
    fen_after: string
    eval_before: number | null
    eval_after: number | null
    eval_delta: number | null
    classification: string | null
    is_key_moment: boolean
  }>
  analysis: {
    overall_accuracy: number
    opening_accuracy: number | null
    middlegame_accuracy: number | null
    endgame_accuracy: number | null
    claude_narrative: string
    calibration_level_used: number
    key_moment_move_ply: number | null
    key_moment_explanation: string | null
  }
  causal_chains: Array<{
    root_move_ply: number
    root_move_san: string
    root_move_explanation: string
    terminal_blunder_ply: number
    terminal_blunder_san: string
    terminal_blunder_explanation: string
    chain_explanation: string
    nodes: Array<{
      move_ply: number
      move_san: string
      explanation: string
      order_index: number
    }>
  }>
  patterns: DetectedPattern[]
  root_cause_records: RootCauseRecord[]
  training_positions: TrainingPositionRow[]
}

function extractPositions(pgn: string): Array<{ ply: number; san: string; fen_before: string; fen_after: string }> | null {
  const chess = new Chess()
  try {
    chess.loadPgn(pgn)
  } catch {
    return null
  }

  const history = chess.history({ verbose: true })
  const positions: Array<{ ply: number; san: string; fen_before: string; fen_after: string }> = []

  const replayChess = new Chess()
  for (let i = 0; i < history.length; i++) {
    const move = history[i]
    if (!move) continue
    const fenBefore = replayChess.fen()
    replayChess.move(move.san)
    const fenAfter = replayChess.fen()
    positions.push({
      ply: i + 1,
      san: move.san,
      fen_before: fenBefore,
      fen_after: fenAfter,
    })
  }

  return positions
}

const STABLE_CP = -50
const ROOT_MIN_LOSS_CP = 50
const INTERMEDIATE_MIN_LOSS_CP = 20
const MAX_LOOKBACK_PLIES = 60

export function detectCausalChains(
  moves: EvaluatedMove[],
  userColor: 'white' | 'black'
): GameAnalysisData['causal_chains'] {
  const chains: GameAnalysisData['causal_chains'] = []
  const byPly = new Map<number, EvaluatedMove>(moves.map(m => [m.ply, m]))

  const isUserPly = (ply: number) =>
    userColor === 'white' ? ply % 2 === 1 : ply % 2 === 0
  const userEval = (whitePerspectiveCp: number) =>
    userColor === 'white' ? whitePerspectiveCp : -whitePerspectiveCp

  const userBlunders = moves.filter(
    m => m.classification === 'blunder' && isUserPly(m.ply)
  )

  for (const blunder of userBlunders) {
    let rootMove: EvaluatedMove | null = null
    const declineMoves: EvaluatedMove[] = []

    for (let ply = blunder.ply - 1; ply >= Math.max(3, blunder.ply - MAX_LOOKBACK_PLIES); ply--) {
      if (!isUserPly(ply)) continue
      const candidate = byPly.get(ply)
      if (!candidate) continue

      const lostCp = candidate.eval_delta
      const stableBefore = userEval(candidate.eval_before) >= STABLE_CP
      const stableAfter = userEval(candidate.eval_after) >= STABLE_CP

      if (lostCp > ROOT_MIN_LOSS_CP) {
        rootMove = candidate
        if (stableBefore) break
      } else if (stableAfter) {
        break
      } else if (lostCp > INTERMEDIATE_MIN_LOSS_CP) {
        declineMoves.push(candidate)
      }
    }

    if (!rootMove || rootMove.ply <= 2 || rootMove.ply === blunder.ply) continue

    const intermediates = declineMoves
      .filter(m => m.ply > rootMove!.ply)
      .sort((a, b) => a.ply - b.ply)

    const moveNum = (ply: number) => `move ${Math.ceil(ply / 2)}`

    chains.push({
      root_move_ply: rootMove.ply,
      root_move_san: rootMove.san,
      root_move_explanation: `${rootMove.san} at ${moveNum(rootMove.ply)} began the decline (${(rootMove.eval_delta / 100).toFixed(1)} pawn loss)`,
      terminal_blunder_ply: blunder.ply,
      terminal_blunder_san: blunder.san,
      terminal_blunder_explanation: `${blunder.san} at ${moveNum(blunder.ply)} was the decisive mistake (${(blunder.eval_delta / 100).toFixed(1)} pawn loss)`,
      chain_explanation: `The position was compromised at ${moveNum(rootMove.ply)} (${rootMove.san}), which led to the blunder ${blunder.san} at ${moveNum(blunder.ply)}.`,
      nodes: intermediates.map((m, idx) => ({
        move_ply: m.ply,
        move_san: m.san,
        explanation: `${m.san} continued the deterioration`,
        order_index: idx,
      })),
    })
  }

  return chains
}

function computeAccuracy(moves: EvaluatedMove[]): number {
  if (!moves.length) return 100
  const blunders = moves.filter(m => m.classification === 'blunder').length
  const mistakes = moves.filter(m => m.classification === 'mistake').length
  const inaccuracies = moves.filter(m => m.classification === 'inaccuracy').length
  return Math.max(0, Math.round(100 - (blunders * 3 + mistakes * 1.5 + inaccuracies * 0.5) / moves.length * 100))
}

export async function buildGameAnalysis(
  game: GameRecord,
  calibrationLevel: number
): Promise<GameAnalysisData> {
  console.log(`Building analysis for game ${game.id}...`)

  const positions = extractPositions(game.pgn)
  if (!positions) {
    throw new Error(`PGN parse failed for game ${game.id}`)
  }

  console.log(`Evaluating ${positions.length} positions...`)
  const evaluatedMoves = await evaluateGame(positions)

  const moveData = evaluatedMoves.map(m => ({
    ply_number: m.ply,
    san: m.san,
    fen_before: m.fen_before,
    fen_after: m.fen_after,
    eval_before: m.eval_before,
    eval_after: m.eval_after,
    eval_delta: m.eval_delta,
    classification: m.classification,
    is_key_moment: m.classification === 'blunder' || m.classification === 'mistake',
  }))

  const causalChains = detectCausalChains(evaluatedMoves, game.user_color)

  const openingMoves = evaluatedMoves.filter(m => m.ply <= 30)
  const midMoves = evaluatedMoves.filter(m => m.ply > 30 && m.ply <= 60)
  const endMoves = evaluatedMoves.filter(m => m.ply > 60)

  const overallAccuracy = computeAccuracy(evaluatedMoves)

  const { narrative, keyMomentExplanation } = await generateGameReview(
    {
      white: '',
      black: '',
      result: game.result,
      userColor: game.user_color,
      moves: evaluatedMoves,
    },
    causalChains.map(c => ({
      rootMovePly: c.root_move_ply,
      rootMoveSan: c.root_move_san,
      rootMoveExplanation: c.root_move_explanation,
      terminalBlunderPly: c.terminal_blunder_ply,
      terminalBlunderSan: c.terminal_blunder_san,
      terminalBlunderExplanation: c.terminal_blunder_explanation,
      chainExplanation: c.chain_explanation,
      intermediateNodes: c.nodes.map(n => ({
        ply: n.move_ply,
        san: n.move_san,
        explanation: n.explanation,
        orderIndex: n.order_index,
      })),
    })),
    calibrationLevel
  )

  const patterns = detectGamePatterns(evaluatedMoves, game.user_color)

  const movesByPly = new Map(evaluatedMoves.map(m => [m.ply, m]))
  const userEval = (whitePerspectiveCp: number) =>
    game.user_color === 'white' ? whitePerspectiveCp : -whitePerspectiveCp
  const rootCauseRecords: RootCauseRecord[] = causalChains.map(chain => {
    const blunderMove = movesByPly.get(chain.terminal_blunder_ply)
    const rootMove = movesByPly.get(chain.root_move_ply)
    const rootBaseCp =
      rootMove && isMateMissWhileWinning(rootMove.eval_before, rootMove.eval_after, game.user_color)
        ? rootMove.eval_after
        : rootMove?.eval_before ?? 0
    const chainSwingCp =
      rootMove && blunderMove ? Math.round(userEval(rootBaseCp) - userEval(blunderMove.eval_after)) : 0
    const tag = primaryTagForChainRoot(
      evaluatedMoves,
      game.user_color,
      {
        rootPly: chain.root_move_ply,
        chainSwingCp,
        intermediateNodeCount: chain.nodes.length,
      },
      patterns
    )
    const swing =
      blunderMove && isMateMissWhileWinning(blunderMove.eval_before, blunderMove.eval_after, game.user_color)
        ? 0
        : blunderMove?.eval_delta ?? 0
    return {
      gameId: game.id,
      blunderSan: chain.terminal_blunder_san,
      blunderPly: chain.terminal_blunder_ply,
      evalSwingCp: Math.round(swing),
      rootSan: chain.root_move_san,
      rootPly: chain.root_move_ply,
      patternTag: tag?.tag ?? null,
      patternLabel: tag?.label ?? null,
      chainPlies: [
        chain.root_move_ply,
        ...chain.nodes.map(n => n.move_ply),
        chain.terminal_blunder_ply,
      ],
    }
  })

  const trainingPositions = buildTrainingPositions(
    game.id,
    evaluatedMoves,
    game.user_color,
    rootCauseRecords.map(r => ({
      rootPly: r.rootPly,
      terminalPly: r.blunderPly,
      tag: r.patternTag,
    })),
    { engine: engineLabel(), depth: DEFAULT_DEPTH }
  )

  return {
    gameId: game.id,
    moves: moveData,
    analysis: {
      overall_accuracy: overallAccuracy,
      opening_accuracy: openingMoves.length ? computeAccuracy(openingMoves) : null,
      middlegame_accuracy: midMoves.length ? computeAccuracy(midMoves) : null,
      endgame_accuracy: endMoves.length ? computeAccuracy(endMoves) : null,
      claude_narrative: narrative,
      calibration_level_used: calibrationLevel,
      key_moment_move_ply: causalChains[0]?.terminal_blunder_ply ?? null,
      key_moment_explanation: keyMomentExplanation,
    },
    causal_chains: causalChains,
    patterns,
    root_cause_records: rootCauseRecords,
    training_positions: trainingPositions,
  }
}

export async function saveGameAnalysis(
  supabase: SupabaseClient,
  userId: string,
  data: GameAnalysisData
): Promise<void> {
  const fail = (step: string, message: string): never => {
    throw new Error(`Saving game ${data.gameId} failed at ${step}: ${message}`)
  }
  const check = (step: string, error: { message: string } | null) => {
    if (error) fail(step, error.message)
  }

  check('delete moves', (await supabase.from('moves').delete().eq('game_id', data.gameId)).error)
  check('delete game_analyses', (await supabase.from('game_analyses').delete().eq('game_id', data.gameId)).error)

  if (data.moves.length > 0) {
    const { error } = await supabase.from('moves').insert(data.moves.map(m => ({ ...m, game_id: data.gameId })))
    check('insert moves', error)
  }

  const { data: gameAnalysis, error: analysisError } = await supabase
    .from('game_analyses')
    .insert({
      game_id: data.gameId,
      user_id: userId,
      ...data.analysis,
    })
    .select()
    .single()
  check('insert game_analyses', analysisError)
  if (!gameAnalysis) return fail('insert game_analyses', 'no row returned')

  for (const chain of data.causal_chains) {
    const { data: chainRecord, error: chainError } = await supabase
      .from('causal_chains')
      .insert({
        game_analysis_id: gameAnalysis.id,
        root_move_ply: chain.root_move_ply,
        root_move_san: chain.root_move_san,
        root_move_explanation: chain.root_move_explanation,
        terminal_blunder_ply: chain.terminal_blunder_ply,
        terminal_blunder_san: chain.terminal_blunder_san,
        terminal_blunder_explanation: chain.terminal_blunder_explanation,
        chain_explanation: chain.chain_explanation,
      })
      .select()
      .single()
    check(`insert causal_chains (root ply ${chain.root_move_ply})`, chainError)
    if (!chainRecord) return fail(`insert causal_chains (root ply ${chain.root_move_ply})`, 'no row returned')

    if (chain.nodes.length > 0) {
      const { error: nodeError } = await supabase.from('causal_chain_nodes').insert(
        chain.nodes.map(n => ({
          causal_chain_id: chainRecord.id,
          move_ply: n.move_ply,
          move_san: n.move_san,
          explanation: n.explanation,
          order_index: n.order_index,
        }))
      )
      check(`insert causal_chain_nodes (root ply ${chain.root_move_ply})`, nodeError)
    }
  }

  if (data.training_positions.length > 0) {
    const { error: tpError } = await supabase
      .from('training_positions')
      .upsert(data.training_positions, { onConflict: 'game_id,root_ply' })
    check('upsert training_positions', tpError)
  }

  const { data: marked, error: markError } = await supabase
    .from('games')
    .update({ is_analyzed: true })
    .eq('id', data.gameId)
    .select('id')
  check('mark is_analyzed', markError)
  if (!marked || marked.length !== 1) fail('mark is_analyzed', `${marked?.length ?? 0} rows updated, expected 1`)
}

export async function processGame(
  supabase: SupabaseClient,
  game: GameRecord,
  calibrationLevel: number,
  _jobId: string
): Promise<{
  patterns: DetectedPattern[]
  overallAccuracy: number
  rootCauseRecords: RootCauseRecord[]
}> {
  const data = await buildGameAnalysis(game, calibrationLevel)
  await saveGameAnalysis(supabase, game.user_id, data)
  return {
    patterns: data.patterns,
    overallAccuracy: data.analysis.overall_accuracy,
    rootCauseRecords: data.root_cause_records,
  }
}
