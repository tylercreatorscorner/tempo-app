-- 119_canonical_video_links.sql
--
-- `videos.video_link` is DERIVED from identity, never taken from the export.
--
-- WHY (do not "restore" the file's value later):
-- TikTok's daily exports used to put a canonical share URL in the "Video link"
-- column. They now put an EXPIRING SIGNED CDN URL there instead, e.g.
--   https://v16m-default.tiktokcdn-us.com/<sig>/6a63ee48/video/tos/...
-- That hex path segment is a unix expiry: the link inside the 2026-07-22 export
-- died 2026-07-24 22:59 UTC — roughly a two-day shelf life. It is a media file,
-- not a watch page, and it is not even the same HOST (tiktokcdn-us.com).
--
-- Migration 110's dual-ingest wrote that column into `videos` on every
-- video_performance upload, and its ON CONFLICT preferred a non-empty incoming
-- value — so each upload OVERWROTE a good canonical link with a link that dies
-- in two days. Prod at the time of this migration: 1,690,866 canonical /
-- 112,686 expiring CDN / 2,580 literal '--', with ~24,521 CDN links written in
-- the two days before it was caught, growing with every upload.
--
-- WHO BREAKS on a CDN link:
--   * src/lib/data/creator-portal.ts (getCreatorTopVideos) filters
--     video_link.includes('tiktok.com'). 'tiktokcdn-us.com' does NOT contain
--     the substring 'tiktok.com', so those videos silently lost their watch
--     link in the creator portal.
--   * src/hooks/use-tiktok-thumbnail.ts calls the public oEmbed endpoint with
--     the stored link; a CDN media URL resolves no cover, so every such card
--     falls back to a placeholder tile.
--   * src/app/(admin)/posts/[videoId]/page.tsx renders it as the "open on
--     TikTok" href — a dead link after ~2 days.
--   * get_managed_posts / the mig 079 + 095 video RPCs do
--     COALESCE(NULLIF(btrim(v.video_link),''), <synthesized permalink>), so a
--     non-empty CDN link WINS over the good synthesized fallback and reaches
--     /posts and the dashboard.
--   * scripts/backfill-video-thumbnails.ts feeds video_link to oEmbed.
--
-- THE RULE: the canonical watch URL is deterministic and permanent —
--     https://www.tiktok.com/@{creator_name}/video/{video_id}
-- Verified against prod before writing this: all 1,690,866 already-canonical
-- rows equal that expression byte for byte (0 mismatches), every one of the
-- 1,806,132 rows has a non-empty creator_name and a numeric video_id (0
-- exceptions), and 0 rows across videos.creator_name (1.8M),
-- daily_video_product_stats.tiktok_username (1.7M) and
-- video_performance.creator_name (1.7M) fall outside the TikTok handle charset
-- [A-Za-z0-9._]. So the derivation is always constructible, and it survives
-- whatever TikTok does to the export next — which is the entire point.
--
-- The TS side of this rule lives in canonicalVideoUrl() in
-- src/lib/utils/format.ts. Keep the two in sync.
--
-- SCOPE: identity/link only. No metric, no stat column, and nothing about GMV
-- changes here.


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. upsert_video_identities (replaces migration 110)
--
-- IDENTITY-ONLY is still load-bearing (mig 079/110): video_performance records
-- are per-day per-product numbers, while videos' stat columns (total_gmv,
-- affiliate_gmv, items_sold, orders, impressions, likes, comments,
-- est_commission) are lifetime snapshots. This function must NEVER touch them,
-- and it still does not. The ONLY change from 110 is video_link.
-- ─────────────────────────────────────────────────────────────────────────────

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
    -- DERIVED, never r->>'video_link'. The payload's link is an expiring
    -- signed CDN URL (see header). NULL when identity can't build a real one —
    -- no link beats a link that 404s in two days, and the ON CONFLICT below
    -- makes NULL non-destructive.
    CASE
      WHEN btrim(COALESCE(r->>'creator_name', '')) ~ '^[A-Za-z0-9._]+$'
       AND COALESCE(r->>'video_id', '') ~ '^[0-9]+$'
      THEN 'https://www.tiktok.com/@' || btrim(r->>'creator_name')
             || '/video/' || (r->>'video_id')
      ELSE NULL
    END,
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
    -- EXCLUDED.video_link is now derived-or-NULL, never the file's value, so
    -- this COALESCE reads: a freshly derived canonical link always replaces
    -- whatever was stored (that is how the CDN rows heal on the next upload),
    -- and a NULL derivation never wipes a good stored link. creator_name is
    -- updated in the same statement, so a handle rename keeps link and handle
    -- consistent.
    video_link   = COALESCE(EXCLUDED.video_link, videos.video_link),
    creator_name = COALESCE(NULLIF(EXCLUDED.creator_name, ''), videos.creator_name),
    -- First-seen post_date wins: a real Video List publish date must never be
    -- overwritten by a derived-from-snowflake approximation.
    post_date    = COALESCE(videos.post_date, EXCLUDED.post_date);

  GET DIAGNOSTICS upserted_count = ROW_COUNT;

  RETURN jsonb_build_object('upserted', upserted_count);
END;
$function$;

-- Service-role only (the run route calls this through createAdminClient).
-- CREATE OR REPLACE keeps the existing grants, but the house rule (mig 100) is
-- to be explicit either way — a GRANT list that merely omits anon revokes
-- NOTHING under Supabase's default privileges.
REVOKE ALL ON FUNCTION public.upsert_video_identities(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_video_identities(jsonb) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. upload_videos_atomic — the legacy Video List path (table='videos')
--
-- Replaced from its live prod definition (pg_get_functiondef, read 2026-07-25),
-- preserving EVERY other behaviour verbatim: same signature, SECURITY DEFINER,
-- search_path, 60s SET LOCAL, the full column list, the COALESCE(...,0) stat
-- parsing, the upsert-never-delete contract, and the same
-- jsonb_build_object('deleted', 0, 'upserted', n) return shape. It still writes
-- the lifetime stat columns exactly as before — those are the Video List
-- export's own lifetime snapshots and they remain the source for that path.
-- The ONLY changes are video_link (derived, not the file's) and the ON CONFLICT
-- for that one column (COALESCE instead of an unconditional overwrite, so a
-- NULL derivation can't wipe a good stored link).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.upload_videos_atomic(p_records jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  inserted_count int := 0;
BEGIN
  -- The videos table is keyed by (video_id, brand) without a date —
  -- it's the persistent video catalog. Just upsert; never delete.
  SET LOCAL statement_timeout = '60s';

  INSERT INTO videos (
    video_id, brand, creator_name, video_name, video_link,
    post_date, total_gmv, affiliate_gmv, items_sold,
    orders, impressions, likes, comments, est_commission
  )
  SELECT
    r->>'video_id', r->>'brand', r->>'creator_name',
    r->>'video_name',
    -- DERIVED, never r->>'video_link' (see header). The Video List export's
    -- link column carries the same expiring signed CDN URL now that TikTok has
    -- merged the two export schemas.
    CASE
      WHEN btrim(COALESCE(r->>'creator_name', '')) ~ '^[A-Za-z0-9._]+$'
       AND COALESCE(r->>'video_id', '') ~ '^[0-9]+$'
      THEN 'https://www.tiktok.com/@' || btrim(r->>'creator_name')
             || '/video/' || (r->>'video_id')
      ELSE NULL
    END,
    NULLIF(r->>'post_date','')::date,
    COALESCE((r->>'total_gmv')::numeric, 0),
    COALESCE((r->>'affiliate_gmv')::numeric, 0),
    COALESCE((r->>'items_sold')::int, 0),
    COALESCE((r->>'orders')::int, 0),
    COALESCE((r->>'impressions')::int, 0),
    COALESCE((r->>'likes')::int, 0),
    COALESCE((r->>'comments')::int, 0),
    COALESCE((r->>'est_commission')::numeric, 0)
  FROM jsonb_array_elements(p_records) AS r
  ON CONFLICT (video_id, brand) DO UPDATE SET
    creator_name = EXCLUDED.creator_name,
    video_name = EXCLUDED.video_name,
    -- Was `video_link = EXCLUDED.video_link` unconditionally. EXCLUDED is now
    -- derived-or-NULL, so COALESCE keeps a good stored link when identity
    -- can't build one; a real derivation still wins and heals CDN rows.
    video_link = COALESCE(EXCLUDED.video_link, videos.video_link),
    post_date = COALESCE(EXCLUDED.post_date, videos.post_date),
    total_gmv = EXCLUDED.total_gmv, affiliate_gmv = EXCLUDED.affiliate_gmv,
    items_sold = EXCLUDED.items_sold, orders = EXCLUDED.orders,
    impressions = EXCLUDED.impressions, likes = EXCLUDED.likes,
    comments = EXCLUDED.comments, est_commission = EXCLUDED.est_commission;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  RETURN jsonb_build_object('deleted', 0, 'upserted', inserted_count);
END;
$function$;

-- HOUSE RULE + a hole this closes: prod's ACL on this function was
-- {=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X} — PUBLIC,
-- anon and authenticated could all EXECUTE it, i.e. any holder of the anon key
-- could write arbitrary rows (including the lifetime GMV columns) into
-- `videos`. Its only caller is POST /api/upload/run, which goes through
-- createAdminClient() (service_role); nothing in tempo-app, tempo-bot or the
-- legacy creators-corner-dashboards calls it with a user key. CREATE OR REPLACE
-- preserves the old grants, so the REVOKE has to be explicit.
REVOKE ALL ON FUNCTION public.upload_videos_atomic(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upload_videos_atomic(jsonb) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ONE-TIME REPAIR — rebuild the links the old ON CONFLICT clobbered.
--
-- IDEMPOTENT: the predicate excludes rows that are already canonical, so a
-- second run matches 0 rows. Safe to re-run at any time.
--
-- NON-DESTRUCTIVE: this only ever rewrites the video_link column. No rows are
-- deleted, no stat column is touched, and an already-canonical link is left
-- exactly as it is (the NOT LIKE guard), so a handle rename recorded earlier
-- is never silently rewritten.
--
-- Expected at the time of writing: ~115,266 rows (112,686 expiring CDN links +
-- 2,580 literal '--'). Rows whose creator_name or video_id can't build a real
-- URL are skipped rather than set to a junk string — prod currently has 0 of
-- those.
-- ─────────────────────────────────────────────────────────────────────────────

-- Plain SET (not SET LOCAL) so this holds whether or not the migration runner
-- wraps the file in a transaction. ~115k rows over a 1.8M-row table.
SET statement_timeout = '600s';

UPDATE videos
   SET video_link = 'https://www.tiktok.com/@' || creator_name || '/video/' || video_id
 WHERE (video_link IS NULL OR video_link NOT LIKE 'https://www.tiktok.com/@%/video/%')
   AND creator_name ~ '^[A-Za-z0-9._]+$'
   AND video_id ~ '^[0-9]+$';

RESET statement_timeout;

-- Verification (run by hand after applying; expect cdn = 0 and junk = 0):
--   SELECT count(*) FILTER (WHERE video_link LIKE 'https://www.tiktok.com/@%/video/%') AS canonical,
--          count(*) FILTER (WHERE video_link LIKE '%tiktokcdn%')                       AS cdn,
--          count(*) FILTER (WHERE video_link = '--')                                   AS junk,
--          count(*) FILTER (WHERE video_link IS NULL)                                  AS null_link
--     FROM videos;
