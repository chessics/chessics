CREATE TABLE IF NOT EXISTS interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  session_id UUID NOT NULL,

  position_id UUID NOT NULL,

  game_id UUID REFERENCES games(id) ON DELETE CASCADE,

  fen TEXT NOT NULL,
  side_to_move TEXT NOT NULL CHECK (side_to_move IN ('white', 'black')),

  drawn_moves JSONB NOT NULL DEFAULT '[]',
  chosen_move TEXT,

  declared_goal TEXT,
  goal_before_move BOOLEAN,

  time_to_commit_ms INTEGER CHECK (time_to_commit_ms >= 0),
  under_floor BOOLEAN NOT NULL DEFAULT FALSE,

  presentation_index INTEGER NOT NULL CHECK (presentation_index >= 0),
  prior_exposures INTEGER NOT NULL CHECK (prior_exposures >= 0),

  correct BOOLEAN,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS interactions_session_presentation_idx
  ON interactions (session_id, presentation_index);

CREATE INDEX IF NOT EXISTS interactions_user_position_idx
  ON interactions (user_id, position_id, created_at);

CREATE INDEX IF NOT EXISTS interactions_user_created_idx
  ON interactions (user_id, created_at DESC);

ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own interactions" ON interactions;
CREATE POLICY "Users can manage own interactions" ON interactions
  FOR ALL USING (auth.uid() = user_id);
