-- 168 · Data repair: serene_herbs 2026-08-09 and bondie 2026-08-15.
--
-- Both were found by the creator/video cross-check (see 167): on a healthy
-- brand-day sum(creator_performance.video_gmv) equals sum(video_performance.gmv)
-- to the cent. These two disagreed, and for two DIFFERENT reasons.
--
-- ── serene_herbs 2026-08-09 — received dr_dent's creator file ──────────────
--
-- All 16,834 rows byte-identical to dr_dent's own for that date, GMV and
-- orders. 16,834 rows against a normal ~2,540, 346 sellers against ~78,
-- $54,490.05 against a typical $17,308. dr_dent's own 08-09 sits perfectly
-- among its neighbours (15,876-17,075 rows, $43k-67k), so dr_dent is the
-- rightful owner and serene_herbs the victim.
--
-- ⚠️ NOTHING TO RESTORE. daily_creator_stats holds only ONE version of this
-- brand-day (created 2026-08-12, identical to the bad data). The mirror
-- sometimes preserves an older copy when a day is re-uploaded — not here,
-- because serene_herbs' real file was never uploaded at all. The day must be
-- re-uploaded from the source export.
--
-- Deleting beats leaving it: a MISSING day is visible in the coverage ledger
-- and prompts a re-upload; a WRONG day is invisible and was inflating store
-- GMV by ~$37,182/day — 22% of the 08-08..08-14 client report.
--
-- ── bondie 2026-08-15 — a 7-day CUMULATIVE export loaded as one day ────────
--
-- 4,081 rows against ~1,700 normal, $24,678 against ~$3,000. Recovered by
-- SUBTRACTION (the leefar_us 2026-06-18 method): the six preceding days hold
-- true dailies, so subtracting each creator's sum over them leaves their real
-- 08-15 figure.
--
-- ⚠️ THE PROOF IS THE ABSENCE OF NEGATIVES. Too long a window produces them
-- everywhere; at 6 days back there are ZERO across gmv, orders, items_sold,
-- video_gmv, est_commission and refunds, and at 7 days back 46 creators go
-- negative. The remainder lands on $2,625.47 / 96 orders, which equals
-- bondie's own video_performance file for that day EXACTLY on both — an
-- independent source that was never part of the calculation.
--
-- serene_herbs FAILS this test at every window (negatives throughout), which is
-- how the two incidents were told apart despite looking similar in aggregate.
--
-- ── Order of operations ───────────────────────────────────────────────────
--
-- ⚠️ The sync trigger on creator_performance fires on INSERT OR UPDATE and can
-- NEVER process a DELETE, so daily_creator_stats must be cleared BY HAND for
-- serene_herbs. Doing creator_performance first would leave the mirror holding
-- the only copy of the bad data, still feeding the brand portal.
--
-- bondie needs no mirror step: the trigger fires on UPDATE and upserts on
-- (report_date, brand_id, tiktok_username).
--
-- video_performance is untouched for both: serene_herbs' video file for 08-09
-- is its own ($6,739.93 / 3,808 rows, in line with neighbours), and bondie's
-- is what confirmed the repair.

-- ══ 1. Archive ════════════════════════════════════════════════════════════
create schema if not exists repair_archive;

create table if not exists repair_archive.cp_serene_herbs_20260809 as
  select * from public.creator_performance
  where brand = 'serene_herbs' and period_type = 'daily' and report_date = '2026-08-09';

create table if not exists repair_archive.dcs_serene_herbs_20260809 as
  select dcs.* from public.daily_creator_stats dcs
  join public.brands_v2 b on b.id = dcs.brand_id
  where b.slug = 'serene_herbs' and dcs.report_date = '2026-08-09';

create table if not exists repair_archive.cp_bondie_20260815 as
  select * from public.creator_performance
  where brand = 'bondie' and period_type = 'daily' and report_date = '2026-08-15';

-- ══ 2. bondie: subtract the six preceding days ════════════════════════════
-- Creators with no rows in 08-09..08-14 are deliberately left untouched: their
-- cumulative value IS their true 08-15 value. UPDATE ... FROM only matches
-- creators that have prior rows, which gives exactly that.
with prior as (
  select lower(btrim(regexp_replace(creator_name, '^@', ''))) as h,
         sum(coalesce(gmv, 0))::numeric                as gmv,
         sum(coalesce(refunds, 0))::numeric            as refunds,
         sum(coalesce(orders, 0))::int                 as orders,
         sum(coalesce(items_sold, 0))::int             as items_sold,
         sum(coalesce(items_refunded, 0))::int         as items_refunded,
         sum(coalesce(videos, 0))::int                 as videos,
         sum(coalesce(live_streams, 0))::int           as live_streams,
         sum(coalesce(est_commission, 0))::numeric     as est_commission,
         sum(coalesce(samples_shipped, 0))::int        as samples_shipped,
         sum(coalesce(est_flat_fee, 0))::numeric       as est_flat_fee,
         sum(coalesce(video_gmv, 0))::numeric          as video_gmv,
         sum(coalesce(live_gmv, 0))::numeric           as live_gmv,
         sum(coalesce(product_card_gmv, 0))::numeric   as product_card_gmv,
         sum(coalesce(video_views, 0))::bigint         as video_views,
         sum(coalesce(product_impressions, 0))::bigint as product_impressions,
         sum(coalesce(customers, 0))::int              as customers,
         sum(coalesce(products_sold, 0))::int          as products_sold
  from public.creator_performance
  where brand = 'bondie' and period_type = 'daily'
    and report_date between '2026-08-09' and '2026-08-14'
  group by 1
)
update public.creator_performance cp
set gmv                 = coalesce(cp.gmv, 0)                 - p.gmv,
    refunds             = coalesce(cp.refunds, 0)             - p.refunds,
    orders              = coalesce(cp.orders, 0)              - p.orders,
    items_sold          = coalesce(cp.items_sold, 0)          - p.items_sold,
    items_refunded      = coalesce(cp.items_refunded, 0)      - p.items_refunded,
    videos              = coalesce(cp.videos, 0)              - p.videos,
    live_streams        = coalesce(cp.live_streams, 0)        - p.live_streams,
    est_commission      = coalesce(cp.est_commission, 0)      - p.est_commission,
    samples_shipped     = coalesce(cp.samples_shipped, 0)     - p.samples_shipped,
    est_flat_fee        = coalesce(cp.est_flat_fee, 0)        - p.est_flat_fee,
    video_gmv           = coalesce(cp.video_gmv, 0)           - p.video_gmv,
    live_gmv            = coalesce(cp.live_gmv, 0)            - p.live_gmv,
    product_card_gmv    = coalesce(cp.product_card_gmv, 0)    - p.product_card_gmv,
    video_views         = coalesce(cp.video_views, 0)         - p.video_views,
    product_impressions = coalesce(cp.product_impressions, 0) - p.product_impressions,
    customers           = coalesce(cp.customers, 0)           - p.customers,
    products_sold       = coalesce(cp.products_sold, 0)       - p.products_sold,
    -- aov is DERIVED. Subtracting an average would be meaningless, so it is
    -- recomputed from the repaired gmv and orders.
    aov = case when (coalesce(cp.orders, 0) - p.orders) > 0
               then round((coalesce(cp.gmv, 0) - p.gmv) / (coalesce(cp.orders, 0) - p.orders), 2)
               else 0 end
from prior p
where cp.brand = 'bondie'
  and cp.period_type = 'daily'
  and cp.report_date = '2026-08-15'
  and p.h = lower(btrim(regexp_replace(cp.creator_name, '^@', '')));

-- ══ 3. serene_herbs: remove dr_dent's file. MIRROR FIRST. ═════════════════
delete from public.daily_creator_stats dcs
using public.brands_v2 b
where b.id = dcs.brand_id
  and b.slug = 'serene_herbs'
  and dcs.report_date = '2026-08-09';

delete from public.creator_performance
where brand = 'serene_herbs'
  and period_type = 'daily'
  and report_date = '2026-08-09';

comment on schema repair_archive is
  'Pre-repair snapshots of production rows. 2026-08-27: serene_herbs 2026-08-09 (received dr_dent''s '
  'creator file, all 16,834 rows byte-identical) and bondie 2026-08-15 (a 7-day cumulative export '
  'loaded as one day).';

-- ══ 4. Caches ═════════════════════════════════════════════════════════════
-- Run AFTER the repairs, not as part of them:
--
--   select public.rebuild_brand_daily_stats();                                -- 2,679 rows
--   select public.refresh_roster_creator_daily_range('2026-08-09','2026-08-10');
--   select public.refresh_roster_creator_daily_range('2026-08-15','2026-08-16');
--   select public.refresh_roster_universe_daily_range('2026-08-09','2026-08-10');
--   select public.refresh_roster_universe_daily_range('2026-08-15','2026-08-16');
--
-- ⚠️ Use the SINGLE-DAY range functions, not refresh_roster_summaries(20).
-- The window variants rebuild every brand for the whole range and exceed the
-- connection timeout; each range function deletes its own range first, so a
-- one-day call is self-contained and fast.
--
-- Verified after: brand_daily_stats and roster_creator_daily agree with the
-- repaired source on every day for both brands.
