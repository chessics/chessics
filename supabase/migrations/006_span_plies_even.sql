DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'training_positions'::regclass
      AND conname = 'training_positions_span_even'
  ) THEN
    ALTER TABLE training_positions
      ADD CONSTRAINT training_positions_span_even
      CHECK (span_plies >= 2 AND span_plies % 2 = 0);
  ELSE
    RAISE NOTICE 'training_positions_span_even already present — nothing to do.';
  END IF;
END $$;
