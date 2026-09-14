-- Complete content snapshots are separate from bounded performance details.
CREATE TABLE public.api_shadow_content_inventory (
  run_id uuid NOT NULL REFERENCES public.api_shadow_runs(run_id),
  video_id text NOT NULL,
  brand_slug text NOT NULL,
  report_date date NOT NULL,
  creator_name text,
  creator_open_id text,
  video_title text,
  post_time_raw text,
  post_time_zone text, -- null until the vendor timezone is verified
  seller_video_gmv numeric,
  affiliate_video_gmv numeric, -- intentionally null until same-grain validation
  views bigint,
  source_version text NOT NULL,
  source_account_type text NOT NULL,
  raw_video jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, video_id)
);
ALTER TABLE public.api_shadow_content_inventory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_shadow_content_inventory FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_shadow_content_inventory TO service_role;
CREATE INDEX ON public.api_shadow_content_inventory(brand_slug, report_date);
ALTER TABLE public.api_shadow_runs
  ADD COLUMN inventory_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN detail_offset integer,
  ADD COLUMN detail_limit integer;
ALTER TABLE public.api_shadow_video_performance
  ADD COLUMN seller_video_gmv numeric,
  ADD COLUMN affiliate_video_gmv numeric,
  ADD COLUMN post_time_raw text;
ALTER TABLE public.api_shadow_creator_performance
  ADD COLUMN seller_video_gmv numeric,
  ADD COLUMN affiliate_video_gmv numeric;
COMMENT ON COLUMN public.api_shadow_video_performance.gmv IS 'Legacy unvalidated detail GMV. New captures use seller_video_gmv; never invoice from this field.';
COMMENT ON COLUMN public.api_shadow_creator_performance.video_gmv IS 'Legacy unvalidated detail rollup. New captures use seller_video_gmv; not Affiliate Center parity.';
