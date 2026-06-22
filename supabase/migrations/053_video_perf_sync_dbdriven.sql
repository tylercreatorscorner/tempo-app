-- 053_video_perf_sync_dbdriven.sql
--
-- Sibling of migration 052. Fixes empty Top Videos / Products / One-to-Watch
-- (Daily Drop, What's Cooking) for every brand outside a hardcoded list
-- (cosrx, leefar_us, peach_slices, kitsch, dr_dent, m3, neurogum, forchics,
-- earth_breeze, ...).
--
-- Root cause
-- ----------
-- The Discord posts read `daily_video_product_stats`, populated by an AFTER
-- trigger on `video_performance` (`sync_video_performance_to_daily_stats`). The
-- old trigger resolved brand_id via a HARDCODED `CASE NEW.brand WHEN 'catakor'
-- … ELSE NULL`, and on NULL it `RETURN NEW` — silently skipping the sync. So
-- every brand outside those 7 slugs had its uploaded `video_performance` rows
-- but ZERO `daily_video_product_stats` rows (e.g. COSRX: 32,856 video rows
-- uploaded, 0 synced), and its Top Videos/Products/One-to-Watch came up empty.
--
-- Fix: resolve brand_id from `brands_v2` (DB-driven) so EVERY brand with a row
-- syncs going forward, plus a one-time backfill of the 147,426 rows across the
-- 9 brands the old trigger skipped.
--
-- Applied to production via Supabase MCP; this file is the replayable record.
-- Idempotent: CREATE OR REPLACE + backfill guarded by ON CONFLICT DO NOTHING.

-- ── 1. DB-driven sync trigger (only the brand resolution changes) ────────────
CREATE OR REPLACE FUNCTION public.sync_video_performance_to_daily_stats()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  brand_uuid UUID;
BEGIN
  IF NEW.period_type IS DISTINCT FROM 'daily' THEN RETURN NEW; END IF;
  IF NEW.creator_name IS NULL OR NEW.video_id IS NULL OR NEW.tenant_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO brand_uuid FROM public.brands_v2 WHERE slug = NEW.brand LIMIT 1;
  IF brand_uuid IS NULL THEN RETURN NEW; END IF;

  INSERT INTO daily_video_product_stats (
    report_date, brand_id, tiktok_username, video_id, video_title, video_url,
    post_date, product_name, product_id, gmv, orders, items_sold, items_refunded,
    refunded_gmv, est_commission, est_flat_fee, aov, avg_gmv_per_customer,
    data_source, tenant_id, created_at
  )
  VALUES (
    NEW.report_date, brand_uuid, LOWER(NEW.creator_name),
    NEW.video_id, NEW.video_title, NEW.video_link,
    NEW.post_date::timestamptz, NEW.product_name, NEW.product_id,
    NEW.gmv, NEW.orders, NEW.items_sold, NEW.items_refunded,
    NEW.refunds, NEW.est_commission, NEW.est_flat_fee, NEW.aov, NEW.avg_gmv_per_customer,
    COALESCE(NEW.data_source, 'sync'), NEW.tenant_id, COALESCE(NEW.created_at, now())
  )
  ON CONFLICT (report_date, brand_id, video_id, product_id) DO UPDATE SET
    video_title = EXCLUDED.video_title, video_url = EXCLUDED.video_url,
    post_date = EXCLUDED.post_date, product_name = EXCLUDED.product_name,
    tiktok_username = EXCLUDED.tiktok_username,
    gmv = EXCLUDED.gmv, orders = EXCLUDED.orders, items_sold = EXCLUDED.items_sold,
    items_refunded = EXCLUDED.items_refunded, refunded_gmv = EXCLUDED.refunded_gmv,
    est_commission = EXCLUDED.est_commission, est_flat_fee = EXCLUDED.est_flat_fee,
    aov = EXCLUDED.aov, avg_gmv_per_customer = EXCLUDED.avg_gmv_per_customer;

  RETURN NEW;
END;
$function$;

-- ── 2. Backfill the brands the old trigger skipped ──────────────────────────
INSERT INTO daily_video_product_stats (
  report_date, brand_id, tiktok_username, video_id, video_title, video_url,
  post_date, product_name, product_id, gmv, orders, items_sold, items_refunded,
  refunded_gmv, est_commission, est_flat_fee, aov, avg_gmv_per_customer,
  data_source, tenant_id, created_at
)
SELECT
  vp.report_date, b.id, LOWER(vp.creator_name),
  vp.video_id, vp.video_title, vp.video_link,
  vp.post_date::timestamptz, vp.product_name, vp.product_id,
  vp.gmv, vp.orders, vp.items_sold, vp.items_refunded,
  vp.refunds, vp.est_commission, vp.est_flat_fee, vp.aov, vp.avg_gmv_per_customer,
  'backfill', vp.tenant_id, now()
FROM video_performance vp
JOIN brands_v2 b ON b.slug = vp.brand
WHERE vp.period_type = 'daily'
  AND vp.creator_name IS NOT NULL AND vp.video_id IS NOT NULL AND vp.tenant_id IS NOT NULL
  AND vp.brand NOT IN ('catakor','physicians_choice','jiyu','toplux','leefar_nutrition','leefar_supplements','lemme')
ON CONFLICT (report_date, brand_id, video_id, product_id) DO NOTHING;
