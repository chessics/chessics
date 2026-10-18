export interface GuestGameAnalysisData {
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
  root_cause_records?: Array<{
    gameId: string
    blunderSan: string
    blunderPly: number
    evalSwingCp: number
    rootSan: string
    rootPly: number
    patternTag: string | null
    patternLabel: string | null
    chainPlies: number[]
  }>
  training_positions: GuestTrainingPositionRow[]
}

export interface GuestTrainingPositionRow {
  game_id: string
  root_ply: number
  fen: string
  side_to_move: 'white' | 'black'
  root_move_san: string
  tag: string | null
  best_move: string | null
  best_move_san: string | null
  pv: string[]
  eval_cp: number | null
  refutation_line: string[]
  refutation_evals: number[]
  span_plies: number
  time_floor_ms: number
  engine: string
  depth: number
}

export interface GuestGameResult {
  pgn: string
  platform: string
  platform_game_id: string | null
  played_at: string | null
  time_control: string | null
  opening_name: string | null
  opening_eco: string | null
  user_color: 'white' | 'black'
  opponent_username: string | null
  result: 'win' | 'loss' | 'draw'
  user_rating_at_time: number | null
  opponent_rating_at_time: number | null
  analysis_data: GuestGameAnalysisData
}

import type { BatchPatternGroup } from '@/lib/supabase/types'

export interface GuestSessionResult {
  sessionToken: string
  platform: string
  calibration_level: number
  games: GuestGameResult[]
  pattern_groups: BatchPatternGroup[]
  batch_report: {
    game_count: number
    calibration_level_used: number
    claude_narrative: string
    verdict: string
    overall_accuracy: number
    game_ids: string[]
  }
}
