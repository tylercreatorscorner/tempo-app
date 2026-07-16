-- Per-brand GMV/orders/items/videos for a date range.
--
-- This is analytics_brand_summaries MINUS its `unique_creators` column, and it
-- exists purely for that omission. COUNT(DISTINCT tiktok_username) forces the
-- planner into a GroupAggregate that sorts the entire window — 366k rows for a
-- 7-day range — and spills ~19MB to disk:
--
--   analytics_brand_summaries : ~1550ms  (Sort Method: external merge Disk: 19240kB)
--   the SUMs alone            :  ~113ms  (HashAggregate, no spill)
--   analytics_brand_totals    :  ~210ms
--
-- Under the dashboard's concurrent load that pushed the summaries RPC past the
-- authenticated role's statement_timeout. The dashboard caught the error and
-- rendered $0 — a fabricated number, not an error — and it never displayed
-- unique_creators in the first place. So: don't compute it.
--
-- Verified against analytics_brand_summaries over 2026-07-09..2026-07-15 across
-- all 28 brand ids: identical gmv ($1,948,370), orders (80,873), and row count.
--
-- analytics_brand_summaries is left in place (not dropped) because the legacy
-- Netlify dashboard may still call it directly. Both app callers — the Tempo
-- dashboard and /api/roster — now use this function instead.

CREATE OR REPLACE FUNCTION analytics_brand_totals(
  p_brand_ids UUID[],
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  brand_id UUID,
  brand_slug TEXT,
  total_gmv NUMERIC,
  total_orders BIGINT,
  total_items_sold BIGINT,
  total_videos BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    b.id,
    b.slug,
    COALESCE(s.total_gmv, 0),
    COALESCE(s.total_orders, 0)::bigint,
    COALESCE(s.total_items_sold, 0)::bigint,
    COALESCE(s.total_videos, 0)::bigint
  FROM brands_v2 b
  LEFT JOIN (
    SELECT
      dcs.brand_id,
      SUM(dcs.gmv)        AS total_gmv,
      SUM(dcs.orders)     AS total_orders,
      SUM(dcs.items_sold) AS total_items_sold,
      SUM(dcs.videos)     AS total_videos
    FROM daily_creator_stats dcs
    WHERE dcs.report_date BETWEEN p_start_date AND p_end_date
    GROUP BY dcs.brand_id
  ) s ON s.brand_id = b.id
  WHERE b.id = ANY(p_brand_ids);
$function$;

GRANT EXECUTE ON FUNCTION analytics_brand_totals(UUID[], DATE, DATE) TO authenticated, service_role;
