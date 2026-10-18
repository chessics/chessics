ALTER TABLE interactions ADD COLUMN IF NOT EXISTS chosen_eval_cp INTEGER;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS best_eval_cp INTEGER;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS grading_engine TEXT;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS grading_depth INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'interactions'::regclass
      AND conname = 'interactions_grading_complete'
  ) THEN
    ALTER TABLE interactions
      ADD CONSTRAINT interactions_grading_complete
      CHECK (
        (chosen_eval_cp IS NULL AND best_eval_cp IS NULL AND grading_engine IS NULL AND grading_depth IS NULL)
        OR
        (chosen_eval_cp IS NOT NULL AND best_eval_cp IS NOT NULL AND grading_engine IS NOT NULL
          AND grading_depth IS NOT NULL AND grading_depth > 0 AND chosen_move IS NOT NULL)
      );
  ELSE
    RAISE NOTICE 'interactions_grading_complete already present — nothing to do.';
  END IF;
END $$;
