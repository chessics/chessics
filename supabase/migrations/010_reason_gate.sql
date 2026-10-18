BEGIN;

ALTER TABLE interactions ADD COLUMN IF NOT EXISTS best_serves_goal BOOLEAN;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS chosen_serves_goal BOOLEAN;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS reason_diagnosis TEXT;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS reason_checks JSONB;

ALTER TABLE interactions DROP CONSTRAINT IF EXISTS interactions_declared_goal_values;
ALTER TABLE interactions
  ADD CONSTRAINT interactions_declared_goal_values
  CHECK (
    declared_goal IS NULL
    OR declared_goal IN ('wins_material', 'stops_threat', 'makes_threat', 'improves_worst_piece')
  );

ALTER TABLE interactions DROP CONSTRAINT IF EXISTS interactions_goal_timing;
ALTER TABLE interactions
  ADD CONSTRAINT interactions_goal_timing
  CHECK (declared_goal IS NULL OR goal_before_move IS NOT NULL);

ALTER TABLE interactions DROP CONSTRAINT IF EXISTS interactions_reason_diagnosis_values;
ALTER TABLE interactions
  ADD CONSTRAINT interactions_reason_diagnosis_values
  CHECK (
    reason_diagnosis IS NULL
    OR reason_diagnosis IN ('clean', 'execution_gap', 'misread', 'incoherent', 'right_move_wrong_reason')
  );

ALTER TABLE interactions DROP CONSTRAINT IF EXISTS interactions_reason_complete;
ALTER TABLE interactions
  ADD CONSTRAINT interactions_reason_complete
  CHECK (
    (reason_checks IS NULL AND best_serves_goal IS NULL AND chosen_serves_goal IS NULL AND reason_diagnosis IS NULL)
    OR
    (reason_checks IS NOT NULL AND declared_goal IS NOT NULL AND chosen_move IS NOT NULL
      AND (
        reason_diagnosis IS NULL
        OR (reason_diagnosis = 'clean'
            AND best_serves_goal IS TRUE AND chosen_serves_goal IS TRUE AND correct IS TRUE)
        OR (reason_diagnosis = 'execution_gap'
            AND best_serves_goal IS TRUE AND chosen_serves_goal IS TRUE AND correct IS FALSE)
        OR (reason_diagnosis = 'misread'
            AND best_serves_goal IS FALSE AND chosen_serves_goal IS TRUE AND correct IS FALSE)
        OR (reason_diagnosis = 'incoherent'
            AND best_serves_goal IS TRUE AND chosen_serves_goal IS FALSE AND correct IS FALSE)
        OR (reason_diagnosis = 'right_move_wrong_reason'
            AND best_serves_goal IS FALSE AND chosen_serves_goal IS FALSE AND correct IS TRUE)
      ))
  );

COMMIT;
