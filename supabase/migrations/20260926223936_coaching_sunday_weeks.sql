begin;
-- No historical dates are relabeled. Stop if a Monday report has appeared.
lock table public.coaching_weekly_reports in access exclusive mode;
do $$ begin
  if exists(select 1 from public.coaching_weekly_reports where extract(isodow from week_start)<>7) then
    raise exception 'Existing Monday coaching history requires an explicit preservation plan';
  end if;
end $$;
alter table public.coaching_weekly_reports drop constraint coaching_weekly_reports_week_start_check;
alter table public.coaching_weekly_reports add constraint coaching_weekly_reports_week_start_check check(extract(isodow from week_start)=7);
-- Honor customized capability levels as well as assignment and brand reach.
create or replace function public.write_coaching_record(p_actor uuid,p_tenant uuid,p_action text,p_assignment uuid,p_week date,p_payload jsonb,p_expected integer)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 actor_role text; a coaching_assignments%rowtype; r coaching_weekly_reports%rowtype;
 result_id uuid; sub_id uuid; task text; target_id uuid; b_id uuid; c_id uuid; v_id uuid;
begin
 select p.role into actor_role from user_profiles p where p.user_id=p_actor and p.tenant_id=p_tenant
 and p.role in ('owner','admin','manager','coach')
 and exists(select 1 from roles ro join role_permissions rp on rp.role_id=ro.id
   where ro.tenant_id=p_tenant and ((p.role_id is not null and ro.id=p.role_id) or (p.role_id is null and ro.key=p.role))
   and rp.screen='reporting' and rp.level=case when p_action='assign' then 'configure' else 'write' end
   and exists(select 1 from role_permissions read_perm where read_perm.role_id=ro.id and read_perm.screen='reporting' and read_perm.level='read'));
 if actor_role is null then raise exception 'Coaching access denied'; end if;
 if p_action='assign' then
   if actor_role not in ('owner','admin') then raise exception 'Only administrators can assign coaches'; end if;
   b_id := (p_payload->>'brandId')::uuid; c_id := (p_payload->>'coachId')::uuid; v_id := (p_payload->>'reviewerId')::uuid;
   if c_id=v_id or c_id is null or v_id is null or not exists(select 1 from brands_v2 where id=b_id and tenant_id=p_tenant and not is_archived) then raise exception 'Invalid coaching assignment'; end if;
   foreach target_id in array array[c_id,v_id] loop
     if not exists(select 1 from user_profiles p where p.user_id=target_id and p.tenant_id=p_tenant and p.role in ('owner','admin','manager','coach')
       and (p.role in ('owner','admin') or exists(select 1 from user_brand_access uba where uba.user_id=p.user_id and uba.tenant_id=p_tenant and uba.brand_id=b_id))
       and exists(select 1 from roles ro join role_permissions rp on rp.role_id=ro.id where ro.tenant_id=p_tenant
         and ((p.role_id is not null and ro.id=p.role_id) or (p.role_id is null and ro.key=p.role)) and rp.screen='reporting' and rp.level='write'
         and exists(select 1 from role_permissions read_perm where read_perm.role_id=ro.id and read_perm.screen='reporting' and read_perm.level='read'))) then
       raise exception 'Coach and reviewer need brand access and Reporting edit permission';
     end if;
   end loop;
   insert into coaching_assignments(tenant_id,brand_id,coach_id,reviewer_id,created_by)
   values(p_tenant,b_id,c_id,v_id,p_actor) returning id into result_id;
   return result_id;
 end if;
 select * into a from coaching_assignments where id=p_assignment and tenant_id=p_tenant for update;
 if not found or not a.active or not exists(select 1 from brands_v2 where id=a.brand_id and tenant_id=p_tenant and not is_archived) then raise exception 'Assignment unavailable'; end if;
 if actor_role not in ('owner','admin') and not exists(select 1 from user_brand_access where user_id=p_actor and tenant_id=p_tenant and brand_id=a.brand_id) then raise exception 'Brand access denied'; end if;
 if p_week is null or extract(isodow from p_week)<>7 or p_week>(now() at time zone 'America/Chicago')::date or p_week<date '2020-01-01' then raise exception 'Choose a valid week starting Monday'; end if;
 if p_action not in ('save','submit','reviewed','changes_requested') then raise exception 'Invalid coaching action'; end if;
 if p_action in ('save','submit') and p_actor<>a.coach_id then raise exception 'Only the assigned coach can submit'; end if;
 if p_action in ('reviewed','changes_requested') and (p_actor=a.coach_id or (p_actor<>a.reviewer_id and actor_role not in ('owner','admin'))) then raise exception 'Only the assigned reviewer can review'; end if;
 insert into coaching_weekly_reports(tenant_id,assignment_id,week_start) values(p_tenant,a.id,p_week) on conflict(assignment_id,week_start) do nothing;
 select * into r from coaching_weekly_reports where assignment_id=a.id and week_start=p_week and tenant_id=p_tenant for update;
 if p_expected is null or p_expected<>r.version then raise exception 'Report changed. Reload before saving'; end if;
 if p_action in ('save','submit') then
   if r.status not in ('draft','changes_requested') then raise exception 'Submitted reports are read-only'; end if;
   if jsonb_typeof(p_payload)<>'object' or jsonb_typeof(p_payload->'summary') is distinct from 'string'
      or jsonb_typeof(p_payload->'blockers') is distinct from 'string' or length(p_payload->>'summary')>5000 or length(p_payload->>'blockers')>5000 then raise exception 'Invalid report content'; end if;
   foreach task in array array['feedback','calls','loom'] loop
     if jsonb_typeof(p_payload->'entries'->task->'done') is distinct from 'boolean'
       or jsonb_typeof(p_payload->'entries'->task->'evidence') is distinct from 'string'
       or length(p_payload->'entries'->task->>'evidence')>5000 then raise exception 'Invalid responsibility entry'; end if;
     if p_action='submit' and (p_payload->'entries'->task->>'done')::boolean and length(trim(p_payload->'entries'->task->>'evidence'))=0 then raise exception 'Add evidence for completed responsibilities'; end if;
     if p_action='submit' and not (p_payload->'entries'->task->>'done')::boolean and length(trim(p_payload->>'blockers'))=0 then raise exception 'Explain unfinished responsibilities'; end if;
   end loop;
   if p_action='submit' and length(trim(p_payload->>'summary'))=0 then raise exception 'Add a weekly summary'; end if;
   if p_action='submit' then
     insert into coaching_submissions(tenant_id,report_id,revision,content,submitted_by)
       values(p_tenant,r.id,r.revision+1,p_payload,p_actor);
   end if;
   update coaching_weekly_reports set draft=p_payload,version=version+1,revision=revision+case when p_action='submit' then 1 else 0 end,
     status=case when p_action='submit' then 'submitted' else status end,updated_at=now() where id=r.id;
 else
   if r.status<>'submitted' then raise exception 'Only pending submissions can be reviewed'; end if;
   if jsonb_typeof(p_payload->'note') is distinct from 'string' or length(p_payload->>'note')>5000 then raise exception 'Invalid review note'; end if;
   if p_action='changes_requested' and length(trim(p_payload->>'note'))=0 then raise exception 'Explain the requested changes'; end if;
   select id into sub_id from coaching_submissions where report_id=r.id and revision=r.revision and tenant_id=p_tenant;
   insert into coaching_reviews(tenant_id,submission_id,decision,note,reviewed_by) values(p_tenant,sub_id,p_action,p_payload->>'note',p_actor);
   update coaching_weekly_reports set status=p_action,version=version+1,updated_at=now() where id=r.id;
 end if;
 return r.id;
end;
$$;
revoke all on function public.write_coaching_record(uuid,uuid,text,uuid,date,jsonb,integer) from public,anon,authenticated;
grant execute on function public.write_coaching_record(uuid,uuid,text,uuid,date,jsonb,integer) to service_role;

commit;
