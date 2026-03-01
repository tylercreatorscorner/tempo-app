-- Add validation columns to pipeline_runs
ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS validation_status text CHECK (validation_status IN ('passed', 'warning', 'failed')),
  ADD COLUMN IF NOT EXISTS validation_details jsonb;

COMMENT ON COLUMN pipeline_runs.validation_status IS 'Result of automated post-push validation';
COMMENT ON COLUMN pipeline_runs.validation_details IS 'Detailed validation check results (JSON)';
