CREATE TABLE IF NOT EXISTS play_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  start_ply INTEGER NOT NULL CHECK (start_ply >= 0),
  start_fen TEXT NOT NULL,
  user_color TEXT NOT NULL CHECK (user_color IN ('white', 'black')),
  engine TEXT NOT NULL CHECK (engine IN ('fake', 'maia2')),
  opponent_elo INTEGER NOT NULL,
  user_elo INTEGER NOT NULL,
  user_clock_ms INTEGER CHECK (user_clock_ms >= 0),
  opponent_clock_ms INTEGER CHECK (opponent_clock_ms >= 0),
  increment_ms INTEGER CHECK (increment_ms >= 0),
  clock_source TEXT CHECK (clock_source IN ('pgn', 'time_control')),
  moves JSONB NOT NULL CHECK (jsonb_typeof(moves) = 'array'),
  outcome TEXT NOT NULL CHECK (outcome IN (
    'win_mate', 'win_time',
    'loss_mate', 'loss_time',
    'resigned',
    'draw_stalemate', 'draw_repetition', 'draw_fifty', 'draw_material',
    'draw_flag_user', 'draw_flag_engine',
    'abandoned'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT play_sessions_clocks_complete CHECK (
    (user_clock_ms IS NULL AND opponent_clock_ms IS NULL AND increment_ms IS NULL AND clock_source IS NULL)
    OR (user_clock_ms IS NOT NULL AND opponent_clock_ms IS NOT NULL AND increment_ms IS NOT NULL AND clock_source IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS play_sessions_user_created_idx ON play_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS play_sessions_game_idx ON play_sessions (game_id, start_ply);

ALTER TABLE play_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own play sessions" ON play_sessions;
CREATE POLICY "Users can view own play sessions" ON play_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own play sessions" ON play_sessions;
CREATE POLICY "Users can insert own play sessions" ON play_sessions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM games WHERE games.id = play_sessions.game_id AND games.user_id = auth.uid())
  );

GRANT SELECT, INSERT ON TABLE public.play_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.play_sessions TO service_role;
