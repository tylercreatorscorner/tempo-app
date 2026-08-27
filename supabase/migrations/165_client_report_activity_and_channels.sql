-- 165 · Client report: honest activity counts + the video/live/card split.
--
-- ── WHY ────────────────────────────────────────────────────────────────────
--
-- 1. "Active creators" was counting PRESENCE, not activity.
--
--    get_brand_client_report_agg's totals.active_creators and this split's
--    `creators` both do a bare count(distinct handle) with NO gmv filter.
--    TikTok's creator export emits a row per creator per day whether or not
--    they sold anything, so those counts mean "appeared in the file", which is
--    not a fact about anybody's work.
--
--    Measured on jiyu, 2026-08-01..23:
--
--      store "Active creators"  printed  40,954   actually sold     930
--                                                 actually posted 4,216
--      managed split creators   printed     247   posted             84
--
--    44x on the store line. It also poisons everything derived from it:
--    avgGmvPerCreator read $10.43, and the PDF's new-vs-returning percentages
--    divide by it.
--
-- 2. POSTED and SOLD are different facts and the report must say which.
--
--    20 jiyu roster creators sold in August without posting once — they are
--    earning off older content. Counting them as "active" overstates the work
--    done this period. Activation is now measured on POSTING; sales are
--    reported alongside, never merged. rosterPosted + rosterSoldNotPosted
--    equals the old activePeople exactly (84 + 20 = 104), which is the check
--    that nothing was lost in the split.
--
-- 3. live_gmv / live_streams have never appeared in the report.
--
--    They are fully populated. Store-wide 2026-08: $975,112 of live GMV across
--    72,074 streams. The three-way split RECONCILES rather than approximates —
--    jiyu roster 151,994.87 + 9,322.14 + 463.99 = 161,781.00, exactly the
--    managed total — because it is computed inside the split RPC and therefore
--    lands on the same time-aware membership rule as the GMV beside it.
--
-- ── WHERE THE WORK GOES ────────────────────────────────────────────────────
--
-- The channel sums live in get_brand_client_report_managed_split, NOT in
-- _counts. _counts' creator_performance scan has no join to `mem`; adding one
-- so it could compute is_managed took kitsch from 4.8s to 15.3s. The split
-- already groups by (handle, in_cur, in_pri, is_managed), so four more sums on
-- an existing aggregate cost ~nothing. Measured after: counts 11.6s, split
-- 9.9s, and the two run concurrently with granular in the data layer.
--
-- Additive only: every key both functions already returned is returned
-- unchanged.

-- ══ get_brand_client_report_counts ═════════════════════════════════════════
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
  with src as (
    -- account_ columns UNION tiktok_accounts: neither store alone is complete.
    select mc.id, mc.archived_at, mc.employment_status,
           lower(btrim(regexp_replace(h.handle, '^@', ''))) as handle
    from public.managed_creators mc
      cross join lateral (values
        (mc.account_1), (mc.account_2), (mc.account_3), (mc.account_4), (mc.account_5),
        (mc.account_6), (mc.account_7), (mc.account_8), (mc.account_9), (mc.account_10)
      ) h(handle)
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and h.handle is not null and btrim(h.handle) <> ''
    union all
    select mc.id, mc.archived_at, mc.employment_status,
           lower(btrim(regexp_replace(t.tiktok_username, '^@', '')))
    from public.managed_creators mc
    join public.tiktok_accounts t on t.creator_id = mc.creator_id
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and mc.creator_id is not null
      and t.tiktok_username is not null and btrim(t.tiktok_username) <> ''
  ),
  mem as materialized (
    select handle,
           bool_or(archived_at is null) as ever_active,
           max(archived_at)::date       as archived_on
    from src group by 1
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
  -- Roster membership evaluated on the POST date, not on today. A creator who
  -- has since left still posted those videos while on the roster.
  roster_posts as materialized (
    select p.*
    from posts p
    join mem m on m.handle = p.handle
    where m.ever_active or m.archived_on > p.posted
  ),
  ppl as materialized (
    -- PERSON grain. Distinct on (id, handle) because the union can present the
    -- same handle from both stores for one creator.
    select distinct s.id, s.handle
    from src s
    where s.employment_status = 'active'
      -- Archiving does not reset employment_status, so both are required.
      and s.archived_at is null
  ),
  -- ONE pass over creator_performance for both windows, and deliberately NO
  -- join to mem — see the header note on the 4.8s -> 15.3s regression.
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
  -- POSTED and SOLD are tracked separately. `active_cur` (posted OR sold) is
  -- kept only so activePeople does not move under callers still reading it;
  -- the report itself now prints the two halves.
  act as materialized (
    select p.id,
           bool_or(coalesce(a.cur_gmv,0) > 0 or coalesce(pa.cur_posts,0) > 0) as active_cur,
           bool_or(coalesce(a.pri_gmv,0) > 0 or coalesce(pa.pri_posts,0) > 0) as active_prior,
           bool_or(coalesce(pa.cur_posts,0) > 0)                              as posted_cur,
           bool_or(coalesce(pa.pri_posts,0) > 0)                              as posted_pri,
           bool_or(coalesce(a.cur_gmv,0)   > 0)                               as sold_cur
    from ppl p
    left join cp_agg   a  on a.handle  = p.handle
    left join post_agg pa on pa.handle = p.handle
    group by p.id
  ),
  -- Roster rows archived DURING the window, person grain. A creator re-signed
  -- under a second still-active row has not left.
  departed as (
    select count(*) as n
    from (
      select mc.id
      from public.managed_creators mc
      where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
        and mc.archived_at is not null
        and mc.archived_at::date between p_start and p_end
      except
      select mc2.id
      from public.managed_creators mc2
      where (p_roster_slugs is null or mc2.brand = any(p_roster_slugs))
        and mc2.archived_at is null
    ) d
  )
  select jsonb_build_object(
    -- ── unchanged keys ────────────────────────────────────────────────────
    'signedPeople',      (select count(*) from act),
    'activePeople',      (select count(*) from act where active_cur),
    'activePeoplePrior', (select count(*) from act where active_prior),
    'newlyActivePeople', (select count(*) from act where active_cur and not active_prior),
    'rosterPosts',       (select count(*) from roster_posts where posted between p_start and p_end),
    'rosterPostsPrior',  (select count(*) from roster_posts where posted between p_prior_start and p_prior_end),
    'storePosts',        (select count(*) from posts where posted between p_start and p_end),
    'storePostsPrior',   (select count(*) from posts where posted between p_prior_start and p_prior_end),

    -- ── new: activity, split into its two honest halves ───────────────────
    'rosterPosted',        (select count(*) from act where posted_cur),
    'rosterPostedPrior',   (select count(*) from act where posted_pri),
    'rosterSold',          (select count(*) from act where sold_cur),
    'rosterSoldNotPosted', (select count(*) from act where sold_cur and not posted_cur),
    'rosterDeparted',      (select n from departed),

    -- Store side, same two definitions. NOT count(distinct handle) over every
    -- row in the export, which is what the report prints today.
    'storeCreatorsPosted', (select count(distinct handle) from posts
                             where posted between p_start and p_end),
    'storeCreatorsSold',   (select count(*) from cp_agg where cur_gmv > 0)
  );
$function$;

revoke execute on function public.get_brand_client_report_counts(text[], text[], date, date, date, date) from public;
revoke execute on function public.get_brand_client_report_counts(text[], text[], date, date, date, date) from anon;
grant  execute on function public.get_brand_client_report_counts(text[], text[], date, date, date, date) to authenticated, service_role;

comment on function public.get_brand_client_report_counts(text[], text[], date, date, date, date) is
  'Client report counts at PERSON and POST grain. ACTIVE IS NOT ONE NUMBER: rosterPosted (did the '
  'work) and rosterSold (earned, possibly off older content) are reported separately and must never '
  'be collapsed — on jiyu 2026-08, 20 creators sold without posting. Do NOT use '
  'totals.active_creators from get_brand_client_report_agg or `creators` from '
  'get_brand_client_report_managed_split for anything client-facing: both count rows present in the '
  'TikTok export, which read 40,954 and 247 against a true 4,216 posted / 930 sold.';

-- ══ get_brand_client_report_managed_split ══════════════════════════════════
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
  with src as (
    -- account_ columns UNION tiktok_accounts. 1,003 handles on active roster
    -- rows lived ONLY in tiktok_accounts and were roster to nobody; 99 live
    -- only in the account_ columns. Neither store alone is complete.
    select mc.id, mc.archived_at,
           lower(btrim(regexp_replace(h.handle, '^@', ''))) as handle
    from public.managed_creators mc
      cross join lateral (values
        (mc.account_1), (mc.account_2), (mc.account_3), (mc.account_4), (mc.account_5),
        (mc.account_6), (mc.account_7), (mc.account_8), (mc.account_9), (mc.account_10)
      ) h(handle)
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and h.handle is not null and btrim(h.handle) <> ''
    union all
    select mc.id, mc.archived_at,
           lower(btrim(regexp_replace(t.tiktok_username, '^@', '')))
    from public.managed_creators mc
    join public.tiktok_accounts t on t.creator_id = mc.creator_id
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and mc.creator_id is not null
      and t.tiktok_username is not null and btrim(t.tiktok_username) <> ''
  ),
  mem as materialized (
    -- One row per handle. A handle is managed on day D when ANY roster row for
    -- it is either still active or was archived after D, so a creator holding
    -- two rows (re-signed later) is not dropped by the archived one. Collapsing
    -- to handle grain is also what makes the union safe: this is a set
    -- membership test, not a handle -> creator join.
    select handle,
           bool_or(archived_at is null) as ever_active,
           max(archived_at)::date       as archived_on
    from src group by 1
  ),
  -- ⚠️ PRE-AGGREGATE, do not hand 1.2M rows to the outer aggregate. Kitsch has
  -- 1,242,633 creator_performance rows across a 30-day window plus its prior,
  -- and a bare count(distinct handle) over that spilled a 45MB external merge
  -- sort to disk. Grouping to handle grain first turns it into a hash
  -- aggregate and leaves the outer step a few thousand rows.
  --
  -- is_managed is DATE-dependent, so it is part of the grouping key rather
  -- than an attribute of the handle: one creator can be roster for part of a
  -- window and not the rest. The channel sums below ride on this same key,
  -- which is exactly why video + live + card equals the managed GMV.
  per_handle as materialized (
    select lower(btrim(regexp_replace(cp.creator_name, '^@', ''))) as handle,
           (cp.report_date between p_start       and p_end)        as in_cur,
           (cp.report_date between p_prior_start and p_prior_end)  as in_pri,
           (m.handle is not null
             and (m.ever_active or m.archived_on > cp.report_date)) as is_managed,
           sum(cp.gmv)::numeric                           as gmv,
           sum(cp.orders)::bigint                         as orders,
           sum(cp.est_commission)::numeric                as commission,
           sum(coalesce(cp.video_gmv, 0))::numeric        as video_gmv,
           sum(coalesce(cp.live_gmv, 0))::numeric         as live_gmv,
           sum(coalesce(cp.product_card_gmv, 0))::numeric as card_gmv,
           sum(coalesce(cp.live_streams, 0))::bigint      as live_streams
    from public.creator_performance cp
    left join mem m
      on m.handle = lower(btrim(regexp_replace(cp.creator_name, '^@', '')))
    where cp.period_type = 'daily'
      and (p_data_slugs is null or cp.brand = any(p_data_slugs))
      and cp.report_date between least(p_start, p_prior_start) and greatest(p_end, p_prior_end)
      and cp.creator_name is not null and btrim(cp.creator_name) <> ''
    group by 1, 2, 3, 4
  ),
  agg as (
    select
      coalesce(sum(gmv)        filter (where in_cur and is_managed), 0)      as m_gmv,
      coalesce(sum(orders)     filter (where in_cur and is_managed), 0)      as m_orders,
      coalesce(sum(commission) filter (where in_cur and is_managed), 0)      as m_comm,
      count(distinct handle)   filter (where in_cur and is_managed)          as m_creators,
      coalesce(sum(gmv)        filter (where in_cur and not is_managed), 0)  as o_gmv,
      coalesce(sum(orders)     filter (where in_cur and not is_managed), 0)  as o_orders,
      count(distinct handle)   filter (where in_cur and not is_managed)      as o_creators,
      coalesce(sum(gmv)        filter (where in_pri and is_managed), 0)      as p_gmv,
      coalesce(sum(orders)     filter (where in_pri and is_managed), 0)      as p_orders,
      count(distinct handle)   filter (where in_pri and is_managed)          as p_creators,
      coalesce(sum(video_gmv)    filter (where in_cur and is_managed), 0)    as m_video,
      coalesce(sum(live_gmv)     filter (where in_cur and is_managed), 0)    as m_live,
      coalesce(sum(card_gmv)     filter (where in_cur and is_managed), 0)    as m_card,
      coalesce(sum(live_streams) filter (where in_cur and is_managed), 0)    as m_streams,
      coalesce(sum(video_gmv)    filter (where in_cur), 0)                   as s_video,
      coalesce(sum(live_gmv)     filter (where in_cur), 0)                   as s_live,
      coalesce(sum(card_gmv)     filter (where in_cur), 0)                   as s_card,
      coalesce(sum(live_streams) filter (where in_cur), 0)                   as s_streams
    from per_handle
  ),
  -- Top live sellers, by HANDLE not by person: `mem` is deliberately collapsed
  -- to handle grain (a set-membership test, not a handle -> creator join) and
  -- re-introducing the person join here would undo that.
  --
  -- Not a column on the creator table: jiyu's whole roster ran 87 streams
  -- across 259 signed creators, so a per-creator Lives column would be ~97%
  -- zeros. A short list of who actually goes live is the useful shape — and on
  -- jiyu it says something the totals hide: @sullyco444 alone produced
  -- $8,620.87 of the roster's $9,322.14, which is 92.5% of it.
  top_live as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'handle', handle, 'liveGmv', live_gmv, 'lives', live_streams
           ) order by live_gmv desc), '[]'::jsonb) as j
    from (
      select handle,
             sum(live_gmv)     as live_gmv,
             sum(live_streams) as live_streams
      from per_handle
      where in_cur and is_managed
      group by handle
      having sum(live_gmv) > 0
      order by 2 desc
      limit 6
    ) t
  )
  select jsonb_build_object(
    'managed', jsonb_build_object(
      'gmv', m_gmv, 'orders', m_orders, 'commission', m_comm, 'creators', m_creators
    ),
    'organic', jsonb_build_object(
      'gmv', o_gmv, 'orders', o_orders, 'creators', o_creators
    ),
    'managed_prior', jsonb_build_object(
      'gmv', p_gmv, 'orders', p_orders, 'creators', p_creators
    ),
    -- ⚠️ `creators` above counts handles PRESENT in the export, $0 rows
    -- included (jiyu 2026-08: 247 against 84 who posted). Retained only
    -- because callers read it; anything client-facing must use
    -- get_brand_client_report_counts' rosterPosted / rosterSold instead.
    'channels', jsonb_build_object(
      'rosterVideoGmv', m_video, 'rosterLiveGmv', m_live,
      'rosterCardGmv',  m_card,  'rosterLiveStreams', m_streams,
      'storeVideoGmv',  s_video, 'storeLiveGmv',  s_live,
      'storeCardGmv',   s_card,  'storeLiveStreams',  s_streams
    ),
    'top_live', (select j from top_live)
  )
  from agg;
$function$;

revoke execute on function public.get_brand_client_report_managed_split(text[], text[], date, date, date, date) from public;
revoke execute on function public.get_brand_client_report_managed_split(text[], text[], date, date, date, date) from anon;
grant  execute on function public.get_brand_client_report_managed_split(text[], text[], date, date, date, date) to authenticated, service_role;
