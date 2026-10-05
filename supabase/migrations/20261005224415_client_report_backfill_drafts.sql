-- Private historical work queue. Deliberately separate from public client_reports.
create table public.client_report_backfill_drafts (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 brand_slug text not null,
 report_type text not null check (report_type in ('weekly','monthly')),
 period_start date not null,
 period_end date not null check (period_end >= period_start),
 recorded_days integer not null,
 expected_days integer not null,
 status text not null default 'pending' check (status in ('pending','building','review','failed')),
 snapshot jsonb,
 error text,
 generated_at timestamptz,
 updated_at timestamptz not null default now(),
 unique(tenant_id,brand_slug,report_type,period_start,period_end),
 check (report_type <> 'weekly' or (extract(isodow from period_start)=1 and period_end=period_start+6))
);
alter table public.client_report_backfill_drafts enable row level security;
revoke all on public.client_report_backfill_drafts from public,anon,authenticated;
grant select,insert,update on public.client_report_backfill_drafts to service_role;
-- Scope supplied by authorized reporting server only. Archived brands retain history.
create function public.prepare_report_backfill(p_tenant uuid, p_brands text[])
returns integer language plpgsql security invoker set search_path=public as $$
declare added integer;
begin
 with days as (
 select distinct b.slug, c.report_date::date as d
 from brands_v2 b join brands_v2 source on source.tenant_id=b.tenant_id
  and (source.id=b.id or (b.is_umbrella and source.parent_brand_id=b.id))
 join creator_performance c on c.tenant_id=b.tenant_id and c.brand=source.slug and c.period_type='daily'
 where b.tenant_id=p_tenant and b.slug=any(p_brands)
 ), periods as (
 select slug,'weekly'::text as kind, (d-(extract(isodow from d)::int-1)) as start_date,
 (d-(extract(isodow from d)::int-1)+6) as end_date,count(*)::int as recorded from days group by 1,3,4
 union all
 select slug,'monthly',date_trunc('month',d)::date,(date_trunc('month',d)+interval '1 month - 1 day')::date,count(*)::int from days group by 1,3,4
 )
 insert into client_report_backfill_drafts(tenant_id,brand_slug,report_type,period_start,period_end,recorded_days,expected_days)
 select p_tenant,slug,kind,start_date,end_date,recorded,end_date-start_date+1 from periods p
 where end_date < (now() at time zone 'America/Chicago')::date
 and not exists(select 1 from client_reports r where r.tenant_id=p_tenant and r.brand_slug=p.slug
 and r.report_type=p.kind and r.period_start=p.start_date and r.period_end=p.end_date and r.revoked_at is null)
 on conflict do nothing;
 get diagnostics added = row_count;
 return added;
end $$;
revoke all on function public.prepare_report_backfill(uuid,text[]) from public,anon,authenticated;
grant execute on function public.prepare_report_backfill(uuid,text[]) to service_role;
