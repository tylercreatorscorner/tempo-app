-- Agreement ledger foundation. No legacy backfill: current roster terms are not historical evidence.
create table public.creator_agreement_ledgers (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 creator_id uuid not null references public.creators_v2(id),
 brand_id uuid not null references public.brands_v2(id),
 starts_on date not null,
 ends_on date,
 version integer not null check(version>0),
 state jsonb not null check(jsonb_typeof(state)='object' and state->>'schemaVersion'='1'),
 updated_at timestamptz not null default now(),
 check(ends_on is null or ends_on>=starts_on)
);
create index creator_agreement_scope on public.creator_agreement_ledgers(tenant_id,creator_id,brand_id,starts_on);
create table public.creator_agreement_events (
 id uuid primary key default gen_random_uuid(),
 ledger_id uuid not null references public.creator_agreement_ledgers(id),
 version integer not null,
 request_id uuid not null,
 actor_id uuid,
 command jsonb not null check(jsonb_typeof(command)='object'),
 check(actor_id is not null or command->>'action'='advance'),
 recorded_at timestamptz not null default now(),
 unique(ledger_id,version), unique(ledger_id,request_id)
);
create index creator_agreement_events_history on public.creator_agreement_events(ledger_id,recorded_at);
alter table public.creator_agreement_ledgers enable row level security;
alter table public.creator_agreement_events enable row level security;
revoke all on public.creator_agreement_ledgers,public.creator_agreement_events from public,anon,authenticated,service_role;
grant select,insert,update on public.creator_agreement_ledgers to service_role;
grant select,insert on public.creator_agreement_events to service_role;
create function public.reject_agreement_event_mutation() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'Agreement events are append-only'; end $$;
create trigger creator_agreement_events_immutable before update or delete on public.creator_agreement_events for each row execute function public.reject_agreement_event_mutation();
revoke all on function public.reject_agreement_event_mutation() from public,anon,authenticated;

-- The server validates domain commands and scope. This transaction independently binds
-- tenant/creator/brand, serializes overlapping agreements, rejects stale saves and retains the command.
create function public.save_creator_agreement_ledger(
 p_id uuid,p_tenant uuid,p_creator uuid,p_brand uuid,p_actor uuid,
 p_expected integer,p_request uuid,p_command jsonb,p_state jsonb
) returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare current_row public.creator_agreement_ledgers; prior public.creator_agreement_events;
 start_date date; end_date date;
begin
 if (p_actor is null and p_command->>'action' is distinct from 'advance') or p_request is null or p_id is null or p_expected is null or p_expected<0
 or jsonb_typeof(p_state) is distinct from 'object' or p_state->>'schemaVersion' is distinct from '1'
 or jsonb_typeof(p_state->'periods') is distinct from 'array' or jsonb_array_length(p_state->'periods')<1
 or jsonb_typeof(p_command) is distinct from 'object' or p_command->>'action' is null
 or p_command->>'action' not in ('create','change','end','advance','renew')
 or length(trim(coalesce(p_command->>'reason','')))<3 then raise exception 'Invalid agreement write'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_creator::text||p_brand::text,0));
 if not exists(select 1 from creators_v2 c join creator_brands cb on cb.creator_id=c.id and cb.tenant_id=c.tenant_id join brands_v2 b on b.id=cb.brand_id and b.tenant_id=c.tenant_id where c.id=p_creator and c.tenant_id=p_tenant and b.id=p_brand and not b.is_archived) then raise exception 'Agreement relationship is unavailable'; end if;
 select * into current_row from creator_agreement_ledgers where id=p_id for update;
 if current_row.id is not null and (current_row.tenant_id<>p_tenant or current_row.creator_id<>p_creator or current_row.brand_id<>p_brand) then raise exception 'Agreement scope mismatch'; end if;
 select * into prior from creator_agreement_events where ledger_id=p_id and request_id=p_request;
 if prior.id is not null then
  if prior.actor_id is distinct from p_actor or prior.command is distinct from p_command then raise exception 'Request key already used'; end if;
  return prior.version;
 end if;
 if coalesce(current_row.version,0)<>p_expected then raise exception 'Agreement changed. Reload before saving'; end if;
 if (current_row.id is null) <> (p_command->>'action'='create') then raise exception 'Invalid agreement lifecycle'; end if;
 if current_row.id is not null then
  if p_state->>'kind' is distinct from current_row.state->>'kind' or p_state->'deadline' is distinct from current_row.state->'deadline' then raise exception 'Agreement identity cannot change'; end if;
  -- An existing period and every recorded revision must survive all later saves.
  if exists (
    select 1 from jsonb_array_elements(current_row.state->'periods') old_period
    where not exists (
      select 1 from jsonb_array_elements(p_state->'periods') new_period
      where new_period->>'start'=old_period->>'start' and new_period->>'through'=old_period->>'through'
      and jsonb_typeof(new_period->'revisions')='array'
      and not exists (
        select 1 from jsonb_array_elements(old_period->'revisions') with ordinality r(value,idx)
        where new_period->'revisions'->(r.idx::integer-1) is distinct from r.value
      )
    )
  ) then raise exception 'Historical agreement revisions cannot be replaced'; end if;
 end if;
 start_date:=(p_state->>'start')::date;
 end_date:=coalesce((p_state->>'finalDate')::date,(p_state->>'deadline')::date);
 if start_date is null or (current_row.id is not null and current_row.starts_on<>start_date) then raise exception 'Agreement start cannot change'; end if;
 if exists(select 1 from creator_agreement_ledgers where tenant_id=p_tenant and creator_id=p_creator and brand_id=p_brand and id<>p_id and starts_on<=coalesce(end_date,'infinity'::date) and coalesce(ends_on,'infinity'::date)>=start_date) then raise exception 'Agreement overlaps an existing agreement'; end if;
 if current_row.id is null then
  insert into creator_agreement_ledgers(id,tenant_id,creator_id,brand_id,starts_on,ends_on,version,state) values(p_id,p_tenant,p_creator,p_brand,start_date,end_date,1,p_state);
 else
  update creator_agreement_ledgers set ends_on=end_date,version=p_expected+1,state=p_state,updated_at=now() where id=p_id;
 end if;
 insert into creator_agreement_events(ledger_id,version,request_id,actor_id,command) values(p_id,p_expected+1,p_request,p_actor,p_command);
 return p_expected+1;
end $$;
revoke all on function public.save_creator_agreement_ledger(uuid,uuid,uuid,uuid,uuid,integer,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_creator_agreement_ledger(uuid,uuid,uuid,uuid,uuid,integer,uuid,jsonb,jsonb) to service_role;
