-- Nullable for legacy evidence: never infer a missing historical scope.
ALTER TABLE public.tiktok_compass_tasks
  ADD COLUMN IF NOT EXISTS recovery_context jsonb,
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

COMMENT ON COLUMN public.tiktok_compass_tasks.recovery_context IS
  'Exact non-secret connection and request context for task recovery. NULL legacy rows cannot resume.';
COMMENT ON COLUMN public.tiktok_compass_tasks.lease_token IS
  'Invocation ownership token; compare on every update to prevent stale workers changing a recovered task.';
