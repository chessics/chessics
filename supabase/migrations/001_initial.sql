CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  username TEXT,
  chess_com_username TEXT,
  lichess_username TEXT,
  current_rating INTEGER,
  calibration_level INTEGER DEFAULT 2 CHECK (calibration_level >= 0 AND calibration_level <= 4),
  preferred_calibration_override INTEGER CHECK (preferred_calibration_override >= 0 AND preferred_calibration_override <= 4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sync_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  platform TEXT CHECK (platform IN ('chess_com', 'lichess')),
  username TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ,
  total_games_synced INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  pgn TEXT NOT NULL,
  platform TEXT CHECK (platform IN ('chess_com', 'lichess', 'upload')),
  platform_game_id TEXT,
  played_at TIMESTAMPTZ,
  time_control TEXT,
  opening_name TEXT,
  opening_eco TEXT,
  user_color TEXT CHECK (user_color IN ('white', 'black')),
  opponent_username TEXT,
  result TEXT CHECK (result IN ('win', 'loss', 'draw')),
  user_rating_at_time INTEGER,
  opponent_rating_at_time INTEGER,
  is_analyzed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform, platform_game_id, user_id)
);

CREATE TABLE moves (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  ply_number INTEGER NOT NULL,
  san TEXT NOT NULL,
  fen_before TEXT NOT NULL,
  fen_after TEXT NOT NULL,
  eval_before DECIMAL,
  eval_after DECIMAL,
  eval_delta DECIMAL,
  classification TEXT CHECK (classification IN ('blunder', 'mistake', 'inaccuracy', 'good', 'excellent', 'brilliant')),
  causal_chain_id UUID,
  is_key_moment BOOLEAN DEFAULT FALSE
);

CREATE TABLE analysis_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('queued', 'processing', 'complete', 'failed')) DEFAULT 'queued',
  error_message TEXT,
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE game_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE UNIQUE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  overall_accuracy DECIMAL,
  opening_accuracy DECIMAL,
  middlegame_accuracy DECIMAL,
  endgame_accuracy DECIMAL,
  claude_narrative TEXT,
  calibration_level_used INTEGER,
  key_moment_move_ply INTEGER,
  key_moment_explanation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE causal_chains (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_analysis_id UUID REFERENCES game_analyses(id) ON DELETE CASCADE,
  root_move_ply INTEGER NOT NULL,
  root_move_san TEXT NOT NULL,
  root_move_explanation TEXT NOT NULL,
  terminal_blunder_ply INTEGER NOT NULL,
  terminal_blunder_san TEXT NOT NULL,
  terminal_blunder_explanation TEXT NOT NULL,
  chain_explanation TEXT NOT NULL
);

CREATE TABLE causal_chain_nodes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  causal_chain_id UUID REFERENCES causal_chains(id) ON DELETE CASCADE,
  move_ply INTEGER NOT NULL,
  move_san TEXT NOT NULL,
  explanation TEXT NOT NULL,
  piece_type TEXT,
  order_index INTEGER NOT NULL
);

CREATE TABLE user_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  pattern_type TEXT NOT NULL,
  pattern_label TEXT NOT NULL,
  frequency_count INTEGER DEFAULT 1,
  elo_cost_estimate INTEGER DEFAULT 0,
  success_rate DECIMAL DEFAULT 0,
  trajectory TEXT CHECK (trajectory IN ('improving', 'stable', 'declining')) DEFAULT 'stable',
  urgency_score DECIMAL DEFAULT 0,
  first_detected_at TIMESTAMPTZ DEFAULT NOW(),
  last_detected_at TIMESTAMPTZ DEFAULT NOW(),
  last_surfaced_at TIMESTAMPTZ
);

CREATE TABLE game_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  user_pattern_id UUID REFERENCES user_patterns(id) ON DELETE CASCADE,
  move_ply INTEGER,
  context TEXT
);

CREATE TABLE batch_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  game_count INTEGER NOT NULL,
  calibration_level_used INTEGER NOT NULL,
  claude_narrative TEXT,
  overall_accuracy DECIMAL,
  accuracy_delta DECIMAL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE puzzles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_pattern_id UUID REFERENCES user_patterns(id) ON DELETE CASCADE,
  source TEXT CHECK (source IN ('lichess', 'own_game')) NOT NULL,
  lichess_puzzle_id TEXT,
  source_game_id UUID REFERENCES games(id),
  source_move_ply INTEGER,
  fen TEXT NOT NULL,
  solution_moves TEXT[] NOT NULL,
  difficulty INTEGER,
  context_note TEXT
);

CREATE TABLE puzzle_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  puzzle_id UUID REFERENCES puzzles(id) ON DELETE CASCADE,
  correct BOOLEAN NOT NULL,
  time_taken_seconds INTEGER,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE puzzle_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  puzzle_id UUID REFERENCES puzzles(id) ON DELETE CASCADE,
  next_due_at TIMESTAMPTZ DEFAULT NOW(),
  interval_days INTEGER DEFAULT 1,
  ease_factor DECIMAL DEFAULT 2.5,
  UNIQUE(user_id, puzzle_id)
);

CREATE TABLE puzzle_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  puzzle_id UUID REFERENCES puzzles(id) ON DELETE CASCADE,
  flagged_bad BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE opening_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  eco_code TEXT,
  name TEXT NOT NULL,
  variation TEXT,
  white_concept TEXT NOT NULL,
  black_concept TEXT NOT NULL,
  light_theory_moves TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_openings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  opening_line_id UUID REFERENCES opening_lines(id),
  color TEXT CHECK (color IN ('white', 'black')),
  win_count INTEGER DEFAULT 0,
  loss_count INTEGER DEFAULT 0,
  draw_count INTEGER DEFAULT 0,
  accuracy_trend TEXT CHECK (accuracy_trend IN ('improving', 'stable', 'declining')) DEFAULT 'stable',
  last_played_at TIMESTAMPTZ,
  gap_analysis TEXT
);

CREATE TABLE analysis_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  batch_report_id UUID REFERENCES batch_reports(id),
  pre_signup_session_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE causal_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE causal_chain_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE puzzle_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE puzzle_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE puzzle_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE opening_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can manage own sync accounts" ON sync_accounts FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own games" ON games FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own moves" ON moves FOR SELECT USING (
  EXISTS (SELECT 1 FROM games WHERE games.id = moves.game_id AND games.user_id = auth.uid())
);
CREATE POLICY "Users can insert own moves" ON moves FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM games WHERE games.id = moves.game_id AND games.user_id = auth.uid())
);
CREATE POLICY "Users can delete own moves" ON moves FOR DELETE USING (
  EXISTS (SELECT 1 FROM games WHERE games.id = moves.game_id AND games.user_id = auth.uid())
);

CREATE POLICY "Users can manage own analysis jobs" ON analysis_jobs FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own game analyses" ON game_analyses FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own causal chains" ON causal_chains FOR SELECT USING (
  EXISTS (SELECT 1 FROM game_analyses WHERE game_analyses.id = causal_chains.game_analysis_id AND game_analyses.user_id = auth.uid())
);
CREATE POLICY "Users can insert own causal chains" ON causal_chains FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM game_analyses WHERE game_analyses.id = causal_chains.game_analysis_id AND game_analyses.user_id = auth.uid())
);
CREATE POLICY "Users can delete own causal chains" ON causal_chains FOR DELETE USING (
  EXISTS (SELECT 1 FROM game_analyses WHERE game_analyses.id = causal_chains.game_analysis_id AND game_analyses.user_id = auth.uid())
);

CREATE POLICY "Users can view own causal chain nodes" ON causal_chain_nodes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM causal_chains
    JOIN game_analyses ON game_analyses.id = causal_chains.game_analysis_id
    WHERE causal_chains.id = causal_chain_nodes.causal_chain_id
    AND game_analyses.user_id = auth.uid()
  )
);
CREATE POLICY "Users can insert own causal chain nodes" ON causal_chain_nodes FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM causal_chains
    JOIN game_analyses ON game_analyses.id = causal_chains.game_analysis_id
    WHERE causal_chains.id = causal_chain_nodes.causal_chain_id
    AND game_analyses.user_id = auth.uid()
  )
);
CREATE POLICY "Users can delete own causal chain nodes" ON causal_chain_nodes FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM causal_chains
    JOIN game_analyses ON game_analyses.id = causal_chains.game_analysis_id
    WHERE causal_chains.id = causal_chain_nodes.causal_chain_id
    AND game_analyses.user_id = auth.uid()
  )
);

CREATE POLICY "Users can manage own patterns" ON user_patterns FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own game patterns" ON game_patterns FOR SELECT USING (
  EXISTS (SELECT 1 FROM games WHERE games.id = game_patterns.game_id AND games.user_id = auth.uid())
);
CREATE POLICY "Users can insert own game patterns" ON game_patterns FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM games WHERE games.id = game_patterns.game_id AND games.user_id = auth.uid())
);
CREATE POLICY "Users can delete own game patterns" ON game_patterns FOR DELETE USING (
  EXISTS (SELECT 1 FROM games WHERE games.id = game_patterns.game_id AND games.user_id = auth.uid())
);

CREATE POLICY "Users can manage own batch reports" ON batch_reports FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own puzzles" ON puzzles FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_patterns WHERE user_patterns.id = puzzles.user_pattern_id AND user_patterns.user_id = auth.uid())
);
CREATE POLICY "Users can insert own puzzles" ON puzzles FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_patterns WHERE user_patterns.id = puzzles.user_pattern_id AND user_patterns.user_id = auth.uid())
);
CREATE POLICY "Users can delete own puzzles" ON puzzles FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_patterns WHERE user_patterns.id = puzzles.user_pattern_id AND user_patterns.user_id = auth.uid())
);

CREATE POLICY "Users can manage own puzzle attempts" ON puzzle_attempts FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own puzzle schedules" ON puzzle_schedules FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own puzzle feedback" ON puzzle_feedback FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Opening lines are public" ON opening_lines FOR SELECT USING (true);

CREATE POLICY "Users can manage own openings" ON user_openings FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own analysis sessions" ON analysis_sessions FOR ALL USING (auth.uid() = user_id);
