-- Creator GMV must not roll back when the independent publishing/universe scan
-- times out. Source writes mark exact brand/days, including historical corrections.
-- Source tables, agreements, reports, reader permissions and GMV grain are unchanged.
SET LOCAL lock_timeout = '5s';
-- Fail fast rather than overlap an old destructive refresh during cutover.
LOCK TABLE public.creator_performance, public.roster_creator_daily IN SHARE ROW EXCLUSIVE MODE NOWAIT;
CREATE SCHEMA IF NOT EXISTS roster_jobs;
REVOKE ALL ON SCHEMA roster_jobs FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA roster_jobs TO service_role;

CREATE TABLE roster_jobs.gmv_queue (
  brand_slug text NOT NULL,
  stat_date date NOT NULL,
  generation bigint NOT NULL DEFAULT 1,
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  PRIMARY KEY (brand_slug, stat_date)
);
CREATE INDEX gmv_queue_ready ON roster_jobs.gmv_queue (next_attempt_at, stat_date, brand_slug);
CREATE TABLE roster_jobs.gmv_refresh_status (
  brand_slug text NOT NULL,
  stat_date date NOT NULL,
  refreshed_at timestamptz NOT NULL,
  source_rows bigint NOT NULL,
  changed_rows integer NOT NULL,
  PRIMARY KEY (brand_slug, stat_date)
);
ALTER TABLE roster_jobs.gmv_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster_jobs.gmv_refresh_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA roster_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA roster_jobs TO service_role;

-- This narrowly scoped trigger needs owner rights only to enqueue a marker when
-- an existing permitted source writer lacks access to the private job tables.
-- It accepts no caller-supplied SQL/keys and cannot be called as a public RPC.
CREATE FUNCTION roster_jobs.mark_creator_gmv_dirty()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, roster_jobs
AS $fn$
BEGIN
  IF TG_RELID <> 'public.creator_performance'::regclass THEN
    RAISE EXCEPTION 'Unexpected GMV source relation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO roster_jobs.gmv_queue AS q (brand_slug, stat_date)
    SELECT DISTINCT brand, report_date FROM new_rows
    WHERE period_type = 'daily' AND brand IS NOT NULL AND report_date IS NOT NULL
    ORDER BY brand, report_date
    ON CONFLICT (brand_slug, stat_date) DO UPDATE
      SET generation = q.generation + 1, next_attempt_at = clock_timestamp(), attempts = 0, last_error = NULL;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO roster_jobs.gmv_queue AS q (brand_slug, stat_date)
    SELECT DISTINCT brand, report_date FROM old_rows
    WHERE period_type = 'daily' AND brand IS NOT NULL AND report_date IS NOT NULL
    ORDER BY brand, report_date
    ON CONFLICT (brand_slug, stat_date) DO UPDATE
      SET generation = q.generation + 1, next_attempt_at = clock_timestamp(), attempts = 0, last_error = NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO roster_jobs.gmv_queue AS q (brand_slug, stat_date)
    SELECT brand, report_date FROM (
      SELECT brand, report_date FROM old_rows WHERE period_type = 'daily'
      UNION SELECT brand, report_date FROM new_rows WHERE period_type = 'daily'
    ) changed WHERE brand IS NOT NULL AND report_date IS NOT NULL
    ORDER BY brand, report_date
    ON CONFLICT (brand_slug, stat_date) DO UPDATE
      SET generation = q.generation + 1, next_attempt_at = clock_timestamp(), attempts = 0, last_error = NULL;
  END IF;
  RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION roster_jobs.mark_creator_gmv_dirty() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER roster_gmv_after_insert AFTER INSERT ON public.creator_performance
REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION roster_jobs.mark_creator_gmv_dirty();
CREATE TRIGGER roster_gmv_after_update AFTER UPDATE ON public.creator_performance
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION roster_jobs.mark_creator_gmv_dirty();
CREATE TRIGGER roster_gmv_after_delete AFTER DELETE ON public.creator_performance
REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION roster_jobs.mark_creator_gmv_dirty();

CREATE FUNCTION roster_jobs.refresh_creator_gmv_day(p_brand text, p_date date)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, roster_jobs
AS $fn$
DECLARE v_count integer; v_source_rows bigint; v_nulls bigint;
BEGIN
  IF p_brand IS NULL OR p_date IS NULL THEN RAISE EXCEPTION 'Brand and day are required'; END IF;
  SELECT count(*), count(*) FILTER (WHERE cp.gmv IS NULL)
  INTO v_source_rows, v_nulls FROM public.creator_performance cp
  WHERE cp.brand = p_brand AND cp.report_date = p_date AND cp.period_type = 'daily';
  IF v_nulls > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22004', MESSAGE = 'Source GMV is incomplete; refresh retained for retry';
  END IF;
  -- A single statement snapshot reconciles new, changed, and deleted source keys.
  -- Keep existing lower(creator_name) semantics; never replace publishing counts.
  WITH source AS (
    SELECT lower(cp.creator_name) AS handle,
      CASE WHEN count(*) = count(cp.gmv) THEN sum(cp.gmv)::numeric ELSE NULL END AS gmv
    FROM public.creator_performance cp
    WHERE cp.brand = p_brand AND cp.report_date = p_date AND cp.period_type = 'daily'
      AND cp.creator_name IS NOT NULL
    GROUP BY lower(cp.creator_name)
  ), cached AS (
    SELECT handle, gmv FROM public.roster_creator_daily
    WHERE brand_slug = p_brand AND stat_date = p_date
  ), desired AS (
    SELECT coalesce(s.handle, c.handle) AS handle,
      CASE WHEN s.handle IS NULL THEN 0::numeric ELSE s.gmv END AS gmv,
      c.gmv AS previous_gmv
    FROM source s FULL OUTER JOIN cached c USING (handle)
  )
  INSERT INTO public.roster_creator_daily AS r (handle, brand_slug, stat_date, gmv, posts)
  SELECT handle, p_brand, p_date, gmv, 0 FROM desired
  WHERE gmv IS NULL OR gmv IS DISTINCT FROM previous_gmv ORDER BY handle
  ON CONFLICT (handle, brand_slug, stat_date) DO UPDATE SET gmv = excluded.gmv
  WHERE r.gmv IS DISTINCT FROM excluded.gmv;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO roster_jobs.gmv_refresh_status (brand_slug, stat_date, refreshed_at, source_rows, changed_rows)
  VALUES (p_brand, p_date, clock_timestamp(), v_source_rows, v_count)
  ON CONFLICT (brand_slug, stat_date) DO UPDATE SET refreshed_at = excluded.refreshed_at,
    source_rows = excluded.source_rows, changed_rows = excluded.changed_rows;
  RETURN v_count;
END $fn$;
REVOKE ALL ON FUNCTION roster_jobs.refresh_creator_gmv_day(text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION roster_jobs.refresh_creator_gmv_day(text, date) TO service_role;

CREATE FUNCTION public.process_roster_gmv_refresh_queue(p_limit integer DEFAULT 8)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, roster_jobs
SET lock_timeout = '2s'
AS $fn$
DECLARE v record; v_done integer := 0; v_started timestamptz := clock_timestamp();
BEGIN
  IF NOT pg_try_advisory_xact_lock(20261110, 1) THEN RETURN 0; END IF;
  FOR v IN SELECT * FROM (
    SELECT brand_slug, stat_date, generation FROM roster_jobs.gmv_queue
    WHERE next_attempt_at <= clock_timestamp()
    ORDER BY next_attempt_at, stat_date DESC, brand_slug
    LIMIT greatest(1, least(coalesce(p_limit, 8), 32))
  ) ready ORDER BY brand_slug, stat_date
  LOOP
    EXIT WHEN clock_timestamp() - v_started > interval '25 seconds';
    BEGIN
      PERFORM roster_jobs.refresh_creator_gmv_day(v.brand_slug, v.stat_date);
      -- Do not lock the queue during aggregation. If an upload arrived while the
      -- worker was running, its newer generation survives for another pass.
      DELETE FROM roster_jobs.gmv_queue WHERE brand_slug = v.brand_slug
        AND stat_date = v.stat_date AND generation = v.generation;
      v_done := v_done + 1;
    EXCEPTION
      WHEN query_canceled THEN
        UPDATE roster_jobs.gmv_queue SET attempts = attempts + 1,
          next_attempt_at = clock_timestamp() + interval '5 minutes',
          last_error = SQLSTATE || ': ' || left(SQLERRM, 500)
        WHERE brand_slug = v.brand_slug AND stat_date = v.stat_date AND generation = v.generation;
        RETURN v_done;
      WHEN OTHERS THEN
        UPDATE roster_jobs.gmv_queue SET attempts = attempts + 1,
          next_attempt_at = clock_timestamp() + interval '5 minutes',
          last_error = SQLSTATE || ': ' || left(SQLERRM, 500)
        WHERE brand_slug = v.brand_slug AND stat_date = v.stat_date AND generation = v.generation;
    END;
  END LOOP;
  RETURN v_done;
END $fn$;
REVOKE ALL ON FUNCTION public.process_roster_gmv_refresh_queue(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_roster_gmv_refresh_queue(integer) TO service_role;

-- Keep the legacy publishing call/return contract, but it must never delete or
-- rewrite GMV. The two jobs update disjoint columns using conflict-safe upserts.
CREATE OR REPLACE FUNCTION public.refresh_roster_creator_daily_range(p_from date, p_to date)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public
AS $fn$
DECLARE v_count integer;
BEGIN
  WITH published AS (
    SELECT u.handle, u.brand_slug, u.d, count(DISTINCT u.video_id)::integer AS posts
    FROM (
      SELECT lower(trim(regexp_replace(v.creator_name, '^@', ''))) AS handle,
        v.brand AS brand_slug, v.post_date AS d, v.video_id
      FROM public.videos v
      WHERE v.video_id IS NOT NULL AND v.video_id <> '' AND v.creator_name IS NOT NULL
        AND v.brand IS NOT NULL AND v.post_date >= p_from AND v.post_date < p_to
      UNION ALL
      SELECT lower(trim(regexp_replace(vp.creator_name, '^@', ''))) AS handle,
        vp.brand AS brand_slug, vp.post_date AS d, vp.video_id
      FROM public.video_performance vp
      WHERE vp.video_id IS NOT NULL AND vp.video_id <> '' AND vp.creator_name IS NOT NULL
        AND vp.brand IS NOT NULL AND vp.post_date >= p_from AND vp.post_date < p_to
    ) u GROUP BY u.handle, u.brand_slug, u.d
  ), cached AS (
    SELECT handle, brand_slug, stat_date AS d, posts FROM public.roster_creator_daily
    WHERE stat_date >= p_from AND stat_date < p_to AND posts <> 0
  ), desired AS (
    SELECT coalesce(p.handle, c.handle) AS handle, coalesce(p.brand_slug, c.brand_slug) AS brand_slug,
      coalesce(p.d, c.d) AS d, coalesce(p.posts, 0) AS posts, c.posts AS previous_posts
    FROM published p FULL OUTER JOIN cached c USING (handle, brand_slug, d)
  )
  INSERT INTO public.roster_creator_daily AS r (handle, brand_slug, stat_date, gmv, posts)
  SELECT handle, brand_slug, d, 0, posts FROM desired WHERE posts IS DISTINCT FROM previous_posts
  ORDER BY brand_slug, d, handle
  ON CONFLICT (handle, brand_slug, stat_date) DO UPDATE SET posts = excluded.posts
  WHERE r.posts IS DISTINCT FROM excluded.posts;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $fn$;
REVOKE ALL ON FUNCTION public.refresh_roster_creator_daily_range(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_roster_creator_daily_range(date, date) TO service_role;
COMMENT ON FUNCTION public.refresh_roster_creator_daily_range(date, date) IS
  'Refresh publishing counts only. GMV is independently refreshed from the source-change queue.';

-- This job commits independently of the existing frequent and nightly publishing
-- jobs. No increase to their timeout and no new polling of the video fact tables.
SELECT cron.schedule('refresh-roster-creator-gmv', '* * * * *',
  $job$set statement_timeout = '45s'; select public.process_roster_gmv_refresh_queue(8);$job$);

-- Release runbook: enqueue existing source/cache brand-days after this transaction
-- commits, then run bounded worker batches and verify keyed parity. Bulk catch-up
-- is intentionally outside the DDL locks. Triggers cover new/backdated changes.
