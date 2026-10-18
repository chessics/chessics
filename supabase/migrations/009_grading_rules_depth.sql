BEGIN;

ALTER TABLE interactions DROP CONSTRAINT IF EXISTS interactions_grading_complete;

ALTER TABLE interactions
  ADD CONSTRAINT interactions_grading_complete
  CHECK (
    (chosen_eval_cp IS NULL AND best_eval_cp IS NULL AND grading_engine IS NULL AND grading_depth IS NULL)
    OR
    (chosen_eval_cp IS NOT NULL AND best_eval_cp IS NOT NULL AND grading_engine IS NOT NULL
      AND grading_depth IS NOT NULL AND chosen_move IS NOT NULL
      AND (grading_depth > 0 OR (grading_depth = 0 AND grading_engine = 'rules')))
  );

COMMIT;
