-- Internal goal records. All access is through scoped server-side handlers.
create table public.manager_monthly_goals (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 brand_id uuid not null references public.brands_v2(id),
 manager_user_id uuid not null,
 month date not null check (extract(day from month)=1),
 proposed_target numeric(16,2) check(proposed_target>0),
 proposal_reason text,
 approved_target numeric(16,2) check(approved_target>0),
 approval_reason text,
 approved_by uuid,
 approved_at timestamptz,
 version integer not null default 1,
 updated_at timestamptz not null default now(),
 unique(tenant_id,brand_id,month)
);
create table public.manager_goal_events (
 id uuid primary key default gen_random_uuid(),
 goal_id uuid not null references public.manager_monthly_goals(id),
 actor_id uuid not null,
 action text not null check(action in ('propose','approve')),
 reason text not null,
 snapshot jsonb not null,
 created_at timestamptz not null default now()
);
create index manager_goals_owner_month on public.manager_monthly_goals(tenant_id,manager_user_id,month);
create index manager_goal_events_goal on public.manager_goal_events(goal_id,created_at);
alter table public.manager_monthly_goals enable row level security;
alter table public.manager_goal_events enable row level security;
revoke all on public.manager_monthly_goals,public.manager_goal_events from public,anon,authenticated,service_role;
grant select,insert,update on public.manager_monthly_goals to service_role;
grant select,insert on public.manager_goal_events to service_role;
-- Serialize brand/month writes, check expected version, and atomically retain the revision.
create function public.save_manager_monthly_goal(p_tenant uuid,p_brand uuid,p_manager uuid,p_month date,p_actor uuid,p_action text,p_target numeric,p_reason text,p_version integer)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare g public.manager_monthly_goals;
begin
 if p_action not in ('propose','approve') or p_action is null or p_actor is null or p_target is null or p_target<0.01 or p_target<>round(p_target,2) or p_target>99999999999999 or p_reason is null or length(trim(p_reason))<3 or length(p_reason)>2000 or p_month is null or extract(day from p_month)<>1 then raise exception 'Invalid goal'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_brand::text||p_month::text,0));
 if not exists(select 1 from brands_v2 b join brand_manager_assignments a on a.brand_id=b.id join user_profiles u on u.user_id=a.manager_user_id and u.tenant_id=b.tenant_id where b.id=p_brand and b.tenant_id=p_tenant and not b.is_archived and a.manager_user_id=p_manager) then raise exception 'Manager assignment changed. Reload the review.'; end if;
 select * into g from manager_monthly_goals where tenant_id=p_tenant and brand_id=p_brand and month=p_month for update;
 if coalesce(g.version,0) is distinct from p_version then raise exception 'Goal changed. Reload before saving.'; end if;
 if g.id is not null and g.manager_user_id<>p_manager then raise exception 'This month belongs to its recorded manager. Contact leadership before changing ownership.'; end if;
 if g.id is null then
 insert into manager_monthly_goals(tenant_id,brand_id,manager_user_id,month) values(p_tenant,p_brand,p_manager,p_month) returning * into g;
 else
 g.version:=g.version+1;
 end if;
 update manager_monthly_goals set
 proposed_target=case when p_action='propose' then round(p_target,2) else null end,
 proposal_reason=case when p_action='propose' then trim(p_reason) else null end,
 approved_target=case when p_action='approve' then round(p_target,2) else approved_target end,
 approval_reason=case when p_action='approve' then trim(p_reason) else approval_reason end,
 approved_by=case when p_action='approve' then p_actor else approved_by end,
 approved_at=case when p_action='approve' then now() else approved_at end,
 version=g.version,updated_at=now() where id=g.id returning * into g;
 insert into manager_goal_events(goal_id,actor_id,action,reason,snapshot) values(g.id,p_actor,p_action,trim(p_reason),to_jsonb(g));
 return g.id;
end $$;
revoke all on function public.save_manager_monthly_goal(uuid,uuid,uuid,date,uuid,text,numeric,text,integer) from public,anon,authenticated;
grant execute on function public.save_manager_monthly_goal(uuid,uuid,uuid,date,uuid,text,numeric,text,integer) to service_role;
