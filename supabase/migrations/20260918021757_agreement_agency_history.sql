-- Resolve verified period costs for agency and signing reports; preserve legacy fallback without fabricating history.

CREATE OR REPLACE FUNCTION public.get_agency_portfolio_workspace(p_tenant_id uuid, p_start date, p_end date, p_prior_start date, p_prior_end date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
WITH scoped_brands_v2 AS NOT MATERIALIZED (SELECT * FROM public.brands_v2 WHERE tenant_id = p_tenant_id),
scoped_creator_performance AS NOT MATERIALIZED (SELECT * FROM public.creator_performance WHERE tenant_id = p_tenant_id),
scoped_managed_creators AS NOT MATERIALIZED (SELECT * FROM public.managed_creators WHERE tenant_id = p_tenant_id),
scoped_tiktok_accounts AS NOT MATERIALIZED (SELECT * FROM public.tiktok_accounts WHERE tenant_id = p_tenant_id), brand as (
    select b.id, b.slug, b.name
    from scoped_brands_v2 b
    where coalesce(b.is_archived, false) = false and b.parent_brand_id is null
  ),
  map as (
    select b.slug as roster_slug, b.slug as data_slug from brand b
    union
    select p.slug, c.slug
    from brand p join scoped_brands_v2 c on c.parent_brand_id = p.id
  ),
  src as (
    select mc.brand, mc.archived_at,
           lower(btrim(regexp_replace(h.handle, '^@', ''))) as handle
    from scoped_managed_creators mc
      cross join lateral (values
        (mc.account_1), (mc.account_2), (mc.account_3), (mc.account_4), (mc.account_5),
        (mc.account_6), (mc.account_7), (mc.account_8), (mc.account_9), (mc.account_10)
      ) h(handle)
    where h.handle is not null and btrim(h.handle) <> ''
    union all
    select mc.brand, mc.archived_at,
           lower(btrim(regexp_replace(t.tiktok_username, '^@', '')))
    from scoped_managed_creators mc
    join scoped_tiktok_accounts t on t.creator_id = mc.creator_id
    where mc.creator_id is not null
      and t.tiktok_username is not null and btrim(t.tiktok_username) <> ''
  ),
  mem as materialized (
    select brand, handle,
           bool_or(archived_at is null) as ever_active,
           max(archived_at)::date       as archived_on
    from src group by 1, 2
  ),
  present as (
    select distinct m.roster_slug
    from map m
    where exists (
      select 1 from scoped_creator_performance cp
      where cp.brand = m.data_slug and cp.period_type = 'daily'
        and cp.report_date between least(p_start, p_prior_start) and greatest(p_end, p_prior_end)
    )
  ),
  gsum as (
    select m.roster_slug,
      coalesce(sum(cp.gmv) filter (where cp.report_date between p_start and p_end), 0)             as store_cur,
      coalesce(sum(cp.gmv) filter (where cp.report_date between p_prior_start and p_prior_end), 0) as store_pri,
      coalesce(sum(cp.gmv) filter (where cp.report_date between p_start and p_end
        and mm.handle is not null and (mm.ever_active or mm.archived_on > cp.report_date)), 0)     as roster_cur,
      coalesce(sum(cp.gmv) filter (where cp.report_date between p_prior_start and p_prior_end
        and mm.handle is not null and (mm.ever_active or mm.archived_on > cp.report_date)), 0)     as roster_pri
    from scoped_creator_performance cp
    join map m on m.data_slug = cp.brand
    left join mem mm on mm.brand = m.roster_slug
                    and mm.handle = lower(btrim(regexp_replace(cp.creator_name, '^@', '')))
    where cp.period_type = 'daily'
      and cp.gmv <> 0
      and cp.report_date between least(p_start, p_prior_start) and greatest(p_end, p_prior_end)
    group by 1
  ),
  gmv as (
    select p.roster_slug,
           coalesce(s.store_cur, 0) as store_cur, coalesce(s.store_pri, 0) as store_pri,
           coalesce(s.roster_cur, 0) as roster_cur, coalesce(s.roster_pri, 0) as roster_pri
    from present p left join gsum s on s.roster_slug = p.roster_slug
  ),
  cost as (
    select mc.brand,
           count(*)                                       as signed,
           count(*) filter (where coalesce((agreement.value->>'retainer')::numeric,mc.retainer,0) > 0) as retained,
           coalesce(sum(coalesce((agreement.value->>'retainer')::numeric,mc.retainer,0)), 0)      as committed
    from scoped_managed_creators mc
    left join scoped_brands_v2 ab on ab.slug=mc.brand
    left join lateral (select public.get_creator_agreement_terms(p_tenant_id,mc.creator_id,ab.id,p_end) as value) agreement on true
    where mc.archived_at is null
    group by 1
  ),
  rows as (
    select b.slug, b.name,
           round(g.store_cur, 2)  as store_gmv,
           round(g.store_pri, 2)  as prior_store_gmv,
           round(g.roster_cur, 2) as roster_gmv,
           round(g.roster_pri, 2) as prior_roster_gmv,
           coalesce(c.signed, 0)   as signed,
           coalesce(c.retained, 0) as retained,
           round(coalesce(c.committed, 0), 2) as committed_retainer
    from brand b
    join gmv g on g.roster_slug = b.slug
    left join cost c on c.brand = b.slug
  )
  select jsonb_build_object(
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug',              r.slug,
        'name',              r.name,
        'storeGmv',          r.store_gmv,
        'priorStoreGmv',     r.prior_store_gmv,
        'rosterGmv',         r.roster_gmv,
        'priorRosterGmv',    r.prior_roster_gmv,
        'signed',            r.signed,
        'retained',          r.retained,
        'committedRetainer', r.committed_retainer
      ) order by r.roster_gmv desc)
      from rows r
    ), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'clients',           count(*) filter (where r.roster_gmv > 0),
        -- A store counts as a client's only in a period we sold in it.
        'storeGmv',          round(coalesce(sum(r.store_gmv)       filter (where r.roster_gmv > 0), 0), 2),
        'priorStoreGmv',     round(coalesce(sum(r.prior_store_gmv) filter (where r.prior_roster_gmv > 0), 0), 2),
        'rosterGmv',         round(sum(r.roster_gmv), 2),
        'priorRosterGmv',    round(sum(r.prior_roster_gmv), 2),
        'signed',            sum(r.signed),
        'retained',          sum(r.retained),
        'committedRetainer', round(sum(r.committed_retainer), 2)
      ) from rows r
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_brand_report_signings_workspace(p_tenant_id uuid, p_roster_slugs text[], p_end date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
WITH scoped_managed_creators AS NOT MATERIALIZED (SELECT * FROM public.managed_creators WHERE tenant_id = p_tenant_id), bounds as (
    select date_trunc('month', p_end)::date                     as m_start,
           (date_trunc('month', p_end) - interval '1 month')::date as p_start,
           (date_trunc('month', p_end) - interval '1 day')::date   as p_end_of_prior
  ),
  scoped as (
    select mc.cc_start_date, coalesce((agreement.value->>'retainer')::numeric,mc.retainer,0) as retainer
    from scoped_managed_creators mc
    left join public.brands_v2 ab on ab.slug=mc.brand and ab.tenant_id=p_tenant_id
    left join lateral (select public.get_creator_agreement_terms(p_tenant_id,mc.creator_id,ab.id,p_end) as value) agreement on true
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and mc.cc_start_date is not null
  ),
  first_month as (
    select date_trunc('month', min(cc_start_date))::date as m from scoped
  )
  select jsonb_build_object(
    'monthLabel',      to_char((select m_start from bounds), 'Mon YYYY'),
    'priorMonthLabel', to_char((select p_start from bounds), 'Mon YYYY'),
    'signed',          (select count(*) from scoped, bounds
                          where cc_start_date >= m_start and cc_start_date <= p_end),
    'signedRetained',  (select count(*) from scoped, bounds
                          where cc_start_date >= m_start and cc_start_date <= p_end
                            and retainer > 0),
    'signedPrior',     (select count(*) from scoped, bounds
                          where cc_start_date >= p_start and cc_start_date <= p_end_of_prior),
    'isFirstMonth',    (select (select m from first_month) = (select m_start from bounds)),
    'priorComparable', (select (select m from first_month) < (select p_start from bounds))
  );
$function$;
