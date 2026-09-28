-- Creator applications are untrusted until an assigned manager decides. Keep
-- applicant PII separate from the roster and from legacy unscoped applications.
create table public.creator_application_forms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  brand_id uuid not null references public.brands_v2(id),
  title text not null default 'Creator application',
  introduction text not null default '',
  questions jsonb not null default '[]'::jsonb,
  version integer not null default 1 check (version > 0),
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id)
);

create table public.creator_application_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  brand_id uuid not null references public.brands_v2(id),
  form_id uuid not null references public.creator_application_forms(id),
  form_version integer not null,
  questions_snapshot jsonb not null,
  answers jsonb not null default '{}'::jsonb,
  full_name text not null,
  email text not null,
  tiktok_handle text not null,
  discord_username text,
  status text not null default 'pending' check (status in ('pending','approved','declined','needs_info')),
  decision_note text,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  handoff_status text not null default 'not_started' check (handoff_status in ('not_started','pending','completed')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_application_contact_lengths check (
    length(full_name) between 2 and 160 and length(email) between 3 and 254
    and length(tiktok_handle) between 2 and 80
    and (discord_username is null or length(discord_username) <= 80)
  )
);

create index creator_application_queue_idx on public.creator_application_submissions(tenant_id,brand_id,status,submitted_at desc);
create index creator_application_email_idx on public.creator_application_submissions(form_id,lower(email));

create table public.creator_application_decisions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.creator_application_submissions(id),
  tenant_id uuid not null references public.tenants(id),
  brand_id uuid not null references public.brands_v2(id),
  actor_id uuid not null references auth.users(id),
  prior_status text not null,
  new_status text not null,
  note text,
  decided_at timestamptz not null default now()
);
create index creator_application_decisions_submission_idx on public.creator_application_decisions(submission_id,decided_at desc);

alter table public.creator_application_forms enable row level security;
alter table public.creator_application_submissions enable row level security;
alter table public.creator_application_decisions enable row level security;
revoke all on public.creator_application_forms from public, anon, authenticated;
revoke all on public.creator_application_submissions from public, anon, authenticated;
revoke all on public.creator_application_decisions from public, anon, authenticated;
grant all on public.creator_application_forms to service_role;
grant all on public.creator_application_submissions to service_role;
grant all on public.creator_application_decisions to service_role;

-- Only Tempo's server-held service key may call this. The function repeats the
-- live tenant, manager, access and capability checks inside the transaction,
-- then locks the application row to make retries/races one decision.
create or replace function public.decide_creator_application(
  p_submission_id uuid, p_tenant_id uuid, p_actor_id uuid,
  p_expected_status text, p_new_status text, p_note text default null
) returns public.creator_application_submissions
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_row public.creator_application_submissions;
  v_role_id uuid;
begin
  if p_new_status not in ('approved','declined','needs_info') or p_expected_status not in ('pending','needs_info') then
    raise exception 'Invalid decision transition';
  end if;
  select * into v_row from public.creator_application_submissions
    where id = p_submission_id and tenant_id = p_tenant_id for update;
  if not found or v_row.status <> p_expected_status then
    raise exception 'Application changed. Reload before deciding.';
  end if;
  if not exists (
    select 1 from public.brands_v2 b
    join public.brand_manager_assignments a on a.brand_id = b.id
    join public.user_profiles p on p.user_id = a.manager_user_id and p.tenant_id = b.tenant_id
    where b.id = v_row.brand_id and b.tenant_id = p_tenant_id and b.is_archived = false
      and a.manager_user_id = p_actor_id and p.role in ('manager','owner','admin')
      and (p.role in ('owner','admin') or exists (
        select 1 from public.user_brand_access uba
        where uba.user_id = p.user_id and uba.brand_id = b.id and uba.tenant_id = b.tenant_id
      ))
  ) then
    raise exception 'Only the current assigned brand manager may decide';
  end if;
  select coalesce(p.role_id, r.id) into v_role_id from public.user_profiles p
    left join public.roles r on r.tenant_id = p.tenant_id and r.key = p.role
    where p.user_id = p_actor_id and p.tenant_id = p_tenant_id;
  if v_role_id is null or not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = v_role_id and rp.screen = 'roster' and rp.level = 'write'
  ) then
    raise exception 'Roster write access is required';
  end if;
  update public.creator_application_submissions
    set status = p_new_status, decision_note = nullif(trim(p_note),'')::text,
        decided_by = p_actor_id, decided_at = now(), updated_at = now(),
        handoff_status = case when p_new_status = 'approved' then 'pending' else 'not_started' end
    where id = p_submission_id returning * into v_row;
  insert into public.creator_application_decisions
    (submission_id, tenant_id, brand_id, actor_id, prior_status, new_status, note)
  values (p_submission_id, p_tenant_id, v_row.brand_id, p_actor_id, p_expected_status, p_new_status, nullif(trim(p_note),''));
  return v_row;
end;
$$;
revoke all on function public.decide_creator_application(uuid,uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.decide_creator_application(uuid,uuid,uuid,text,text,text) to service_role;
