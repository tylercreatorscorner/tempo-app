-- 137_api_shadow_tables.sql
--
-- SHADOW tables: what the API says, stored BESIDE what the CSV says, never over it.
--
-- The point is a column-by-column diff on real data before anything replaces an
-- upload. Verified on jiyu 2026-07-24 BEFORE building this: affiliate video GMV
-- $20,329.04 and live $1,622.03 tie to creator_performance to the cent, and one
-- video's views/likes/comments/shares/gmv tied to video_performance
-- byte-for-byte (119,430 / 572 / 56 / 24 / $1,208.83).
--
-- ⚠️ NONE OF THESE IS A FACT TABLE. No RPC writes them, no page reads them, and
-- the ingest that fills them must never point at creator_performance,
-- video_performance or product_performance. If that line blurs, a bad shadow
-- run corrupts the very thing it exists to check.
--
-- Column provenance — all measured, none assumed:
--   traffic likes/comments/shares  -> /analytics/202509/shop_videos/{id}/performance
--   affiliate video/live GMV split -> /analytics/202605/shop_products/performance
--                                     (202509 is the THIN version — none of it)
--   refunds / refunded_items       -> same 202605 endpoint. The affiliate_seller
--                                     equivalents are documented "depreciated,
--                                     no value return", which is what made these
--                                     look unobtainable for most of the hunt.
--   product_name                   -> /affiliate_seller/202412/open_collaborations/search
--                                     (no analytics endpoint returns a name)

CREATE TABLE IF NOT EXISTS public.api_shadow_video_performance (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid        NOT NULL,
  brand_slug    text        NOT NULL,
  report_date   date        NOT NULL,
  video_id      text        NOT NULL,
  product_id    text,
  creator_name  text,
  video_title   text,
  post_date     timestamptz,
  gmv           numeric,
  items_sold    bigint,
  customers     bigint,
  views         bigint,
  likes         bigint,
  comments      bigint,
  shares        bigint,
  new_followers bigint,
  product_impressions bigint,
  product_clicks      bigint,
  ctr           numeric,
  gpm           numeric,
  fetched_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS api_shadow_video_key
  ON public.api_shadow_video_performance (run_id, video_id, coalesce(product_id, ''));

CREATE TABLE IF NOT EXISTS public.api_shadow_creator_performance (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid        NOT NULL,
  brand_slug    text        NOT NULL,
  report_date   date        NOT NULL,
  creator_name  text        NOT NULL,
  video_gmv     numeric,
  items_sold    bigint,
  customers     bigint,
  views         bigint,
  likes         bigint,
  comments      bigint,
  shares        bigint,
  product_impressions bigint,
  product_clicks      bigint,
  videos_with_sales   integer,
  fetched_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS api_shadow_creator_key
  ON public.api_shadow_creator_performance (run_id, creator_name);

CREATE TABLE IF NOT EXISTS public.api_shadow_product_performance (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid        NOT NULL,
  brand_slug    text        NOT NULL,
  report_date   date        NOT NULL,
  product_id    text        NOT NULL,
  product_name  text,
  total_gmv              numeric,
  affiliate_total_gmv    numeric,
  affiliate_video_gmv    numeric,
  affiliate_live_gmv     numeric,
  shop_tab_gmv           numeric,
  refunds                numeric,
  refunded_items         bigint,
  refund_customers       bigint,
  orders                 bigint,
  items_sold             bigint,
  aov                    numeric,
  ctr                    numeric,
  unique_ctr             numeric,
  product_impressions    bigint,
  product_clicks         bigint,
  unique_clicks          bigint,
  add_cart_count         bigint,
  add_cart_users         bigint,
  add_cart_rate          numeric,
  click_order_rate       numeric,
  estimated_customers    bigint,
  new_video_count        bigint,
  new_live_count         bigint,
  shop_tab_ctor_sku      numeric,
  fetched_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS api_shadow_product_key
  ON public.api_shadow_product_performance (run_id, product_id);

-- One row per run, so a partial or failed run is VISIBLE rather than looking
-- like a thin day — the same reason ingestion_runs exists for the manual path.
CREATE TABLE IF NOT EXISTS public.api_shadow_runs (
  run_id        uuid PRIMARY KEY,
  brand_slug    text        NOT NULL,
  report_date   date        NOT NULL,
  status        text        NOT NULL DEFAULT 'running',
  videos_listed integer,
  videos_detailed integer,
  products_fetched integer,
  api_calls     integer,
  error         text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  CONSTRAINT api_shadow_runs_status_check
    CHECK (status IN ('running','ok','partial','failed'))
);

-- House lockdown on all four. The REVOKE is NOT redundant with the GRANT:
-- Supabase's default privileges hand anon and authenticated the full arwdDxtm
-- set on every new table in public, so a GRANT list that merely omits anon
-- revokes nothing.
ALTER TABLE public.api_shadow_video_performance   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_shadow_creator_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_shadow_product_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_shadow_runs                ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.api_shadow_video_performance   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.api_shadow_creator_performance FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.api_shadow_product_performance FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.api_shadow_runs                FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.api_shadow_video_performance   TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.api_shadow_creator_performance TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.api_shadow_product_performance TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.api_shadow_runs                TO service_role;
