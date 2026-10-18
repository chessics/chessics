export type Platform = 'chess_com' | 'lichess' | 'upload'
export type Color = 'white' | 'black'
export type Result = 'win' | 'loss' | 'draw'
export type MoveClassification = 'blunder' | 'mistake' | 'inaccuracy' | 'good' | 'excellent' | 'brilliant'
export type JobStatus = 'queued' | 'processing' | 'complete' | 'failed'
export type Trajectory = 'improving' | 'stable' | 'declining'
export type PuzzleSource = 'lichess' | 'own_game'

export interface Profile {
  id: string
  username: string | null
  chess_com_username: string | null
  lichess_username: string | null
  current_rating: number | null
  calibration_level: number
  preferred_calibration_override: number | null
  created_at: string
}

export interface SyncAccount {
  id: string
  user_id: string
  platform: 'chess_com' | 'lichess'
  username: string
  last_synced_at: string | null
  total_games_synced: number
  created_at: string
}

export interface Game {
  id: string
  user_id: string
  pgn: string
  platform: Platform
  platform_game_id: string | null
  played_at: string | null
  time_control: string | null
  opening_name: string | null
  opening_eco: string | null
  user_color: Color | null
  opponent_username: string | null
  result: Result | null
  user_rating_at_time: number | null
  opponent_rating_at_time: number | null
  is_analyzed: boolean
  created_at: string
}

export interface Move {
  id: string
  game_id: string
  ply_number: number
  san: string
  fen_before: string
  fen_after: string
  eval_before: number | null
  eval_after: number | null
  eval_delta: number | null
  classification: MoveClassification | null
  causal_chain_id: string | null
  is_key_moment: boolean
}

export interface AnalysisJob {
  id: string
  user_id: string
  game_id: string
  status: JobStatus
  error_message: string | null
  queued_at: string
  started_at: string | null
  completed_at: string | null
}

export interface GameAnalysis {
  id: string
  game_id: string
  user_id: string
  overall_accuracy: number | null
  opening_accuracy: number | null
  middlegame_accuracy: number | null
  endgame_accuracy: number | null
  claude_narrative: string | null
  calibration_level_used: number | null
  key_moment_move_ply: number | null
  key_moment_explanation: string | null
  created_at: string
}

export interface CausalChain {
  id: string
  game_analysis_id: string
  root_move_ply: number
  root_move_san: string
  root_move_explanation: string
  terminal_blunder_ply: number
  terminal_blunder_san: string
  terminal_blunder_explanation: string
  chain_explanation: string
}

export interface CausalChainNode {
  id: string
  causal_chain_id: string
  move_ply: number
  move_san: string
  explanation: string
  piece_type: string | null
  order_index: number
}

export interface PatternBatchSnapshot {
  batch_report_id: string
  frequency: number
  occurrences: number
  total_cp: number
  avg_cp: number
  game_count: number
  at: string
}

export interface UserPattern {
  id: string
  user_id: string
  pattern_type: string
  pattern_label: string
  frequency_count: number
  elo_cost_estimate: number
  success_rate: number
  trajectory: Trajectory
  urgency_score: number
  batch_history: PatternBatchSnapshot[]
  first_detected_at: string
  last_detected_at: string
  last_surfaced_at: string | null
}

export interface GamePattern {
  id: string
  game_id: string
  user_pattern_id: string
  move_ply: number | null
  context: string | null
}

export interface BatchPatternGroup {
  tag: string
  label: string
  gameIds: string[]
  frequency: number
  occurrences: number
  totalCp: number
  avgCp: number
  score: number
  recurring: boolean
  insight: string | null
  exhibit: {
    gameId: string
    rootPly: number
    rootSan: string
    blunderPly: number
    blunderSan: string
    swingCp: number
  }
}

export interface BatchReport {
  id: string
  user_id: string
  game_count: number
  calibration_level_used: number
  claude_narrative: string | null
  overall_accuracy: number | null
  accuracy_delta: number | null
  pattern_groups: BatchPatternGroup[]
  game_ids: string[]
  generated_at: string
}

export interface Puzzle {
  id: string
  user_pattern_id: string
  source: PuzzleSource
  lichess_puzzle_id: string | null
  source_game_id: string | null
  source_move_ply: number | null
  fen: string
  solution_moves: string[]
  difficulty: number | null
  context_note: string | null
}

export interface PuzzleAttempt {
  id: string
  user_id: string
  puzzle_id: string
  correct: boolean
  time_taken_seconds: number | null
  attempted_at: string
}

export interface PuzzleSchedule {
  id: string
  user_id: string
  puzzle_id: string
  next_due_at: string
  interval_days: number
  ease_factor: number
}

export interface PuzzleFeedback {
  id: string
  user_id: string
  puzzle_id: string
  flagged_bad: boolean
  created_at: string
}

export interface OpeningLine {
  id: string
  eco_code: string | null
  name: string
  variation: string | null
  white_concept: string
  black_concept: string
  light_theory_moves: string[] | null
  created_at: string
}

export interface UserOpening {
  id: string
  user_id: string
  opening_line_id: string | null
  color: Color | null
  win_count: number
  loss_count: number
  draw_count: number
  accuracy_trend: Trajectory
  last_played_at: string | null
  gap_analysis: string | null
}

export interface AnalysisSession {
  id: string
  user_id: string
  batch_report_id: string | null
  pre_signup_session_token: string | null
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & { id: string }; Update: Partial<Profile> }
      sync_accounts: { Row: SyncAccount; Insert: Omit<SyncAccount, 'id' | 'created_at'>; Update: Partial<SyncAccount> }
      games: { Row: Game; Insert: Omit<Game, 'id' | 'created_at'>; Update: Partial<Game> }
      moves: { Row: Move; Insert: Omit<Move, 'id'>; Update: Partial<Move> }
      analysis_jobs: { Row: AnalysisJob; Insert: Omit<AnalysisJob, 'id' | 'queued_at'>; Update: Partial<AnalysisJob> }
      game_analyses: { Row: GameAnalysis; Insert: Omit<GameAnalysis, 'id' | 'created_at'>; Update: Partial<GameAnalysis> }
      causal_chains: { Row: CausalChain; Insert: Omit<CausalChain, 'id'>; Update: Partial<CausalChain> }
      causal_chain_nodes: { Row: CausalChainNode; Insert: Omit<CausalChainNode, 'id'>; Update: Partial<CausalChainNode> }
      user_patterns: { Row: UserPattern; Insert: Omit<UserPattern, 'id' | 'first_detected_at' | 'last_detected_at'>; Update: Partial<UserPattern> }
      game_patterns: { Row: GamePattern; Insert: Omit<GamePattern, 'id'>; Update: Partial<GamePattern> }
      batch_reports: { Row: BatchReport; Insert: Omit<BatchReport, 'id' | 'generated_at'>; Update: Partial<BatchReport> }
      puzzles: { Row: Puzzle; Insert: Omit<Puzzle, 'id'>; Update: Partial<Puzzle> }
      puzzle_attempts: { Row: PuzzleAttempt; Insert: Omit<PuzzleAttempt, 'id' | 'attempted_at'>; Update: Partial<PuzzleAttempt> }
      puzzle_schedules: { Row: PuzzleSchedule; Insert: Omit<PuzzleSchedule, 'id'>; Update: Partial<PuzzleSchedule> }
      puzzle_feedback: { Row: PuzzleFeedback; Insert: Omit<PuzzleFeedback, 'id' | 'created_at'>; Update: Partial<PuzzleFeedback> }
      opening_lines: { Row: OpeningLine; Insert: Omit<OpeningLine, 'id' | 'created_at'>; Update: Partial<OpeningLine> }
      user_openings: { Row: UserOpening; Insert: Omit<UserOpening, 'id'>; Update: Partial<UserOpening> }
      analysis_sessions: { Row: AnalysisSession; Insert: Omit<AnalysisSession, 'id' | 'created_at'>; Update: Partial<AnalysisSession> }
    }
  }
}
