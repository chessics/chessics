CREATE TABLE IF NOT EXISTS training_positions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  root_ply INTEGER NOT NULL CHECK (root_ply >= 1),

  fen TEXT NOT NULL,
  side_to_move TEXT NOT NULL CHECK (side_to_move IN ('white', 'black')),

  root_move_san TEXT NOT NULL,

  tag TEXT,

  best_move TEXT,
  best_move_san TEXT,
  pv TEXT[] NOT NULL DEFAULT '{}',
  eval_cp INTEGER,

  refutation_line TEXT[] NOT NULL DEFAULT '{}',
  refutation_evals INTEGER[] NOT NULL DEFAULT '{}',

  time_floor_ms INTEGER NOT NULL DEFAULT 5000 CHECK (time_floor_ms > 0),

  engine TEXT,
  depth INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT refutation_arrays_aligned
    CHECK (cardinality(refutation_line) = cardinality(refutation_evals)),

  CONSTRAINT refutation_line_max_8
    CHECK (cardinality(refutation_line) <= 8)
);

CREATE UNIQUE INDEX IF NOT EXISTS training_positions_game_ply_idx
  ON training_positions (game_id, root_ply);

CREATE INDEX IF NOT EXISTS training_positions_tag_idx
  ON training_positions (tag);

ALTER TABLE training_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own training positions" ON training_positions;
CREATE POLICY "Users can view own training positions" ON training_positions FOR SELECT USING (
  EXISTS (SELECT 1 FROM games WHERE games.id = training_positions.game_id AND games.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can insert own training positions" ON training_positions;
CREATE POLICY "Users can insert own training positions" ON training_positions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM games WHERE games.id = training_positions.game_id AND games.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can update own training positions" ON training_positions;
CREATE POLICY "Users can update own training positions" ON training_positions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM games WHERE games.id = training_positions.game_id AND games.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can delete own training positions" ON training_positions;
CREATE POLICY "Users can delete own training positions" ON training_positions FOR DELETE USING (
  EXISTS (SELECT 1 FROM games WHERE games.id = training_positions.game_id AND games.user_id = auth.uid())
);

ALTER TABLE interactions
  DROP CONSTRAINT IF EXISTS interactions_position_id_fkey;

ALTER TABLE interactions
  ADD CONSTRAINT interactions_position_id_fkey
  FOREIGN KEY (position_id) REFERENCES training_positions(id) ON DELETE CASCADE;
