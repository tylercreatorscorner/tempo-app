-- 157_time_aware_roster_membership.sql
--
-- "Managed" had two definitions and neither was right.
--
-- ── What Tyler saw ──────────────────────────────────────────────────────────
--
-- Keeps, 2026-08-15..21. The client report said roster GMV $2,493.50 (35.5% of
-- total); the admin dashboard said managed GMV $1,920.81. Total affiliate GMV
-- agreed exactly ($7,026.34), so only "managed" disagreed. The whole $572.69
-- gap was ONE creator, dealsfromjack.
--
-- ── The two definitions ─────────────────────────────────────────────────────
--
--   REPORT     public.managed_brand_handles — a view over managed_creators
--              with NO archived filter at all. A creator who left the roster a
--              year ago still counts as managed, forever.
--
--   DASHBOARD  buildManagedLookup() — managed_creators WHERE archived_at IS
--              NULL, evaluated as of NOW.
--
-- dealsfromjack was archived on 08-23, two days AFTER the window closed. They
-- were on the Keeps roster for every day of 08-15..21 and earned that $572.69
-- while on it, so for Keeps the REPORT was right.
--
-- But across all brands for that same week:
--     $6,439.89  from creators archived BEFORE the window  (report is wrong)
--       $665.16  from creators archived AFTER  the window  (dashboard is wrong)
--
-- Measured 2026-08-01..21, every brand:
--     report definition     $1,535,917.70
--     dashboard definition  $1,513,873.87
--     time-aware (correct)  $1,516,147.26
--
-- The dashboard rule has the nastier property: it makes history MUTABLE.
-- Archiving a creator today silently reduces last week's and last month's
-- managed GMV, so a report generated in July no longer reproduces.
--
-- ── The rule this migration establishes ─────────────────────────────────────
--
-- A creator's GMV counts as managed for a given DAY when they had not been
-- archived before that day:
--
--     archived_at IS NULL  OR  archived_at::date > report_date
--
-- Day grain, not window grain, so a creator archived mid-window contributes
-- exactly the days they were on the roster and not one day more.
--
-- ⚠️ DO NOT add a joined_at guard. It looks like the symmetric bound and is
-- not: $882,991 of GMV over the trailing 90 days PREDATES the creator's
-- joined_at, because joined_at is largely when the row was created in Tempo
-- rather than when the creator joined the roster. Gating on it would erase
-- real, earned GMV.
--
-- ⚠️ employment_status = 'active' does NOT imply not-archived. Archiving does
-- not reset employment_status, which is why the roster CTE below needs BOTH.
--
-- ── Retainer budget was the same bug ────────────────────────────────────────
--
-- get_brand_client_report_granular built its roster from employment_status
-- alone, so archived creators carried their retainers into the budget the
-- client is shown. Keeps: $46,000 reported against $30,500 real, $15,500 from
-- 10 archived creators. Worse elsewhere — leefar_nutrition reported $61,201
-- against $0 (all 34 archived), leefar_supplements $58,901 against $0 (33),
-- cosrx $20,700 against $0 (23).
--
-- Retainer budget and roster composition are CURRENT-STATE questions ("what is
-- being paid per month"), so they take a plain archived_at IS NULL. Only the
-- historical GMV/posts attribution is time-aware. The creator LIST spans the
-- window, so it keeps anyone who was on the roster during it and drops only
-- those who had already left.
--
-- Scope: the client report. The same managed_brand_handles view is still read
-- unfiltered by migrations 079, 088, 090, 094 and 095 (/posts, windowed video
-- GMV, engagement, reviews), and earnings/invoices + contest entrants still use
-- the now-based dashboard rule. Both are deliberately left for their own pass;
-- the money path is not being changed here.

-- ── 1. Time-aware managed / organic split ───────────────────────────────────
--
-- Deliberately a SEPARATE function rather than a patch to
-- get_brand_client_report_agg, which is 8kB of interlocking CTEs on the
-- invoice/earnings path. The caller overrides the affected fields, exactly the
-- pattern migration 153 used for the corrected counts. One reviewable place.
--
-- Returns prior-window figures on the SAME basis so the period-over-period
-- deltas do not move for a reason that is not performance.
create or replace function public.get_brand_client_report_managed_split(
  p_data_slugs   text[],
  p_roster_slugs text[],
  p_start        date,
  p_end          date,
  p_prior_start  date,
  p_prior_end    date
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '60s'
as $function$
  with mem as materialized (
    -- One row per handle. A handle is managed on day D when ANY roster row for
    -- it is either still active or was archived after D, so a creator holding
    -- two rows (re-signed later) is not dropped by the archived one.
    select lower(btrim(regexp_replace(h.handle, '^@', ''))) as handle,
           bool_or(mc.archived_at is null)                  as ever_active,
           max(mc.archived_at)::date                        as archived_on
    from public.managed_creators mc
      cross join lateral (values
        (mc.account_1), (mc.account_2), (mc.account_3), (mc.account_4), (mc.account_5),
        (mc.account_6), (mc.account_7), (mc.account_8), (mc.account_9), (mc.account_10)
      ) h(handle)
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and h.handle is not null and btrim(h.handle) <> ''
    group by 1
  ),
  tagged as materialized (
    select lower(btrim(regexp_replace(cp.creator_name, '^@', ''))) as handle,
           cp.gmv::numeric            as gmv,
           cp.orders::bigint          as orders,
           cp.est_commission::numeric as commission,
           (cp.report_date between p_start       and p_end)       as in_cur,
           (cp.report_date between p_prior_start and p_prior_end) as in_pri,
           (m.handle is not null
             and (m.ever_active or m.archived_on > cp.report_date))          as is_managed
    from public.creator_performance cp
    left join mem m
      on m.handle = lower(btrim(regexp_replace(cp.creator_name, '^@', '')))
    where cp.period_type = 'daily'
      and (p_data_slugs is null or cp.brand = any(p_data_slugs))
      and cp.report_date between least(p_start, p_prior_start) and greatest(p_end, p_prior_end)
      and cp.creator_name is not null and btrim(cp.creator_name) <> ''
  )
  select jsonb_build_object(
    'managed', jsonb_build_object(
      'gmv',        coalesce((select sum(gmv)        from tagged where in_cur and is_managed), 0),
      'orders',     coalesce((select sum(orders)     from tagged where in_cur and is_managed), 0),
      'commission', coalesce((select sum(commission) from tagged where in_cur and is_managed), 0),
      'creators',   (select count(distinct handle)   from tagged where in_cur and is_managed)
    ),
    'organic', jsonb_build_object(
      'gmv',      coalesce((select sum(gmv)      from tagged where in_cur and not is_managed), 0),
      'orders',   coalesce((select sum(orders)   from tagged where in_cur and not is_managed), 0),
      'creators', (select count(distinct handle) from tagged where in_cur and not is_managed)
    ),
    'managed_prior', jsonb_build_object(
      'gmv',      coalesce((select sum(gmv)      from tagged where in_pri and is_managed), 0),
      'orders',   coalesce((select sum(orders)   from tagged where in_pri and is_managed), 0),
      'creators', (select count(distinct handle) from tagged where in_pri and is_managed)
    )
  );
$function$;

-- A GRANT list that merely omits anon revokes NOTHING: EXECUTE defaults to
-- PUBLIC. Name PUBLIC explicitly, then grant only what should call it.
-- authenticated AND service_role: buildClientReportSnapshot runs on the COOKIE
-- client as the signed-in admin, so service_role alone is permission-denied and
-- the caller's non-fatal handler would swallow it into silence (migration 153).
revoke all on function public.get_brand_client_report_managed_split(text[], text[], date, date, date, date)
  from public, anon, authenticated;
grant execute on function public.get_brand_client_report_managed_split(text[], text[], date, date, date, date)
  to authenticated, service_role;


-- ── 2. Granular block: retainer budget, composition, and the creator list ───
--
-- Only three things change from migration 152:
--   a) `roster` carries archived_at and is split into two audiences;
--   b) composition + retainer budget read the CURRENT roster only;
--   c) roster_handles spans the window and the facts join is DAY-aware, so a
--      creator archived mid-window contributes exactly their roster days.
create or replace function public.get_brand_client_report_granular(
  p_data_slugs   text[],
  p_roster_slugs text[],
  p_start        date,
  p_end          date
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '60s'
as $function$
  with roster as (
    select mc.id,
           coalesce(nullif(trim(mc.real_name), ''), mc.account_1) as display_name,
           coalesce(mc.retainer, 0)::numeric                      as retainer,
           case when coalesce(mc.retainer, 0) > 0
                then nullif(mc.monthly_post_requirement, 0) end   as quota,
           mc.archived_at::date                                   as archived_on,
           array_remove(array[
             lower(trim(replace(mc.account_1 , '@',''))), lower(trim(replace(mc.account_2 , '@',''))),
             lower(trim(replace(mc.account_3 , '@',''))), lower(trim(replace(mc.account_4 , '@',''))),
             lower(trim(replace(mc.account_5 , '@',''))), lower(trim(replace(mc.account_6 , '@',''))),
             lower(trim(replace(mc.account_7 , '@',''))), lower(trim(replace(mc.account_8 , '@',''))),
             lower(trim(replace(mc.account_9 , '@',''))), lower(trim(replace(mc.account_10, '@','')))
           ], null)                                               as handles
    from public.managed_creators mc
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and mc.employment_status = 'active'
      -- ⚠️ employment_status alone is NOT enough. Archiving does not reset it,
      -- so 10 archived Keeps creators kept carrying $15,500 of retainer into
      -- the budget the client was shown. Creators who left BEFORE the window
      -- drop out entirely; one who left DURING it stays, for the days they
      -- were actually on the roster.
      and (mc.archived_at is null or mc.archived_at::date > p_start)
  ),
  -- What the brand is paying for RIGHT NOW. Someone who left mid-window is
  -- still listed below for the GMV they earned, but is not a standing cost.
  roster_current as (select * from roster where archived_on is null),
  roster_handles as (
    select r.id, h.handle, r.archived_on
    from roster r, unnest(r.handles) as h(handle)
    where h.handle <> ''
  ),
  facts as (
    select dv.video_id,
           dv.post_date,
           coalesce(dv.gmv, 0)::numeric   as gmv,
           coalesce(dv.orders, 0)::bigint as orders,
           rh.id                          as creator_id
    from public.daily_video_product_stats dv
    join public.brands_v2 b on b.id = dv.brand_id
    left join roster_handles rh
      on rh.handle = lower(trim(replace(dv.tiktok_username, '@','')))
      -- DAY grain: earnings on or after the archive date are no longer roster.
      and (rh.archived_on is null or dv.report_date < rh.archived_on)
    where (p_data_slugs is null or b.slug = any(p_data_slugs))
      and dv.report_date between p_start and p_end
  ),
  roster_facts as (select * from facts where creator_id is not null),

  -- posts_published counts on post_date (what they put up in the window);
  -- videos_earning counts presence in the window (what was live). The two
  -- differ by an order of magnitude and are never given the same name.
  per_creator as (
    select creator_id,
           count(distinct video_id) filter (where post_date::date between p_start and p_end) as posts_published,
           count(distinct video_id)                                                          as videos_earning,
           sum(gmv)                                                                          as gmv,
           sum(orders)                                                                       as orders
    from roster_facts
    group by creator_id
  ),
  vintage as (
    select date_trunc('month', post_date)::date as posted_month,
           count(distinct video_id)             as videos,
           sum(gmv)                             as gmv
    from roster_facts
    group by 1
  ),
  top3 as (
    select posted_month from vintage
    where posted_month is not null
    order by posted_month desc
    limit 3
  )

  select jsonb_build_object(
    'roster', (
      select jsonb_build_object(
        'signed',                count(*),
        'onRetainer',            count(*) filter (where retainer > 0),
        'affiliateOnly',         count(*) filter (where retainer = 0),
        'monthlyRetainerBudget', coalesce(sum(retainer), 0)
      ) from roster_current
    ),

    'videoCounts', (
      select jsonb_build_object(
        'postsPublished', coalesce(count(distinct video_id) filter (where post_date::date between p_start and p_end), 0),
        'videosEarning',  coalesce(count(distinct video_id), 0)
      ) from roster_facts
    ),

    'newVideo', (
      select jsonb_build_object(
        'gmv30d',    coalesce(sum(gmv)                   filter (where post_date::date > p_end - 30), 0),
        'videos30d', coalesce(count(distinct video_id)   filter (where post_date::date > p_end - 30), 0),
        'totalGmv',  coalesce(sum(gmv), 0),
        -- GMV whose video has no post_date at all. Small (0.5% on Lemme) but
        -- real: it belongs to NEITHER bucket, and is surfaced so the split is
        -- allowed not to add up rather than quietly absorbing it.
        'unknownPostDateGmv', coalesce(sum(gmv) filter (where post_date is null), 0)
      ) from roster_facts
    ),

    'vintage', coalesce((
      select jsonb_agg(jsonb_build_object(
               'label',  to_char(v.posted_month, 'Mon YYYY'),
               'videos', v.videos,
               'gmv',    v.gmv
             ) order by v.posted_month desc)
      from vintage v
      where v.posted_month in (select posted_month from top3)
    ), '[]'::jsonb),

    'vintageOlder', (
      select jsonb_build_object(
        'videos', coalesce(sum(videos), 0),
        'gmv',    coalesce(sum(gmv), 0)
      )
      from vintage
      where posted_month is null
         or posted_month < (select min(posted_month) from top3)
    ),

    'creators', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',           r.display_name,
               'handle',         r.handles[1],
               'isAffiliate',    r.retainer = 0,
               -- Someone who left mid-window keeps their earned GMV but is not
               -- a standing retainer, so the cost shown is zeroed to reconcile
               -- with monthlyRetainerBudget above.
               'retainer',       case when r.archived_on is null then r.retainer else 0 end,
               'quota',          case when r.archived_on is null then r.quota end,
               'departed',       r.archived_on is not null,
               'postsPublished', coalesce(pc.posts_published, 0),
               'videosEarning',  coalesce(pc.videos_earning, 0),
               'gmv',            coalesce(pc.gmv, 0),
               'orders',         coalesce(pc.orders, 0)
             ) order by coalesce(pc.gmv, 0) desc, r.display_name)
      from roster r
      left join per_creator pc on pc.creator_id = r.id
    ), '[]'::jsonb)
  );
$function$;

revoke all on function public.get_brand_client_report_granular(text[], text[], date, date)
  from public, anon, authenticated;
grant execute on function public.get_brand_client_report_granular(text[], text[], date, date)
  to authenticated, service_role;


-- ── 3. Corrected counts: signed/active people and roster posts ──────────────
--
-- Two fixes to migration 153. `ppl` gained the archived guard for the same
-- reason as the roster CTE above, and `mh` became time-aware so a post counts
-- as roster only when its author was on the roster on the day they posted.
create or replace function public.get_brand_client_report_counts(
  p_data_slugs   text[],
  p_roster_slugs text[],
  p_start        date,
  p_end          date,
  p_prior_start  date,
  p_prior_end    date
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '60s'
as $function$
  with mem as materialized (
    select lower(btrim(regexp_replace(h.handle, '^@', ''))) as handle,
           bool_or(mc.archived_at is null)                  as ever_active,
           max(mc.archived_at)::date                        as archived_on
    from public.managed_creators mc
      cross join lateral (values
        (mc.account_1), (mc.account_2), (mc.account_3), (mc.account_4), (mc.account_5),
        (mc.account_6), (mc.account_7), (mc.account_8), (mc.account_9), (mc.account_10)
      ) h(handle)
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and h.handle is not null and btrim(h.handle) <> ''
    group by 1
  ),
  posts as materialized (
    select vp.video_id, vp.post_date::date as posted,
           lower(btrim(regexp_replace(vp.creator_name, '^@', ''))) as handle
    from public.video_performance vp
    where vp.period_type = 'daily'
      and vp.video_id is not null and vp.video_id <> ''
      and vp.post_date is not null
      and (p_data_slugs is null or vp.brand = any(p_data_slugs))
      -- Uses idx_video_perf_brand_postdate (migration 155). Do NOT reintroduce
      -- the old report_date floor: it made the cost scale with how much data
      -- exists AFTER the window.
      and vp.post_date::date between least(p_prior_start, p_start) and greatest(p_prior_end, p_end)
    group by 1, 2, 3
  ),
  -- Roster membership evaluated on the POST date, not on today.
  roster_posts as materialized (
    select p.*
    from posts p
    join mem m on m.handle = p.handle
    where m.ever_active or m.archived_on > p.posted
  ),
  ppl as materialized (
    select mc.id, lower(btrim(replace(h.handle, '@', ''))) as handle
    from public.managed_creators mc,
         lateral (values (mc.account_1),(mc.account_2),(mc.account_3),(mc.account_4),(mc.account_5),
                         (mc.account_6),(mc.account_7),(mc.account_8),(mc.account_9),(mc.account_10)) h(handle)
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and mc.employment_status = 'active'
      -- Archiving does not reset employment_status, so both are required.
      and mc.archived_at is null
      and h.handle is not null and btrim(h.handle) <> ''
  ),
  -- ONE pass over creator_performance for both windows. The per-creator LATERAL
  -- version of this timed out at 60s: 142 creators x 2 laterals over a 5.8M-row
  -- table is 284 scans of the same data.
  cp_agg as materialized (
    select lower(btrim(regexp_replace(cp.creator_name, '^@', ''))) as handle,
           coalesce(sum(cp.gmv) filter (where cp.report_date between p_start and p_end), 0)             as cur_gmv,
           coalesce(sum(cp.gmv) filter (where cp.report_date between p_prior_start and p_prior_end), 0) as pri_gmv
    from public.creator_performance cp
    where cp.period_type = 'daily'
      and (p_data_slugs is null or cp.brand = any(p_data_slugs))
      and cp.report_date between least(p_prior_start, p_start) and greatest(p_prior_end, p_end)
      and cp.creator_name is not null and btrim(cp.creator_name) <> ''
    group by 1
  ),
  post_agg as materialized (
    select handle,
           count(*) filter (where posted between p_start and p_end)             as cur_posts,
           count(*) filter (where posted between p_prior_start and p_prior_end) as pri_posts
    from roster_posts group by handle
  ),
  -- ACTIVE = posted OR sold, at PERSON grain. Must match the creator table's
  -- "N posted or sold this period" exactly; two definitions of "active" on one
  -- report is the defect this pass exists to remove.
  act as materialized (
    select p.id,
           bool_or(coalesce(a.cur_gmv,0) > 0 or coalesce(pa.cur_posts,0) > 0) as active_cur,
           bool_or(coalesce(a.pri_gmv,0) > 0 or coalesce(pa.pri_posts,0) > 0) as active_prior
    from ppl p
    left join cp_agg   a  on a.handle  = p.handle
    left join post_agg pa on pa.handle = p.handle
    group by p.id
  )
  select jsonb_build_object(
    'signedPeople',      (select count(*) from act),
    'activePeople',      (select count(*) from act where active_cur),
    'activePeoplePrior', (select count(*) from act where active_prior),
    'newlyActivePeople', (select count(*) from act where active_cur and not active_prior),
    'rosterPosts',       (select count(*) from roster_posts where posted between p_start and p_end),
    'rosterPostsPrior',  (select count(*) from roster_posts where posted between p_prior_start and p_prior_end),
    'storePosts',        (select count(*) from posts where posted between p_start and p_end),
    'storePostsPrior',   (select count(*) from posts where posted between p_prior_start and p_prior_end)
  );
$function$;

revoke all on function public.get_brand_client_report_counts(text[], text[], date, date, date, date)
  from public, anon, authenticated;
grant execute on function public.get_brand_client_report_counts(text[], text[], date, date, date, date)
  to authenticated, service_role;
