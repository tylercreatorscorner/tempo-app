-- Recovery-only queue. No cron, automatic enqueue, task creation or fact writes.
-- All dispatcher callers in this database share one gate. Other API clients
-- must adopt the gate before it can be described as an app-wide limiter.
BEGIN;
CREATE TABLE public.tiktok_compass_dispatch_gate (
  id integer PRIMARY KEY CHECK (id = 1),
  not_before timestamptz NOT NULL DEFAULT '-infinity',
  lease_token uuid,
  lease_expires_at timestamptz
);
INSERT INTO public.tiktok_compass_dispatch_gate(id) VALUES(1);

CREATE TABLE public.tiktok_compass_recovery_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_row_id uuid NOT NULL UNIQUE REFERENCES public.tiktok_compass_tasks(id),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','verified_dry_run','needs_review')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  last_outcome text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tiktok_compass_dispatch_gate ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_compass_recovery_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tiktok_compass_dispatch_gate, public.tiktok_compass_recovery_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tiktok_compass_dispatch_gate, public.tiktok_compass_recovery_queue TO service_role;

CREATE FUNCTION public.claim_compass_recovery(p_brand text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  g public.tiktok_compass_dispatch_gate%ROWTYPE;
  j public.tiktok_compass_recovery_queue%ROWTYPE;
  t public.tiktok_compass_tasks%ROWTYPE;
  token uuid := gen_random_uuid();
  clock timestamptz := clock_timestamp();
  held_until timestamptz;
BEGIN
  SELECT * INTO STRICT g FROM public.tiktok_compass_dispatch_gate WHERE id=1 FOR UPDATE;
  IF g.lease_expires_at > clock THEN RETURN jsonb_build_object('state','busy'); END IF;
  -- A killed worker consumes its attempt. It may resume only after the gate
  -- lease (360s) and underlying task lease (330s) have expired.
  UPDATE public.tiktok_compass_recovery_queue SET
    status=CASE WHEN attempts>=3 THEN 'needs_review' ELSE 'queued' END,
    lease_token=NULL, last_outcome='Worker lease expired', updated_at=clock
    WHERE status='running';
  UPDATE public.tiktok_compass_dispatch_gate SET lease_token=NULL,lease_expires_at=NULL WHERE id=1;
  -- Also honor a throttle persisted by ingestion before a dispatcher crashed.
  SELECT max(retry_not_before) INTO held_until FROM public.tiktok_compass_tasks WHERE retry_reason='rate_limit';
  held_until := greatest(g.not_before,held_until);
  IF held_until > clock THEN
    RETURN jsonb_build_object('state','cooldown','notBefore',held_until);
  END IF;
  SELECT q.* INTO j FROM public.tiktok_compass_recovery_queue q
    JOIN public.tiktok_compass_tasks task ON task.id=q.task_row_id
    WHERE q.status='queued' AND q.attempts<3 AND q.next_attempt_at<=clock
      AND task.brand_slug=p_brand
      AND (task.retry_not_before IS NULL OR task.retry_not_before<=clock)
      AND (task.lease_expires_at IS NULL OR task.lease_expires_at<=clock)
    ORDER BY q.next_attempt_at,q.id LIMIT 1 FOR UPDATE OF q;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','idle'); END IF;
  SELECT * INTO STRICT t FROM public.tiktok_compass_tasks WHERE id=j.task_row_id;
  UPDATE public.tiktok_compass_recovery_queue SET status='running',attempts=attempts+1,
    lease_token=token,updated_at=clock WHERE id=j.id;
  UPDATE public.tiktok_compass_dispatch_gate SET lease_token=token,
    lease_expires_at=clock+interval '360 seconds' WHERE id=1;
  RETURN jsonb_build_object('state','claimed','jobId',j.id,'taskRowId',t.id,
    'leaseToken',token,'attempt',j.attempts+1,'scope',t.recovery_context);
END;
$$;

CREATE FUNCTION public.finish_compass_recovery(p_job uuid,p_token uuid,p_outcome text,
  p_retry_at timestamptz DEFAULT NULL,p_rate_limited boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  g public.tiktok_compass_dispatch_gate%ROWTYPE;
  j public.tiktok_compass_recovery_queue%ROWTYPE;
  clock timestamptz := clock_timestamp();
  due timestamptz;
  new_status text;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('verified_dry_run','retry','needs_review') THEN
    RAISE EXCEPTION 'Invalid recovery outcome';
  END IF;
  IF p_outcome='retry' AND (p_retry_at IS NULL OR NOT isfinite(p_retry_at)) THEN
    RAISE EXCEPTION 'Retry requires a finite due time';
  END IF;
  IF p_rate_limited IS NULL OR (p_rate_limited AND p_outcome<>'retry') THEN
    RAISE EXCEPTION 'Rate limit requires retry outcome';
  END IF;
  SELECT * INTO STRICT g FROM public.tiktok_compass_dispatch_gate WHERE id=1 FOR UPDATE;
  SELECT * INTO STRICT j FROM public.tiktok_compass_recovery_queue WHERE id=p_job FOR UPDATE;
  IF p_token IS NULL OR g.lease_token IS DISTINCT FROM p_token
    OR j.lease_token IS DISTINCT FROM p_token OR j.status<>'running' THEN
    RAISE EXCEPTION 'Recovery lease no longer owned';
  END IF;
  due := greatest(p_retry_at,clock+interval '60 seconds');
  new_status := CASE WHEN p_outcome='retry' THEN
    CASE WHEN j.attempts>=3 THEN 'needs_review' ELSE 'queued' END ELSE p_outcome END;
  UPDATE public.tiktok_compass_recovery_queue SET status=new_status,lease_token=NULL,
    next_attempt_at=CASE WHEN p_outcome='retry' THEN due ELSE next_attempt_at END,
    last_outcome=CASE WHEN p_outcome='retry' AND j.attempts>=3 THEN 'Three attempts exhausted'
      WHEN p_rate_limited THEN 'Rate limited' ELSE p_outcome END,updated_at=clock WHERE id=p_job;
  UPDATE public.tiktok_compass_dispatch_gate SET lease_token=NULL,lease_expires_at=NULL,
    not_before=CASE WHEN p_rate_limited THEN greatest(not_before,due) ELSE not_before END WHERE id=1;
  RETURN new_status;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_compass_recovery(text),
  public.finish_compass_recovery(uuid,uuid,text,timestamptz,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_compass_recovery(text),
  public.finish_compass_recovery(uuid,uuid,text,timestamptz,boolean) TO service_role;
COMMIT;
