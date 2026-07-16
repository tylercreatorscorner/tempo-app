-- 072_creator_perf_by_handles_rpc.sql
--
-- Adds an RPC that aggregates `creator_performance` (the complete CSV-fed
-- creator×brand×day source of truth) into per-(handle, brand) money totals for
-- a set of TikTok handles over a date range.
--
-- WHY: the creator-profile data layer (src/lib/data/creator-profile.ts) read
-- GMV/orders/items/commission from `daily_video_product_stats`, which only
-- captures GMV attributable to an individually-tracked video — a ~17-22% SUBSET
-- of a creator's total GMV (a lossy legacy→v2 sync can drop whole brands). So a
-- creator's profile "Total GMV" under-reported vs the roster / earnings /
-- dashboard, which already read `creator_performance` (migration 042 repointed
-- the roster RPCs; the profile page was never migrated). This RPC lets the
-- profile read the same complete source.
--
-- Handle matching is case-insensitive (lower(creator_name)); callers pass
-- already-lowercased, @-stripped handles. Video/post COUNTS stay on
-- daily_video_product_stats (they are inherently video-level).

CREATE OR REPLACE FUNCTION get_creator_perf_by_handles(
  p_handles    TEXT[],   -- lowercased, @-stripped TikTok handles
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS TABLE (
  handle     TEXT,   -- lower(creator_name)
  brand      TEXT,   -- creator_performance.brand (data-store slug)
  gmv        NUMERIC,
  orders     NUMERIC,
  items_sold NUMERIC,
  commission NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    lower(cp.creator_name)::text AS handle,
    cp.brand::text               AS brand,
    SUM(cp.gmv)::numeric            AS gmv,
    SUM(cp.orders)::numeric         AS orders,
    SUM(cp.items_sold)::numeric     AS items_sold,
    SUM(cp.est_commission)::numeric AS commission
  FROM creator_performance cp
  WHERE cp.period_type = 'daily'
    AND cp.report_date >= p_start_date
    AND cp.report_date <= p_end_date
    AND lower(cp.creator_name) = ANY(p_handles)
  GROUP BY lower(cp.creator_name), cp.brand
$$;

COMMENT ON FUNCTION get_creator_perf_by_handles IS
  'Per-(handle, brand) GMV/orders/items/commission from creator_performance (the
   complete source of truth) for a set of lowercased handles over a date range.
   Powers the creator-profile money metrics so they tie out to roster/earnings/
   dashboard; video-level counts remain sourced from daily_video_product_stats.';

GRANT EXECUTE ON FUNCTION get_creator_perf_by_handles(TEXT[], DATE, DATE) TO authenticated, service_role;
