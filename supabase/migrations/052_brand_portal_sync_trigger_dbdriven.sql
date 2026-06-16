-- 052_brand_portal_sync_trigger_dbdriven.sql
--
-- Fixes "brand portal shows zero everywhere" for any brand outside a hardcoded
-- list (COSRX, leefar_us, NeuroGum, M3, Kitsch, ForChics, Earth Breeze, …).
--
-- Root cause
-- ----------
-- The brand portal reads `daily_creator_stats` (keyed by brand_id uuid). That
-- table is populated by an AFTER INSERT/UPDATE trigger on `creator_performance`
-- (`sync_creator_performance_to_daily_stats`). The old trigger resolved the
-- brand_id via a HARDCODED `CASE NEW.brand WHEN 'catakor' … ELSE NULL`, and on
-- NULL it `RETURN NEW` — silently skipping the sync. So every brand not in those
-- 7 slugs never reached daily_creator_stats, and its portal returned zeros even
-- though `creator_performance` had full data (e.g. COSRX: 98k rows / $855k GMV
-- uploaded, 65 managed creators, but 0 daily_creator_stats rows).
--
-- Fix: resolve brand_id from `brands_v2` (DB-driven) so EVERY brand with a
-- brands_v2 row syncs. Plus a one-time backfill of the brands the old trigger
-- skipped. (Same brittleness class as the hardcoded constants maps — the real
-- long-term fix is to make brand identity fully DB-driven.)
--
-- Applied to production via Supabase MCP; this file is the replayable record.
-- Idempotent: CREATE OR REPLACE + backfill guarded by NOT EXISTS / ON CONFLICT.

-- ── 1. DB-driven sync trigger ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_creator_performance_to_daily_stats()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  brand_uuid UUID;
BEGIN
  IF NEW.period_type IS DISTINCT FROM 'daily' THEN RETURN NEW; END IF;
  IF NEW.creator_name IS NULL OR NEW.tenant_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO brand_uuid FROM public.brands_v2 WHERE slug = NEW.brand LIMIT 1;
  IF brand_uuid IS NULL THEN RETURN NEW; END IF;

  INSERT INTO daily_creator_stats (
    report_date, brand_id, tiktok_username, gmv, refunds, orders,
    items_sold, items_refunded, aov, avg_daily_products_sold, videos,
    livestreams, est_commission, samples_shipped, est_flat_fee,
    data_source, tenant_id, created_at
  )
  VALUES (
    NEW.report_date, brand_uuid, LOWER(NEW.creator_name),
    NEW.gmv, NEW.refunds, NEW.orders, NEW.items_sold, NEW.items_refunded,
    NEW.aov, NEW.avg_daily_products_with_sales, NEW.videos, NEW.live_streams,
    NEW.est_commission, NEW.samples_shipped, NEW.est_flat_fee,
    COALESCE(NEW.data_source, 'sync'), NEW.tenant_id, COALESCE(NEW.created_at, now())
  )
  ON CONFLICT (report_date, brand_id, tiktok_username) DO UPDATE SET
    gmv = EXCLUDED.gmv, refunds = EXCLUDED.refunds, orders = EXCLUDED.orders,
    items_sold = EXCLUDED.items_sold, items_refunded = EXCLUDED.items_refunded,
    aov = EXCLUDED.aov, avg_daily_products_sold = EXCLUDED.avg_daily_products_sold,
    videos = EXCLUDED.videos, livestreams = EXCLUDED.livestreams,
    est_commission = EXCLUDED.est_commission, samples_shipped = EXCLUDED.samples_shipped,
    est_flat_fee = EXCLUDED.est_flat_fee;

  RETURN NEW;
END;
$function$;

-- ── 2. Backfill the brands the old trigger skipped ──────────────────────────
INSERT INTO daily_creator_stats (
  report_date, brand_id, tiktok_username, gmv, refunds, orders,
  items_sold, items_refunded, aov, avg_daily_products_sold, videos,
  livestreams, est_commission, samples_shipped, est_flat_fee,
  data_source, tenant_id, created_at
)
SELECT DISTINCT ON (cp.report_date, b.id, lower(cp.creator_name))
  cp.report_date, b.id, lower(cp.creator_name),
  cp.gmv, cp.refunds, cp.orders, cp.items_sold, cp.items_refunded,
  cp.aov, cp.avg_daily_products_with_sales, cp.videos, cp.live_streams,
  cp.est_commission, cp.samples_shipped, cp.est_flat_fee,
  'backfill', cp.tenant_id, now()
FROM creator_performance cp
JOIN brands_v2 b ON b.slug = cp.brand
WHERE cp.period_type = 'daily' AND cp.creator_name IS NOT NULL AND cp.tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM daily_creator_stats d
    WHERE d.report_date = cp.report_date AND d.brand_id = b.id
      AND d.tiktok_username = lower(cp.creator_name))
ORDER BY cp.report_date, b.id, lower(cp.creator_name), cp.gmv DESC NULLS LAST
ON CONFLICT (report_date, brand_id, tiktok_username) DO NOTHING;
