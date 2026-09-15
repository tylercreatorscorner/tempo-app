ALTER TABLE public.tiktok_compass_tasks
  ADD COLUMN IF NOT EXISTS retry_not_before timestamptz,
  ADD COLUMN IF NOT EXISTS retry_reason text,
  ADD COLUMN IF NOT EXISTS upstream_status integer,
  ADD COLUMN IF NOT EXISTS upstream_code integer,
  ADD COLUMN IF NOT EXISTS upstream_request_id text;

COMMENT ON COLUMN public.tiktok_compass_tasks.retry_not_before IS
  'Earliest allowed recovery of this saved task after a pending or retryable upstream failure. Not a global app quota clock.';
