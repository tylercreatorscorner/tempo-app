-- ============================================================
-- Posts page RPC — every post by a (managed) creator, deduped by video_id.
--
-- Why this exists:
--   The /posts data layer used to pull from `videos` into JS, cap at the
--   top 500 rows by GMV, and then compute the KPI totals over that capped
--   slice. With thousands of posts per window that under-reported the post
--   count and total views (GMV happened to match because it concentrates in
--   the top rows). It also never deduped: `videos` is keyed UNIQUE on
--   (video_id, brand), so a video reported under two shops appeared twice.
--
--   Per product decision: a TikTok video_id is ONE unique video and must
--   never count under two shops. So we collapse each video_id to a single
--   canonical row (the brand attribution with the highest GMV; ties broken
--   by views then most-recent post_date). Totals are computed in-DB over the
--   FULL deduped window so the KPI strip always adds up regardless of how
--   many rows the page renders.
--
-- Shape mirrors the analytics_* RPCs (036/038): SQL, STABLE, SECURITY
-- DEFINER (run-as-owner to bypass the v2 RLS), access control done in TS via
-- the brand-slug allow-list passed in p_brand_slugs.
-- ============================================================

-- Composite index to keep the (brand, date-window) scan cheap. `videos` had
-- single-column indexes on brand and post_date but no composite; this lets
-- the planner range-scan per brand for the windowed query the RPC runs.
CREATE INDEX IF NOT EXISTS idx_videos_brand_post_date
  ON public.videos (brand, post_date);

-- ── Base: filtered + deduped rows for the window. No limit. ──────────
-- One row per video_id. Engagement (views/likes/comments) is the canonical
-- row's value (counted once — never summed across shops). GMV prefers
-- affiliate_gmv (creator-attributed) and falls back to total_gmv, matching
-- the prior posts.ts behavior.
CREATE OR REPLACE FUNCTION get_managed_posts_base(
  p_brand_slugs text[],
  p_start_date date,
  p_end_date date,
  p_managed_only boolean
)
RETURNS TABLE(
  video_id text,
  video_title text,
  video_url text,
  creator_handle text,
  brand_slug text,
  brand_name text,
  post_date date,
  views bigint,
  likes bigint,
  comments bigint,
  gmv numeric,
  orders bigint,
  items_sold bigint,
  is_managed boolean
)
LANGUAGE sql STABLE AS $$
  WITH managed_pairs AS (
    -- Unpivot managed_creators account_1..account_10 into (brand, handle)
    -- pairs, normalized exactly like the TS normalizeHandle (strip a leading
    -- @, trim, lowercase). DISTINCT so a handle listed twice can't multiply
    -- the join.
    SELECT DISTINCT
      mc.brand AS brand_slug,
      lower(trim(regexp_replace(h.handle, '^@', ''))) AS handle
    FROM managed_creators mc
    CROSS JOIN LATERAL (VALUES
      (mc.account_1),(mc.account_2),(mc.account_3),(mc.account_4),(mc.account_5),
      (mc.account_6),(mc.account_7),(mc.account_8),(mc.account_9),(mc.account_10)
    ) AS h(handle)
    WHERE h.handle IS NOT NULL AND trim(h.handle) <> ''
  ),
  scoped AS (
    SELECT
      v.video_id,
      COALESCE(v.video_name, '(untitled)') AS video_title,
      v.video_link AS video_url,
      lower(trim(regexp_replace(v.creator_name, '^@', ''))) AS creator_handle,
      v.brand AS brand_slug,
      b.name AS brand_name,
      v.post_date,
      COALESCE(v.impressions, 0)::bigint AS views,
      COALESCE(v.likes, 0)::bigint AS likes,
      COALESCE(v.comments, 0)::bigint AS comments,
      CASE WHEN COALESCE(v.affiliate_gmv, 0) > 0
           THEN v.affiliate_gmv
           ELSE COALESCE(v.total_gmv, 0) END AS gmv,
      COALESCE(v.orders, 0)::bigint AS orders,
      COALESCE(v.items_sold, 0)::bigint AS items_sold,
      (mp.handle IS NOT NULL) AS is_managed
    FROM videos v
    JOIN brands_v2 b ON b.slug = v.brand
    LEFT JOIN managed_pairs mp
      ON mp.brand_slug = v.brand
     AND mp.handle = lower(trim(regexp_replace(v.creator_name, '^@', '')))
    WHERE v.brand = ANY(p_brand_slugs)
      AND v.post_date >= p_start_date
      AND v.post_date <= p_end_date
      AND v.video_id IS NOT NULL AND v.video_id <> ''
      AND v.creator_name IS NOT NULL AND v.creator_name <> ''
      AND (NOT p_managed_only OR mp.handle IS NOT NULL)
  )
  -- Canonical row per video_id: highest GMV wins, then most views, then
  -- most-recent post. This collapses the (video_id, brand) fan-out to one
  -- unique video.
  SELECT DISTINCT ON (s.video_id)
    s.video_id, s.video_title, s.video_url, s.creator_handle, s.brand_slug,
    s.brand_name, s.post_date, s.views, s.likes, s.comments, s.gmv,
    s.orders, s.items_sold, s.is_managed
  FROM scoped s
  ORDER BY s.video_id, s.gmv DESC, s.views DESC, s.post_date DESC NULLS LAST;
$$;

-- ── Display rows: deduped set ordered by GMV, capped at p_limit. ─────
-- p_limit is a safety bound for pathological all-creator windows (100k+
-- rows). Managed windows are well under it, so managed users see every post.
CREATE OR REPLACE FUNCTION get_managed_posts(
  p_brand_slugs text[],
  p_start_date date,
  p_end_date date,
  p_managed_only boolean DEFAULT true,
  p_limit int DEFAULT 20000
)
RETURNS TABLE(
  video_id text,
  video_title text,
  video_url text,
  creator_handle text,
  brand_slug text,
  brand_name text,
  post_date date,
  views bigint,
  likes bigint,
  comments bigint,
  gmv numeric,
  orders bigint,
  items_sold bigint,
  is_managed boolean
)
LANGUAGE sql STABLE AS $$
  SELECT *
  FROM get_managed_posts_base(p_brand_slugs, p_start_date, p_end_date, p_managed_only)
  ORDER BY gmv DESC, views DESC
  LIMIT GREATEST(p_limit, 0);
$$;

-- ── Totals: aggregate over the FULL deduped window (never capped). ───
-- This is what the KPI strip reads, so the headline numbers reflect every
-- in-scope post even when the table renders a subset.
CREATE OR REPLACE FUNCTION get_managed_posts_totals(
  p_brand_slugs text[],
  p_start_date date,
  p_end_date date,
  p_managed_only boolean DEFAULT true
)
RETURNS TABLE(
  post_count bigint,
  total_views bigint,
  total_likes bigint,
  total_comments bigint,
  total_gmv numeric,
  total_orders bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    count(*)::bigint                       AS post_count,
    COALESCE(sum(views), 0)::bigint        AS total_views,
    COALESCE(sum(likes), 0)::bigint        AS total_likes,
    COALESCE(sum(comments), 0)::bigint     AS total_comments,
    COALESCE(sum(gmv), 0)::numeric         AS total_gmv,
    COALESCE(sum(orders), 0)::bigint       AS total_orders
  FROM get_managed_posts_base(p_brand_slugs, p_start_date, p_end_date, p_managed_only);
$$;

-- Run-as-owner to bypass v2 RLS (parity with analytics_* in migration 038).
ALTER FUNCTION get_managed_posts_base(text[], date, date, boolean)        SECURITY DEFINER;
ALTER FUNCTION get_managed_posts(text[], date, date, boolean, int)        SECURITY DEFINER;
ALTER FUNCTION get_managed_posts_totals(text[], date, date, boolean)      SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_managed_posts_base(text[], date, date, boolean)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_managed_posts(text[], date, date, boolean, int)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_managed_posts_totals(text[], date, date, boolean) TO authenticated, service_role;
