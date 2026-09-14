-- Read-only history for the server-authorized profile, using existing handle indexes.
-- SECURITY INVOKER and service-role-only execution; no new public data access.
create or replace function public.get_creator_performance_history(
  p_tenant_id uuid, p_handles text[], p_brands text[], p_start date, p_end date
) returns table(stat_date date, gmv numeric, posts bigint)
language plpgsql stable security invoker set search_path = public
as $$
begin
  if p_tenant_id is null or p_start is null or p_end is null
    or p_end < p_start or p_end - p_start > 365
    or coalesce(cardinality(p_handles), 0) not between 1 and 100
    or coalesce(cardinality(p_brands), 0) not between 1 and 200 then
    raise exception 'Invalid history scope or range' using errcode = '22023';
  end if;
  -- Publication facts lack tenant_id. Refuse ambiguous or foreign slugs.
  if exists (
    select 1 from unnest(p_brands) wanted(slug)
    where (select count(*) from public.brands_v2 b where b.slug = wanted.slug) <> 1
      or not exists (select 1 from public.brands_v2 b where b.slug = wanted.slug and b.tenant_id = p_tenant_id)
  ) then
    raise exception 'Invalid history brand scope' using errcode = '42501';
  end if;
  return query
  with money as (
    select cp.report_date as day,
      case when count(cp.gmv) = count(*) then sum(cp.gmv) else null end as amount
    from public.creator_performance cp
    where lower(cp.creator_name) = any(p_handles)
      and cp.tenant_id = p_tenant_id and cp.brand = any(p_brands)
      and cp.period_type = 'daily' and cp.report_date between p_start and p_end
    group by cp.report_date
  ), publications as (
    select p.video_id, max(p.post_date) as day
    from public.roster_creator_posts p
    where p.handle = any(p_handles) and p.brand_slug = any(p_brands)
      and p.post_date between p_start and p_end and p.video_id <> ''
    group by p.video_id
  ), counts as (
    select p.day, count(*) as amount from publications p group by p.day
  )
  select d.day::date, m.amount,
    case when m.day is not null or c.day is not null then coalesce(c.amount, 0) else null end
  from generate_series(p_start::timestamp, p_end::timestamp, interval '1 day') d(day)
  left join money m on m.day = d.day::date
  left join counts c on c.day = d.day::date
  order by d.day;
end;
$$;
revoke all on function public.get_creator_performance_history(uuid,text[],text[],date,date) from public, anon, authenticated;
grant execute on function public.get_creator_performance_history(uuid,text[],text[],date,date) to service_role;
