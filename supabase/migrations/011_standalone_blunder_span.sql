BEGIN;

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'training_positions'::regclass
      AND contype = 'c'
      AND conname <> 'training_positions_span_even'
      AND pg_get_constraintdef(oid) ~ 'span_plies >= 1'
  LOOP
    EXECUTE format('ALTER TABLE training_positions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE training_positions DROP CONSTRAINT IF EXISTS training_positions_span_even;

ALTER TABLE training_positions
  ADD CONSTRAINT training_positions_span_even
  CHECK (span_plies = 0 OR (span_plies >= 2 AND span_plies % 2 = 0));

COMMIT;
