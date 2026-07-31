-- 133_compass_verifications.sql
--
-- Compass as a WATCHDOG on the manual upload, not a replacement for it.
--
-- Measured 2026-07-31: Compass's only working module is CREATOR (VIDEO and
-- PRODUCT are refused at task creation), and its report carries 11 of the 23
-- columns the Affiliate Center download has. It cannot feed a fact table.
--
-- But those 11 include GMV, orders, items sold, refunds and items refunded per
-- creator per day, fetched with nobody touching a file. That is an INDEPENDENT
-- second opinion on what the upload claims — exactly what was missing during
-- the July incident and the 5,000-row truncations, where a short export and a
-- quiet day looked identical until invoicing.
--
-- ⚠️ NOTHING WRITES TO A FACT TABLE. This is evidence ABOUT the upload, stored
-- beside it, never merged into it.

CREATE TABLE IF NOT EXISTS public.compass_verifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_slug      text        NOT NULL,
  report_date     date        NOT NULL,

  api_gmv         numeric,
  api_orders      bigint,
  api_items_sold  bigint,
  api_refunds     numeric,
  api_creators    integer,

  -- Read at the same instant as the API side, so the two are compared as of one
  -- moment rather than across a drift.
  csv_gmv         numeric,
  csv_creators    integer,
  csv_loaded_at   timestamptz,

  -- Signed: POSITIVE means the API found MORE than the CSV, i.e. the upload is
  -- short. Stored rather than derived so a later change to either side cannot
  -- silently rewrite history.
  gmv_delta       numeric,
  gmv_delta_pct   numeric,

  -- ⚠️ csv_missing and api_unavailable are DELIBERATELY distinct from a zero
  -- delta. "The upload is absent", "the API could not be read" and "the two
  -- agree" must never render the same — the coverage ledger's rule.
  verdict         text        NOT NULL,
  detail          text,

  task_id         text,
  checked_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT compass_verifications_verdict_check
    CHECK (verdict IN ('match','csv_short','csv_over','csv_missing','api_unavailable'))
);

-- One verdict per brand-day, refreshed in place: a re-check is a correction,
-- not a second opinion to accumulate.
CREATE UNIQUE INDEX IF NOT EXISTS compass_verifications_brand_day_idx
  ON public.compass_verifications (brand_slug, report_date);

CREATE INDEX IF NOT EXISTS compass_verifications_problems_idx
  ON public.compass_verifications (verdict, report_date DESC)
  WHERE verdict <> 'match';

-- House lockdown: RLS on with no policy, EXPLICIT revoke (Supabase's default
-- privileges grant anon and authenticated the full arwdDxtm set on every new
-- table in public, so a GRANT list that merely omits anon revokes nothing),
-- service_role only.
ALTER TABLE public.compass_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.compass_verifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.compass_verifications TO service_role;
