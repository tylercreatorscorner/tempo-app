-- 175 · Who actually moved the number, for the week-over-week report.
--
-- The standing report can say "roster GMV $48,602, down 5.7%". It cannot say
-- WHY, because every prior-window figure it holds is an aggregate. This returns
-- the per-creator movement behind that delta.
--
-- GROSS UP AND GROSS DOWN ARE REPORTED SEPARATELY, deliberately, rather than
-- "N creators explain X% of the change". A net figure is the residue of two
-- opposing forces, and quoting one percentage against it hides their size:
-- jiyu's week was $6,169 gained against $9,098 lost, netting -$2,930. "Ten
-- creators explain 95% of the decline" would have been arithmetically true and
-- would have concealed that $15,267 of gross movement happened underneath.
--
-- A creator who went from nothing to something is NEW, not "up infinity
-- percent". The percentage of zero does not exist, and inventing one is how a
-- report starts lying at its edges.
--
-- Time-aware roster membership, evaluated per ROW date, the same rule as
-- get_brand_client_report_managed_split: a creator who left mid-window keeps
-- the GMV they earned while on the roster.
--
-- Handle grain, also like the split: `mem` is a set-membership test, not a
-- handle -> creator join, and collapsing to handle is what makes the account_
-- columns UNION tiktok_accounts safe. The display name is a best-effort lookup
-- layered on top (one name per handle), never a join that could duplicate rows.
--
-- ONLY FETCHED FOR WEEKLY REPORTS. It costs a second scan of
-- creator_performance across both windows, and no other template shows it.
create or replace function public.get_brand_client_report_movers(
  p_data_slugs   text[],
  p_roster_slugs text[],
  p_start        date,
  p_end          date,
  p_prior_start  date,
  p_prior_end    date,
  p_limit        int default 8
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '60s'
as $function$
  with src as (
    select mc.id, mc.archived_at,
           nullif(btrim(mc.real_name), '') as real_name,
           lower(btrim(regexp_replace(h.handle, '^@', ''))) as handle
    from public.managed_creators mc
      cross join lateral (values
        (mc.account_1), (mc.account_2), (mc.account_3), (mc.account_4), (mc.account_5),
        (mc.account_6), (mc.account_7), (mc.account_8), (mc.account_9), (mc.account_10)
      ) h(handle)
    where (p_roster_slugs is null or mc.brand = any(p_roster_slugs))
      and h.handle is not null and btrim(h.handle) <> ''
    union all
    select mc.id, mc.archived_at, nullif(btrim(mc.real_name), ''),
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
           max(archived_at)::date       as archived_on,
           (array_agg(real_name) filter (where real_name is not null))[1] as real_name
    from src group by 1
  ),
  per_handle as (
    select lower(btrim(regexp_replace(cp.creator_name, '^@', ''))) as handle,
           sum(cp.gmv) filter (where cp.report_date between p_start and p_end)::numeric             as cur,
           sum(cp.gmv) filter (where cp.report_date between p_prior_start and p_prior_end)::numeric as pri
    from public.creator_performance cp
    join mem m
      on m.handle = lower(btrim(regexp_replace(cp.creator_name, '^@', '')))
     and (m.ever_active or m.archived_on > cp.report_date)
    where cp.period_type = 'daily'
      and (p_data_slugs is null or cp.brand = any(p_data_slugs))
      and cp.report_date between least(p_start, p_prior_start) and greatest(p_end, p_prior_end)
      and cp.creator_name is not null and btrim(cp.creator_name) <> ''
    group by 1
  ),
  moved as (
    select ph.handle, m.real_name,
           coalesce(ph.cur, 0) as cur,
           coalesce(ph.pri, 0) as pri,
           coalesce(ph.cur, 0) - coalesce(ph.pri, 0) as change
    from per_handle ph
    left join mem m on m.handle = ph.handle
    where coalesce(ph.cur, 0) > 0 or coalesce(ph.pri, 0) > 0
  )
  select jsonb_build_object(
    'gained',    coalesce((select sum(change) from moved where change > 0), 0),
    'lost',      coalesce((select sum(change) from moved where change < 0), 0),
    'netChange', coalesce((select sum(change) from moved), 0),
    'started',   (select count(*) from moved where pri = 0 and cur > 0),
    'stopped',   (select count(*) from moved where cur = 0 and pri > 0),
    'movers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'handle', handle, 'name', real_name,
               'cur', cur, 'prior', pri, 'change', change,
               'movement', case when pri = 0 and cur > 0 then 'new'
                                when cur = 0 and pri > 0 then 'stopped'
                                else 'changed' end
             ) order by abs(change) desc)
      from (select * from moved order by abs(change) desc limit greatest(coalesce(p_limit, 8), 1)) t
    ), '[]'::jsonb)
  );
$function$;

revoke execute on function public.get_brand_client_report_movers(text[], text[], date, date, date, date, int) from public;
revoke execute on function public.get_brand_client_report_movers(text[], text[], date, date, date, date, int) from anon;
grant  execute on function public.get_brand_client_report_movers(text[], text[], date, date, date, date, int) to authenticated, service_role;

comment on function public.get_brand_client_report_movers(text[], text[], date, date, date, date, int) is
  'Per-creator movement between two windows, for the week-over-week report. Reports GROSS gained and GROSS lost separately rather than a single percentage against the net, because a net figure is the residue of two opposing forces and one percentage hides their size.';

-- Verified on jiyu 2026-08-17..23 vs 08-10..16: gained $6,168.54, lost
-- $9,098.25, net -$2,929.71, 12 started, 7 stopped. Top mover Colleen
-- (@sullyco444) $1,058 -> $3,764.
