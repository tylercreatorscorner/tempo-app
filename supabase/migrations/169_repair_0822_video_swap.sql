-- 169 · Data repair: the 2026-08-22 video-slot swap (catakor / jiyu).
--
-- On 2026-08-22 the video files went into the wrong brand slots:
--
--   leefar_us   slot holds leefar_us  ($40,580.18)  ✅ correct
--   catakor     slot holds LEEFAR_US  ($40,580.18)  ❌ duplicate
--   jiyu        slot holds CATAKOR    ($25,132.96)  ❌ and it is the ONLY
--                                                      copy of catakor's real
--                                                      video day
--
-- ── How each brand's truth was established ────────────────────────────────
--
-- Each brand's own CREATOR file is the referee. It is an independent export
-- that was never part of the shuffle, and creator_performance was correct
-- throughout — which is exactly why this hid: store GMV still reconciled and
-- every dashboard looked right. Only per-video numbers were wrong.
--
--   leefar_us creator file video_gmv = $40,580.18  → its slot is right
--   catakor   creator file video_gmv = $25,132.96  → equals JIYU's slot
--   jiyu      creator file video_gmv = $17,168.84  → matches nothing; lost
--
-- ⚠️ THE RELABEL WAS VERIFIED, NOT ASSUMED. Aggregating jiyu's slot per creator
-- and comparing against catakor's creator file: 1,991 handles compared, 1,991
-- exact to the cent, ZERO mismatched, and no catakor creator carrying GMV
-- missing from it. Moving those rows to catakor therefore RESTORES catakor's
-- real day rather than approximating it.
--
-- ── Order of operations, and why ──────────────────────────────────────────
--
-- 1. video_performance is UNIQUE (video_id, product_id, brand, report_date),
--    so catakor's rows must be deleted BEFORE jiyu's are relabelled onto
--    catakor, or the update collides.
-- 2. The sync trigger fires on INSERT OR UPDATE and can NEVER process a
--    DELETE. It upserts into daily_video_product_stats on
--    (report_date, brand_id, video_id, product_id) — a key the two files do
--    NOT share — so stale mirror rows for BOTH brands must be cleared by hand
--    first. Otherwise the relabelled rows are ADDED ALONGSIDE the old ones
--    instead of replacing them, and the mirror silently doubles.
--
-- leefar_us is untouched: its own slot is correct and complete, which is what
-- makes catakor's copy safe to delete.

-- ══ 1. Archive ════════════════════════════════════════════════════════════
create table if not exists repair_archive.vp_catakor_20260822 as
  select * from public.video_performance
  where brand = 'catakor' and period_type = 'daily' and report_date = '2026-08-22';

create table if not exists repair_archive.vp_jiyu_20260822 as
  select * from public.video_performance
  where brand = 'jiyu' and period_type = 'daily' and report_date = '2026-08-22';

create table if not exists repair_archive.dvps_catakor_20260822 as
  select dv.* from public.daily_video_product_stats dv
  join public.brands_v2 b on b.id = dv.brand_id
  where b.slug = 'catakor' and dv.report_date = '2026-08-22';

create table if not exists repair_archive.dvps_jiyu_20260822 as
  select dv.* from public.daily_video_product_stats dv
  join public.brands_v2 b on b.id = dv.brand_id
  where b.slug = 'jiyu' and dv.report_date = '2026-08-22';

-- ══ 2. Mirror first, BOTH brands ══════════════════════════════════════════
delete from public.daily_video_product_stats dv
using public.brands_v2 b
where b.id = dv.brand_id
  and b.slug in ('catakor', 'jiyu')
  and dv.report_date = '2026-08-22';

-- ══ 3. Drop catakor's duplicate of leefar_us ══════════════════════════════
delete from public.video_performance
where brand = 'catakor' and period_type = 'daily' and report_date = '2026-08-22';

-- ══ 4. Move catakor's real file out of jiyu's slot ════════════════════════
-- The trigger repopulates daily_video_product_stats under catakor as it goes.
update public.video_performance
set brand = 'catakor'
where brand = 'jiyu' and period_type = 'daily' and report_date = '2026-08-22';

-- ══ 5. Rollups ════════════════════════════════════════════════════════════
-- Run after, NOT as part of this:
--
--   select public.refresh_roster_creator_daily_range('2026-08-22','2026-08-23');
--   select public.refresh_roster_creator_posts_range ('2026-08-22','2026-08-23');
--
-- A wider rebuild is NOT needed, and that was measured rather than assumed.
-- roster_creator_daily keys posts on POST_DATE, and the relabelled file spans
-- 438 distinct post-dates back to 2025-06-06 — far too wide to rebuild. But:
--
--   videos in jiyu's old slot that appear under jiyu NOWHERE else:  0
--   videos newly owed to catakor that appear under catakor nowhere: 25 (5 of
--                                                    them in the last 40 days)
--
-- Zero phantoms because one video legitimately carries products for several
-- brands, so those ids already existed under jiyu from other days. The 25 are
-- negligible and the nightly 40-day refresh picks up the recent 5.
--
-- ── Verified after ────────────────────────────────────────────────────────
--
--   catakor 08-22   video slot $25,132.96 == its creator file, mirror agrees
--   jiyu    08-22   0 rows — honestly absent, pending re-upload
--   leefar  08-22   untouched, still agrees with its creator file
--   catakor 08-17..23  cp_video $186,487.51 == video_performance $186,487.51
--   Chian (@evewellness1) 0 rows under jiyu, 390 rows / $5,599.55 under catakor
--
-- And the client report gap that started this investigation:
--   Cata-Kor 08-17..23 unattributed GMV $19,741.00 -> $2,703.11, which now
--   equals live + product-card GMV EXACTLY. That residue is structural: lives
--   are creator-day grain and cannot appear in a video table at all.
--
-- ⚠️ STILL OWED: jiyu's real 2026-08-22 video file must be re-uploaded
-- (~$17,168.84 expected, per its creator file).
