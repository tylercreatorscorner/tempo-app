-- Effective compensation snapshots. NULL effective_month means an observed
-- legacy baseline, never an assertion about the original contract start date.
create table public.finance_compensation_legacy_payees (
 tenant_id uuid not null references public.tenants(id), team_member_id uuid not null references public.team_members(id),
 observed_at timestamptz not null default now(), primary key(tenant_id,team_member_id)
);
create table public.finance_compensation_history (
 tenant_id uuid not null references public.tenants(id), brand text not null, team_member_id uuid not null references public.team_members(id),
 revision integer not null check(revision>0), effective_month text check(effective_month ~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$'),
 active boolean not null, financials jsonb not null check(jsonb_typeof(financials)='object'),
 actor_id uuid, source jsonb not null check(jsonb_typeof(source)='object'), observed_at timestamptz not null default now(),
 primary key(tenant_id,brand,team_member_id,revision),
 check((effective_month is null) = (actor_id is null))
);
create index finance_compensation_period on public.finance_compensation_history(tenant_id,team_member_id,brand,effective_month desc,revision desc);
alter table public.finance_compensation_history enable row level security;
alter table public.finance_compensation_legacy_payees enable row level security;
revoke all on public.finance_compensation_history, public.finance_compensation_legacy_payees from public,anon,authenticated,service_role;
grant select,insert on public.finance_compensation_history to service_role;
grant select on public.finance_compensation_legacy_payees to service_role;

create function public.finance_compensation_immutable() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Compensation history is immutable'; end $$;
create trigger finance_compensation_history_immutable before update or delete on public.finance_compensation_history for each row execute function public.finance_compensation_immutable();
create trigger finance_compensation_legacy_payees_immutable before update or delete on public.finance_compensation_legacy_payees for each row execute function public.finance_compensation_immutable();

create function public.finance_compensation_fields(p_row jsonb) returns jsonb language sql immutable security invoker set search_path=public,pg_temp as $$
 select jsonb_object_agg(k,coalesce(p_row->k,'null'::jsonb)) from unnest(array['retainer','product_retainer_amount','product_retainer_name','launch_fee','launch_fee_name','launch_fee_ends','commission_rate','revenue_share_rate','marketing_commission_rate','compensation_model']) k
$$;

insert into public.finance_compensation_legacy_payees(tenant_id,team_member_id) select tenant_id,id from public.team_members;
insert into public.finance_compensation_history(tenant_id,brand,team_member_id,revision,effective_month,active,financials,actor_id,source)
 select c.tenant_id,c.brand,c.team_member_id,1,null,true,public.finance_compensation_fields(to_jsonb(c)),null,
 jsonb_build_object('kind','observed_legacy_baseline','legacyRowId',to_jsonb(c)->'id','effectiveDateKnown',false)
 from public.brand_compensation c;

create function public.finance_compensation_for_month(p_tenant_id uuid,p_team_member_id uuid,p_brands text[],p_month text)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_month is null or p_month !~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception 'Invalid compensation month'; end if;
 if p_tenant_id is null or not exists(select 1 from public.team_members where id=p_team_member_id and tenant_id=p_tenant_id) then raise exception 'Compensation payee unavailable'; end if;
 if p_brands is null or cardinality(p_brands)>1000 or exists(select 1 from unnest(p_brands) b where b is null or (select count(*) from public.brands_v2 v where v.slug=b)<>1 or not exists(select 1 from public.brands_v2 v where v.slug=b and v.tenant_id=p_tenant_id)) then raise exception 'Compensation brand unavailable'; end if;
 select coalesce(jsonb_agg(coalesce(h.financials,public.finance_compensation_fields('{}'::jsonb)) || jsonb_build_object(
   'brand',b.brand,'active',coalesce(h.active,legacy.team_member_id is not null),'revision',coalesce(latest.revision,0),
   'snapshot_revision',coalesce(h.revision,0),'effective_month',h.effective_month) order by b.brand),'[]'::jsonb) into result
 from (select distinct unnest(p_brands) brand) b
 left join public.finance_compensation_legacy_payees legacy on legacy.tenant_id=p_tenant_id and legacy.team_member_id=p_team_member_id
 left join lateral(select x.* from public.finance_compensation_history x where x.tenant_id=p_tenant_id and x.team_member_id=p_team_member_id and x.brand=b.brand and (x.effective_month is null or x.effective_month<=p_month) order by x.effective_month desc nulls last,x.revision desc limit 1) h on true
 left join lateral(select max(x.revision) revision from public.finance_compensation_history x where x.tenant_id=p_tenant_id and x.team_member_id=p_team_member_id and x.brand=b.brand) latest on true;
 return result;
end $$;

-- Direct edits are rejected, so every future mutation must carry an explicit
-- service month and trusted actor through the audited writer below.
create function public.finance_compensation_projection_guard() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if current_setting('tempo.compensation_projection',true) is distinct from 'on' then raise exception 'Use the effective compensation writer'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger finance_compensation_projection_guard before insert or update or delete on public.brand_compensation for each row execute function public.finance_compensation_projection_guard();

create function public.finance_compensation_write(
 p_tenant_id uuid,p_actor_id uuid,p_brand text,p_team_member_id uuid,p_effective_month text,p_patch jsonb,
 p_active boolean default true,p_expected_revision integer default null,p_source jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare current_revision integer; next_revision integer; previous jsonb; financials jsonb; projection jsonb;
 field text; value jsonb; number_value numeric; projection_flag text; current_month text; result jsonb; projection_active boolean;
begin
 if p_tenant_id is null or not exists(select 1 from public.user_profiles where tenant_id=p_tenant_id and user_id=p_actor_id and role in ('owner','admin')) then raise exception 'Compensation access denied'; end if;
 if not exists(select 1 from public.team_members where id=p_team_member_id and tenant_id=p_tenant_id) then raise exception 'Compensation payee unavailable'; end if;
 if p_brand is null or (select count(*) from public.brands_v2 where slug=p_brand)<>1 or not exists(select 1 from public.brands_v2 where tenant_id=p_tenant_id and slug=p_brand) then raise exception 'Compensation brand unavailable'; end if;
 if p_effective_month is null or p_effective_month !~ '^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception 'Invalid compensation month'; end if;
 if p_active is null or p_patch is null or jsonb_typeof(p_patch)<>'object' or p_source is null or jsonb_typeof(p_source)<>'object' or length(p_source::text)>10000 then raise exception 'Invalid compensation payload'; end if;
 if p_expected_revision is not null and p_expected_revision<0 then raise exception 'Invalid compensation revision'; end if;
 perform pg_advisory_xact_lock(hashtextextended('finance_compensation:'||p_tenant_id::text,0));
 select coalesce(max(revision),0) into current_revision from public.finance_compensation_history where tenant_id=p_tenant_id and brand=p_brand and team_member_id=p_team_member_id;
 if p_expected_revision is not null and current_revision<>p_expected_revision then raise exception 'Compensation revision conflict'; end if;
 select h.financials into previous from public.finance_compensation_history h where h.tenant_id=p_tenant_id and h.brand=p_brand and h.team_member_id=p_team_member_id and (h.effective_month is null or h.effective_month<=p_effective_month) order by h.effective_month desc nulls last,h.revision desc limit 1;
 financials:=coalesce(previous,'{"retainer":0,"product_retainer_amount":0,"product_retainer_name":null,"launch_fee":0,"launch_fee_name":null,"launch_fee_ends":null,"commission_rate":0,"revenue_share_rate":0,"marketing_commission_rate":0.02,"compensation_model":"standard"}'::jsonb);
 for field,value in select key,v from jsonb_each(p_patch) as e(key,v) loop
  if field not in ('retainer','product_retainer_amount','product_retainer_name','launch_fee','launch_fee_name','launch_fee_ends','commission_rate','revenue_share_rate','marketing_commission_rate','compensation_model') then raise exception 'Invalid compensation field'; end if;
  if value<>'null'::jsonb then
   if field in ('retainer','product_retainer_amount','launch_fee','commission_rate','revenue_share_rate','marketing_commission_rate') then
    if jsonb_typeof(value)<>'number' then raise exception 'Invalid compensation amount'; end if;
    number_value:=value::text::numeric;
    if number_value<0 or number_value>100000000 or (field='commission_rate' and number_value>100) or (field in ('revenue_share_rate','marketing_commission_rate') and number_value>1) then raise exception 'Invalid compensation amount'; end if;
    if field in ('retainer','product_retainer_amount','launch_fee') and round(number_value,2)<>number_value then raise exception 'Invalid compensation amount'; end if;
   elsif jsonb_typeof(value)<>'string' or length(value#>>'{}')>500 then raise exception 'Invalid compensation text';
   elsif field='compensation_model' and value#>>'{}' not in ('standard','revshare_max','commission_only','retainer_only') then raise exception 'Invalid compensation model';
   elsif field='launch_fee_ends' then
    if value#>>'{}' !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then raise exception 'Invalid compensation date'; end if;
    perform (value#>>'{}')::date;
   end if;
  end if;
 end loop;
 financials:=financials||p_patch;
 next_revision:=current_revision+1;
 insert into public.finance_compensation_history(tenant_id,brand,team_member_id,revision,effective_month,active,financials,actor_id,source)
 values(p_tenant_id,p_brand,p_team_member_id,next_revision,p_effective_month,p_active,financials,p_actor_id,p_source);
 -- The physical row is a compatibility projection of the current month;
 -- future-dated entries must not affect today's old consumers.
 current_month:=to_char(now() at time zone 'America/Chicago','YYYY-MM');
 select h.financials,h.active into projection,projection_active from public.finance_compensation_history h where h.tenant_id=p_tenant_id and h.brand=p_brand and h.team_member_id=p_team_member_id and (h.effective_month is null or h.effective_month<=current_month) order by h.effective_month desc nulls last,h.revision desc limit 1;
 if projection is not null then
  if not projection_active then projection:=projection||'{"retainer":0,"product_retainer_amount":0,"launch_fee":0,"commission_rate":0,"revenue_share_rate":0,"marketing_commission_rate":0,"compensation_model":"retainer_only"}'::jsonb; end if;
  projection_flag:=current_setting('tempo.compensation_projection',true);
  perform set_config('tempo.compensation_projection','on',true);
  insert into public.brand_compensation(tenant_id,brand,team_member_id,retainer,product_retainer_amount,product_retainer_name,launch_fee,launch_fee_name,launch_fee_ends,commission_rate,revenue_share_rate,marketing_commission_rate,compensation_model)
  select p_tenant_id,p_brand,p_team_member_id,c.retainer,c.product_retainer_amount,c.product_retainer_name,c.launch_fee,c.launch_fee_name,c.launch_fee_ends,c.commission_rate,c.revenue_share_rate,c.marketing_commission_rate,c.compensation_model from jsonb_populate_record(null::public.brand_compensation,projection) c
  on conflict(brand,team_member_id,tenant_id) do update set retainer=excluded.retainer,product_retainer_amount=excluded.product_retainer_amount,product_retainer_name=excluded.product_retainer_name,launch_fee=excluded.launch_fee,launch_fee_name=excluded.launch_fee_name,launch_fee_ends=excluded.launch_fee_ends,commission_rate=excluded.commission_rate,revenue_share_rate=excluded.revenue_share_rate,marketing_commission_rate=excluded.marketing_commission_rate,compensation_model=excluded.compensation_model;
  perform set_config('tempo.compensation_projection',coalesce(projection_flag,''),true);
 end if;
 result:=financials||jsonb_build_object('brand',p_brand,'team_member_id',p_team_member_id,'active',p_active,'revision',next_revision,'snapshot_revision',next_revision,'effective_month',p_effective_month);
 return result;
end $$;

create function public.finance_compensation_write_batch(p_tenant_id uuid,p_actor_id uuid,p_effective_month text,p_changes jsonb,p_source jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare change jsonb; result jsonb:='[]'::jsonb;
begin
 if p_changes is null or jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)<1 or jsonb_array_length(p_changes)>1000 then raise exception 'Invalid compensation batch'; end if;
 for change in select value from jsonb_array_elements(p_changes) loop
  if jsonb_typeof(change)<>'object' or not change ?& array['brand','team_member_id','patch'] or exists(select 1 from jsonb_object_keys(change) k where k not in ('brand','team_member_id','patch','active','expected_revision')) then raise exception 'Invalid compensation batch item'; end if;
  result:=result||jsonb_build_array(public.finance_compensation_write(p_tenant_id,p_actor_id,change->>'brand',(change->>'team_member_id')::uuid,p_effective_month,change->'patch',coalesce((change->>'active')::boolean,true),(change->>'expected_revision')::integer,p_source));
 end loop;
 return result;
end $$;

revoke all on function public.finance_compensation_immutable(),public.finance_compensation_fields(jsonb),public.finance_compensation_projection_guard(),public.finance_compensation_for_month(uuid,uuid,text[],text),public.finance_compensation_write(uuid,uuid,text,uuid,text,jsonb,boolean,integer,jsonb),public.finance_compensation_write_batch(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.finance_compensation_fields(jsonb),public.finance_compensation_projection_guard(),public.finance_compensation_for_month(uuid,uuid,text[],text),public.finance_compensation_write(uuid,uuid,text,uuid,text,jsonb,boolean,integer,jsonb),public.finance_compensation_write_batch(uuid,uuid,text,jsonb,jsonb) to service_role;
