-- Weekly client KPI report — one aggregate for the on-demand report generated
-- from the Outbox. Covers the five items a brand client asked for:
--   1. Total GMV, store-wide AND managed, vs the prior window
--   2. Total SV (shoppable videos POSTED), store-wide AND managed, vs prior
--   3. Creators added to the roster in the window + their retainer budget
--   4. Mechanical half of "creator updates": off-roster + inactive-contracted
--   5. Campaign blockers — NOT here, nothing in the DB knows about them
--
-- SV = SUM(creator_performance.videos), which is a per-creator-per-day count
-- of videos POSTED that day (it reads 0 on days a creator did five figures of
-- GMV without posting). It is deliberately NOT the count of distinct videos
-- that earned in the window — that number counts back-catalogue videos still
-- selling and runs ~16x larger, which is a different question.
--
-- "Added to the roster" is joined_at/created_at, which is the DATA-ENTRY date,
-- not the signing date (a bulk campaign load lands 60 creators on one day).
-- The label in the UI says "added to roster" for exactly this reason. Do not
-- relabel it "hired" without a real start-date column behind it.
--
-- Departures use archived_at. status_changed_at, employment_status and
-- termination_reason are ALL unpopulated (0 of 1855 rows carry a value), so a
-- "retainer cancellation" feed cannot be built from them. archived_at is the
-- only timestamped departure signal that exists.
--
-- Superseded in 141, which adds roster_size. Kept for ledger parity.
create or replace function public.get_weekly_kpi_report(
  p_data_slugs   text[],
  p_roster_slugs text[],
  p_start        date,
  p_end          date,
  p_prior_start  date,
  p_prior_end    date
) returns jsonb
  language sql
  stable
  security definer
  set search_path to 'public'
  set statement_timeout to '60s'
as $function$
  with mh as materialized (
    select distinct mbh.handle
    from managed_brand_handles mbh
    where p_roster_slugs is null or mbh.brand_slug = any(p_roster_slugs)
  ),
  cur as materialized (
    select lower(btrim(regexp_replace(cp.creator_name, '^@', ''))) as handle,
           sum(cp.gmv)::numeric    as gmv,
           sum(cp.videos)::bigint  as videos
    from creator_performance cp
    where cp.period_type = 'daily'
      and cp.report_date between p_start and p_end
      and (p_data_slugs is null or cp.brand = any(p_data_slugs))
      and cp.creator_name is not null and btrim(cp.creator_name) <> ''
    group by 1
  ),
  prior as materialized (
    select lower(btrim(regexp_replace(cp.creator_name, '^@', ''))) as handle,
           sum(cp.gmv)::numeric    as gmv,
           sum(cp.videos)::bigint  as videos
    from creator_performance cp
    where cp.period_type = 'daily'
      and cp.report_date between p_prior_start and p_prior_end
      and (p_data_slugs is null or cp.brand = any(p_data_slugs))
      and cp.creator_name is not null and btrim(cp.creator_name) <> ''
    group by 1
  ),
  cur_m   as materialized (select c.*, (c.handle in (select handle from mh)) as is_managed from cur c),
  prior_m as materialized (select p.*, (p.handle in (select handle from mh)) as is_managed from prior p),

  -- Roster side. managed_creators.brand is the ROSTER slug, so it is filtered
  -- by p_roster_slugs (which includes the parent umbrella for a store-grain
  -- run), never by the data slugs.
  roster as materialized (
    select mc.id, mc.real_name, mc.retainer, mc.archived_at,
           coalesce(mc.joined_at, mc.created_at) as joined,
           mc.account_1, mc.account_2, mc.account_3, mc.account_4, mc.account_5,
           mc.account_6, mc.account_7, mc.account_8, mc.account_9, mc.account_10
    from managed_creators mc
    where p_roster_slugs is null or mc.brand = any(p_roster_slugs)
  ),
  roster_named as materialized (
    select r.*,
           coalesce(nullif(btrim(r.real_name), ''), nullif(btrim(r.account_1), ''), 'Unnamed creator') as name
    from roster r
  ),
  roster_handles as materialized (
    select rn.id, lower(btrim(regexp_replace(h.handle, '^@', ''))) as handle
    from roster_named rn
    cross join lateral (values
      (rn.account_1), (rn.account_2), (rn.account_3), (rn.account_4), (rn.account_5),
      (rn.account_6), (rn.account_7), (rn.account_8), (rn.account_9), (rn.account_10)
    ) h(handle)
    where h.handle is not null and btrim(h.handle) <> ''
  ),
  -- Videos posted in the window per roster creator, across all their handles.
  creator_videos as materialized (
    select rh.id, coalesce(sum(c.videos), 0)::bigint as videos
    from roster_handles rh
    left join cur c on c.handle = rh.handle
    group by rh.id
  ),

  adds as materialized (
    select rn.id, rn.name, coalesce(rn.retainer, 0)::numeric as retainer, rn.joined
    from roster_named rn
    where rn.archived_at is null
      and rn.joined is not null
      and rn.joined::date between p_start and p_end
  ),
  gone as materialized (
    select rn.id, rn.name, coalesce(rn.retainer, 0)::numeric as retainer, rn.archived_at
    from roster_named rn
    where rn.archived_at is not null
      and rn.archived_at::date between p_start and p_end
  ),
  -- Inactive = CONTRACTED (retainer > 0) creators who were already on the
  -- roster before the window opened and posted nothing during it. Gating on
  -- retainer, not on monthly_post_requirement, which is a phantom default.
  inactive as materialized (
    select rn.id, rn.name, coalesce(rn.retainer, 0)::numeric as retainer
    from roster_named rn
    join creator_videos cv on cv.id = rn.id
    where rn.archived_at is null
      and coalesce(rn.retainer, 0) > 0
      and rn.joined is not null
      and rn.joined::date < p_start
      and cv.videos = 0
  ),
  contracted_active as materialized (
    select count(*)::bigint as n
    from roster_named rn
    where rn.archived_at is null and coalesce(rn.retainer, 0) > 0
  )

  select jsonb_build_object(
    'gmv', jsonb_build_object(
      'store',         (select coalesce(sum(gmv), 0) from cur_m),
      'store_prior',   (select coalesce(sum(gmv), 0) from prior_m),
      'managed',       (select coalesce(sum(gmv), 0) from cur_m   where is_managed),
      'managed_prior', (select coalesce(sum(gmv), 0) from prior_m where is_managed)
    ),
    'sv', jsonb_build_object(
      'store',         (select coalesce(sum(videos), 0) from cur_m),
      'store_prior',   (select coalesce(sum(videos), 0) from prior_m),
      'managed',       (select coalesce(sum(videos), 0) from cur_m   where is_managed),
      'managed_prior', (select coalesce(sum(videos), 0) from prior_m where is_managed)
    ),
    'active_creators', jsonb_build_object(
      'store',         (select count(*) from cur_m),
      'managed',       (select count(*) from cur_m where is_managed)
    ),
    'roster_adds', jsonb_build_object(
      'count',           (select count(*) from adds),
      'retainer_budget', (select coalesce(sum(retainer), 0) from adds),
      'with_retainer',   (select count(*) from adds where retainer > 0),
      'creators',        (select coalesce(jsonb_agg(t order by t.retainer desc, t.name), '[]'::jsonb)
                            from (select a.name, a.retainer from adds a
                                  order by a.retainer desc, a.name limit 25) t)
    ),
    'departures', jsonb_build_object(
      'count',          (select count(*) from gone),
      'retainer_freed', (select coalesce(sum(retainer), 0) from gone),
      'creators',       (select coalesce(jsonb_agg(t order by t.retainer desc, t.name), '[]'::jsonb)
                           from (select g.name, g.retainer from gone g
                                 order by g.retainer desc, g.name limit 25) t)
    ),
    'inactive', jsonb_build_object(
      'count',            (select count(*) from inactive),
      'contracted_total', (select n from contracted_active),
      'retainer_at_risk', (select coalesce(sum(retainer), 0) from inactive),
      'creators',         (select coalesce(jsonb_agg(t order by t.retainer desc, t.name), '[]'::jsonb)
                             from (select i.name, i.retainer from inactive i
                                   order by i.retainer desc, i.name limit 25) t)
    )
  );
$function$;

-- A GRANT list that merely omits anon revokes nothing — anon inherits EXECUTE
-- on new functions through PUBLIC. Revoke explicitly, then grant narrowly.
revoke all on function public.get_weekly_kpi_report(text[], text[], date, date, date, date) from public;
revoke all on function public.get_weekly_kpi_report(text[], text[], date, date, date, date) from anon;
grant execute on function public.get_weekly_kpi_report(text[], text[], date, date, date, date) to authenticated;
grant execute on function public.get_weekly_kpi_report(text[], text[], date, date, date, date) to service_role;
