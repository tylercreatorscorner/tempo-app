-- 110_upsert_video_identities.sql
--
-- Dual-ingest registry writes. TikTok merged the Video List export into the
-- Video Data schema (~2026-07-13), so shops that flipped stopped producing the
-- Video List files that were the ONLY writer of the `videos` registry
-- (upload_videos_atomic, via table='videos'). Stats kept flowing into
-- video_performance, but new posts never got registry rows — 18,373 earning
-- videos are already missing from `videos`. Fix: the Video Data upload path
-- (POST /api/upload/run, table='video_performance') now also upserts
-- IDENTITY-ONLY rows into `videos` via this RPC after each successful stats
-- chunk.
--
-- IDENTITY-ONLY is load-bearing: video_performance records are per-day
-- per-product numbers, while videos' stat columns (total_gmv, affiliate_gmv,
-- items_sold, orders, impressions, likes, comments, est_commission) are
-- lifetime snapshots from the Video List export. Writing a day-by-product
-- number into a lifetime-snapshot column is exactly the clobbering migration
-- 079 exists to avoid — this function must NEVER touch those columns. New
-- rows get the column defaults (0); readers take money from windowed
-- video_performance sums (mig 079), and the registry row exists for post
-- counts and identity joins.

CREATE OR REPLACE FUNCTION public.upsert_video_identities(p_records jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  upserted_count int := 0;
BEGIN
  -- Same timeout discipline as the upload_*_atomic family (see
  -- upload_video_performance_atomic, mig 088): SET LOCAL overrides the 8s
  -- authenticator-inherited timeout for this transaction only.
  SET LOCAL statement_timeout = '60s';

  -- DISTINCT ON: ON CONFLICT DO UPDATE errors if a single INSERT hits the
  -- same (video_id, brand) twice ("cannot affect row a second time"). The
  -- route dedupes per chunk, but this keeps direct callers safe.
  INSERT INTO videos (video_id, brand, creator_name, video_name, video_link, post_date)
  SELECT DISTINCT ON (r->>'video_id', r->>'brand')
    r->>'video_id',
    r->>'brand',
    r->>'creator_name',
    NULLIF(r->>'video_name', ''),
    NULLIF(r->>'video_link', ''),
    NULLIF(r->>'post_date', '')::date
  FROM jsonb_array_elements(p_records) AS r
  -- creator_name and brand are NOT NULL in prod; an empty video_id can't key
  -- the registry. Skip such records rather than fail the batch.
  WHERE COALESCE(r->>'video_id', '') <> ''
    AND COALESCE(r->>'creator_name', '') <> ''
    AND COALESCE(r->>'brand', '') <> ''
  ORDER BY r->>'video_id', r->>'brand'
  ON CONFLICT (video_id, brand) DO UPDATE SET
    video_name   = COALESCE(NULLIF(EXCLUDED.video_name, ''),   videos.video_name),
    video_link   = COALESCE(NULLIF(EXCLUDED.video_link, ''),   videos.video_link),
    creator_name = COALESCE(NULLIF(EXCLUDED.creator_name, ''), videos.creator_name),
    -- First-seen post_date wins: a real Video List publish date must never be
    -- overwritten by a derived-from-snowflake approximation.
    post_date    = COALESCE(videos.post_date, EXCLUDED.post_date);

  GET DIAGNOSTICS upserted_count = ROW_COUNT;

  RETURN jsonb_build_object('upserted', upserted_count);
END;
$function$;

-- Service-role only (the run route calls this through createAdminClient).
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, and a GRANT list that
-- merely omits anon revokes NOTHING (house rule, mig 100) — the REVOKE must
-- be explicit.
REVOKE ALL ON FUNCTION public.upsert_video_identities(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_video_identities(jsonb) TO service_role;
