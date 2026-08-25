-- 158_canonical_managed_handles.sql
--
-- The roster's handles live in TWO places and the report path only read one.
--
-- ── What was wrong ──────────────────────────────────────────────────────────
--
-- A managed creator's TikTok handles are stored both in
-- managed_creators.account_1..10 AND in tiktok_accounts (keyed by creator_id).
-- Measured 2026-08-25 over active roster rows:
--
--     3,091  in BOTH
--     1,003  ONLY in tiktok_accounts   <- invisible to the report path
--        99  ONLY in the account_ columns
--
-- managed_brand_handles unnests the account_ columns only, so those 1,003
-- handles were roster to nobody. Restricted to handles that actually earned:
-- 35 handles carrying **$57,879.02 of GMV in the trailing 30 days** that the
-- client report never credited to the roster. Roster GMV for that window goes
-- $1,923,323.69 -> $1,981,202.71.
--
-- This is the MIRROR of migration 157. There the report OVER-counted by
-- including creators who had left; here it UNDER-counts by not seeing handles
-- it never knew about. The dashboard path does not share this bug, because
-- buildManagedLookup prefers tiktok_accounts when a creator_id exists — a third
-- way the two surfaces disagreed.
--
-- Found while checking a "bulk upload" CSV for Kitsch that turned out to be an
-- export of the 72 creators already in the system: 72 rows against 72 roster
-- rows, and 116 handles against 116 in tiktok_accounts but only 72 in the
-- account_ columns. That 72-vs-116 split is this bug in miniature.
--
-- ── ⚠️ Why a naive UNION is not safe everywhere ─────────────────────────────
--
-- 84 (brand, handle) pairs map to TWO OR MORE creator rows. For a set
-- membership test ("is this handle roster?") that is harmless — the view is
-- DISTINCT on (brand_slug, handle) and carries no creator identity, so a handle
-- cannot be counted twice.
--
-- But get_brand_client_report_granular JOINS handle -> creator to build the
-- per-creator table, and there a shared handle attributes the same GMV to BOTH
-- creators. That path already had 4 such collisions; a naive union would raise
-- it to 15 and put $13,930.83 of trailing-30-day GMV at risk of being counted
-- twice. So the granular path resolves each handle to exactly ONE creator:
-- prefer the row that is not archived, then the one carrying a creator_id (the
-- canonical identity), then the lowest id purely so the choice is stable.
--
-- ── Performance, and two things that did NOT work ────────────────────────────
--
-- get_brand_client_report_managed_split costs ~9s on a 30-day kitsch window.
-- That is NOT caused by the union (which only touches roster-sized CTEs) and it
-- is not the report's bottleneck: get_brand_client_report_counts costs 13.3s on
-- the same window and they run in Promise.all, so the parallel max is unchanged.
--
-- Two attempts to cut it barely moved:
--   * collapsing nine scalar subqueries into one FILTER pass:  10.5s -> 9.5s
--   * pre-aggregating to handle grain to kill a 45MB external
--     merge sort from count(distinct):                          9.5s -> 9.0s
-- Both are kept because they are strictly better, but the honest floor is the
-- base scan: kitsch has 1,242,633 creator_performance rows across a 30-day
-- window plus its prior, and the index-only scan of those alone measures 7.5s.
-- Do not go looking for a clever rewrite here; the row count is the cost.
--
-- ── Scope ───────────────────────────────────────────────────────────────────
--
-- Replacing the view fixes every live consumer at once, and there are only
-- three that matter: get_brand_client_report_agg (its managed_top_creators /
-- managed_top_videos / newly_activated — its managed GMV is already overridden
-- by migration 157's split), get_managed_posts_base (/posts) and
-- get_top_videos_by_window_gmv. get_weekly_kpi_report also reads it, but that
-- feature was deleted.
--
-- The view keeps EXACTLY its two existing columns and its DISTINCT grain, so no
-- consumer changes shape. It simply stops missing rows.
--
-- ⚠️ SEPARATE data-quality finding, deliberately NOT changed here: 194 active
-- roster rows have no handle in account_1..5, and only 4 of them have any
-- tiktok_accounts entry. So ~190 roster rows carry a name and no TikTok handle
-- at all. They can never be attributed GMV, yet they count toward the signed
-- creator total shown to clients.


-- ── 1. One canonical source of roster handles ───────────────────────────────
create or replace view public.managed_brand_handles as
  select distinct brand_slug, handle from (
    select mc.brand                                             as brand_slug,
           lower(btrim(regexp_replace(h.handle, '^@', '')))     as handle
    from public.managed_creators mc
      cross join lateral (values
        (mc.account_1), (mc.account_2), (mc.account_3), (mc.account_4), (mc.account_5),
        (mc.account_6), (mc.account_7), (mc.account_8), (mc.account_9), (mc.account_10)
      ) h(handle)
    where h.handle is not null and btrim(h.handle) <> ''

    union all

    -- The half that was missing. Joined on creator_id, so it only ever adds
    -- handles belonging to a creator already on the roster.
    select mc.brand,
           lower(btrim(regexp_replace(t.tiktok_username, '^@', '')))
    from public.managed_creators mc
    join public.tiktok_accounts t on t.creator_id = mc.creator_id
    where mc.creator_id is not null
      and t.tiktok_username is not null and btrim(t.tiktok_username) <> ''
  ) u;

-- ── 2/3/4. The three migration-157 helpers gain the same union ──────────────
--
-- They unnest the account_ columns directly rather than reading the view,
-- because they also need archived_at (and, for the granular path, creator
-- identity). Applied to production as:
--
--   managed_split_preaggregate_by_handle   get_brand_client_report_managed_split
--   granular_canonical_handles             get_brand_client_report_granular
--   counts_canonical_handles               get_brand_client_report_counts
--
-- Each is the migration-157 body with a `src` CTE that unions
-- managed_creators.account_1..10 with tiktok_accounts joined on creator_id,
-- collapsed to handle grain in `mem` (safe: set membership, not a join), plus
-- the DISTINCT ON (handle) resolution in the granular path described above.
-- See 157 for the time-aware membership rule those bodies implement.
--
-- Verified after applying, 2026-08-15..21 across seven brands: managed +
-- organic reconciles to the store total to 0.00 on every one, and no creator
-- appears twice in the per-creator list.
