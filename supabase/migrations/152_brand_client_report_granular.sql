-- 152_brand_client_report_granular.sql
--
-- Granular additions to the weekly client report: roster composition, video
-- counts, video vintage, and a full per-creator breakout.
--
-- ── Video vintage, and why 30 days alone would mislead ──────────────────────
--
-- Measured on Lemme's roster for the week of 2026-08-04, GMV split by the
-- month each video was POSTED:
--
--     Aug 2026   272 videos   $31,073   26.5%
--     Jul 2026   469 videos   $53,385   45.6%   <- carries the week
--     Jun 2026   208 videos   $31,515   26.9%
--     May 2026   157 videos      $973    0.8%
--     older      ~60 videos     ~$117    0.1%
--
-- 99% of the week's GMV comes from the last ~90 days and essentially nothing
-- survives past three months. A rolling-30-day "new video GMV" would report
-- 26.5% and silently omit the July cohort actually paying for the week, so
-- this returns BOTH: the 30-day figure, and the monthly vintage that shows
-- where the money really sits.
--
-- ── Affiliate-only is not a creator who missed quota ────────────────────────
--
-- ⚠️ All 85 of Lemme's affiliate-only creators carry a non-zero
-- monthly_post_requirement in managed_creators. The column is phantom for
-- them: an affiliate-only creator takes commission with NO post commitment.
-- `quota` below is NULL whenever retainer = 0, and the caller must render
-- absence — never 0, and never "0 of 30 posts". Telling a brand that 85 of its
-- creators missed a requirement they never agreed to is the single worst thing
-- this report could say.
--
-- ── Retainer is month-grain ─────────────────────────────────────────────────
--
-- monthlyRetainerBudget is the CONTRACTED monthly sum, returned as-is. It is
-- never divided down to the report window: apportioning a monthly commitment
-- across a 7-day range is an estimate, and the caller labels it by month.

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
  ),
  roster_handles as (
    select r.id, h.handle
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
      ) from roster
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
               'retainer',       r.retainer,
               'quota',          r.quota,
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

-- A GRANT list that merely omits anon revokes NOTHING: EXECUTE defaults to
-- PUBLIC. Revoke explicitly, then grant only what should call it.
revoke all on function public.get_brand_client_report_granular(text[], text[], date, date)
  from public, anon, authenticated;
-- authenticated AND service_role, anon REVOKED — the same posture as
-- get_brand_report_extras. buildClientReportSnapshot runs on the COOKIE
-- client as the signed-in admin, so a service_role-only grant made this
-- permission-denied; the caller treats failure as non-fatal, so the
-- block silently never reached a single snapshot. A grant that is too
-- tight fails as quietly here as one that is too loose fails loudly.
grant execute on function public.get_brand_client_report_granular(text[], text[], date, date)
  to authenticated, service_role;
