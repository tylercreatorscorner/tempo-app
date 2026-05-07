-- Multi-brand product summary RPC for /analytics
-- Companion to migration 036's analytics_* family. Returns product-level
-- aggregates with brand_slug attached so the "Top Product" anomaly card
-- can show "Brand X - Product Y -- $$$ (+delta%)".

CREATE OR REPLACE FUNCTION analytics_products(
  p_brand_ids uuid[],
  p_start_date date,
  p_end_date date,
  p_limit int DEFAULT 50
)
RETURNS TABLE(
  brand_slug text,
  product_name text,
  total_gmv numeric,
  total_orders bigint,
  total_items_sold bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    b.slug AS brand_slug,
    dps.product_name,
    COALESCE(SUM(dps.gmv), 0) AS total_gmv,
    COALESCE(SUM(dps.orders), 0)::bigint AS total_orders,
    COALESCE(SUM(dps.items_sold), 0)::bigint AS total_items_sold
  FROM daily_product_stats dps
  JOIN brands_v2 b ON b.id = dps.brand_id
  WHERE dps.brand_id = ANY(p_brand_ids)
    AND dps.report_date BETWEEN p_start_date AND p_end_date
  GROUP BY b.slug, dps.product_name
  ORDER BY total_gmv DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION analytics_products(uuid[], date, date, int) TO authenticated, service_role;
