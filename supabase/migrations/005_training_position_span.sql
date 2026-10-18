ALTER TABLE training_positions
  ADD COLUMN IF NOT EXISTS span_plies INTEGER CHECK (span_plies >= 1);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM training_positions WHERE span_plies IS NULL) THEN
    ALTER TABLE training_positions ALTER COLUMN span_plies SET NOT NULL;
  ELSE
    RAISE NOTICE
      'span_plies left NULLABLE: % row(s) predate this column. Re-run analysis to repopulate, then: ALTER TABLE training_positions ALTER COLUMN span_plies SET NOT NULL;',
      (SELECT count(*) FROM training_positions WHERE span_plies IS NULL);
  END IF;
END $$;
