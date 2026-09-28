-- Creator Hub content is configured per brand. Enrollment rows preserve the
-- exact version and required flag the creator was assigned.
-- The application decision RPC trusts the accountable assignment. Browser
-- users must not be able to reassign themselves before approving applicants.
drop policy if exists "staff_write" on public.brand_manager_assignments;
revoke insert, update, delete on public.brand_manager_assignments from authenticated;

alter table public.creator_application_submissions
  add column discord_user_id text,
  add column discord_display_name text,
  add column discord_avatar_url text,
  add column phone_number text,
  add column gmv_last_30_days_usd numeric(14,2),
  add column deal_preference text,
  add constraint creator_application_discord_id_format check (discord_user_id is null or discord_user_id ~ '^[0-9]{17,20}$'),
  add constraint creator_application_phone_length check (phone_number is null or length(phone_number) between 7 and 40),
  add constraint creator_application_gmv_nonnegative check (gmv_last_30_days_usd is null or gmv_last_30_days_usd >= 0),
  add constraint creator_application_deal_preference check (deal_preference is null or deal_preference in ('affiliate','retainer','either'));

create unique index creator_application_submission_scope_idx
  on public.creator_application_submissions(id, tenant_id, brand_id);
create unique index creator_hub_brand_scope_idx on public.brands_v2(id, tenant_id);

create table public.creator_hub_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  brand_id uuid not null,
  kind text not null check (kind in ('video','reading','link','acknowledgement')),
  required boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id, brand_id),
  foreign key (brand_id, tenant_id) references public.brands_v2(id, tenant_id)
);
create index creator_hub_items_brand_idx on public.creator_hub_items(tenant_id, brand_id, active, sort_order);

create table public.creator_hub_item_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.creator_hub_items(id),
  version integer not null check (version > 0),
  title text not null check (length(trim(title)) between 1 and 200),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  created_at timestamptz not null default now(),
  unique (item_id, version),
  unique (item_id, id)
);
alter table public.creator_hub_items
  add constraint creator_hub_current_version_fk
  foreign key (id, current_version_id)
  references public.creator_hub_item_versions(item_id, id);

create function public.guard_creator_hub_item_kind() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.kind <> old.kind and exists (
    select 1 from public.creator_hub_item_versions where item_id = old.id
  ) then
    raise exception 'Published Hub item kind is immutable';
  end if;
  return new;
end;
$$;
create trigger creator_hub_item_kind_guard
  before update on public.creator_hub_items
  for each row execute function public.guard_creator_hub_item_kind();

-- Published versions cannot change in place. Publish a new version instead.
create function public.reject_creator_hub_version_mutation() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'Creator Hub versions are immutable';
end;
$$;
create trigger creator_hub_version_immutable
  before update or delete on public.creator_hub_item_versions
  for each row execute function public.reject_creator_hub_version_mutation();

create table public.creator_hub_enrollments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique,
  tenant_id uuid not null references public.tenants(id),
  brand_id uuid not null,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{17,20}$'),
  status text not null default 'pending' check (status in ('pending','in_progress','complete')),
  snapshot_finalized_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (application_id, tenant_id, brand_id)
    references public.creator_application_submissions(id, tenant_id, brand_id),
  foreign key (brand_id, tenant_id) references public.brands_v2(id, tenant_id),
  unique (id, tenant_id, brand_id)
);
create index creator_hub_enrollments_brand_idx on public.creator_hub_enrollments(tenant_id, brand_id, status, created_at desc);

create table public.creator_hub_enrollment_items (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null,
  tenant_id uuid not null,
  brand_id uuid not null,
  item_id uuid not null,
  item_version_id uuid not null,
  kind text not null check (kind in ('video','reading','link','acknowledgement')),
  required boolean not null,
  completed_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (enrollment_id, item_id),
  foreign key (enrollment_id, tenant_id, brand_id)
    references public.creator_hub_enrollments(id, tenant_id, brand_id),
  foreign key (item_id, tenant_id, brand_id)
    references public.creator_hub_items(id, tenant_id, brand_id),
  foreign key (item_id, item_version_id)
    references public.creator_hub_item_versions(item_id, id),
  check (accepted_at is null or kind = 'acknowledgement')
);
create index creator_hub_enrollment_items_enrollment_idx on public.creator_hub_enrollment_items(enrollment_id, required);

-- A finalized snapshot needs at least one required item. Acknowledgements
-- count only on acceptance; all other kinds count on completion.
create function public.creator_hub_required_complete(p_enrollment_id uuid)
returns boolean language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce((
    select e.snapshot_finalized_at is not null
      and exists (
        select 1 from public.creator_hub_enrollment_items i
        where i.enrollment_id = e.id and i.required
      )
      and not exists (
        select 1 from public.creator_hub_enrollment_items i
        where i.enrollment_id = e.id and i.required
          and case when i.kind = 'acknowledgement'
            then i.accepted_at is null else i.completed_at is null end
      )
    from public.creator_hub_enrollments e where e.id = p_enrollment_id
  ), false);
$$;

create function public.guard_creator_hub_enrollment() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_application public.creator_application_submissions;
begin
  if tg_op = 'INSERT' then
    select * into v_application from public.creator_application_submissions
      where id = new.application_id;
    if v_application.status <> 'approved'
      or v_application.discord_user_id is null
      or v_application.discord_user_id <> new.discord_user_id then
      raise exception 'Hub enrollment requires an approved application and matching verified Discord ID';
    end if;
  else
    if new.application_id <> old.application_id or new.tenant_id <> old.tenant_id
      or new.brand_id <> old.brand_id or new.discord_user_id <> old.discord_user_id
      or (old.snapshot_finalized_at is not null and new.snapshot_finalized_at is distinct from old.snapshot_finalized_at) then
      raise exception 'Hub enrollment identity and finalized snapshot are immutable';
    end if;
    if new.status = 'complete' and old.status <> 'complete'
      and not public.creator_hub_required_complete(new.id) then
      raise exception 'Required Hub items are not complete';
    end if;
    if (new.status = 'complete') <> (new.completed_at is not null)
      or (old.completed_at is not null and new.completed_at is distinct from old.completed_at) then
      raise exception 'Hub completion time must match completed status and cannot change';
    end if;
    if old.snapshot_finalized_at is null and new.snapshot_finalized_at is not null
      and (
        exists (
          select 1 from public.creator_hub_items item
          left join public.creator_hub_enrollment_items snapshot
            on snapshot.enrollment_id = new.id and snapshot.item_id = item.id
          where item.tenant_id = new.tenant_id and item.brand_id = new.brand_id
            and item.active and item.current_version_id is not null
            and (snapshot.id is null or snapshot.item_version_id <> item.current_version_id
              or snapshot.required <> item.required or snapshot.kind <> item.kind)
        ) or exists (
          select 1 from public.creator_hub_enrollment_items snapshot
          left join public.creator_hub_items item on item.id = snapshot.item_id
          where snapshot.enrollment_id = new.id
            and (item.id is null or not item.active or item.current_version_id is null)
        )
      ) then
      raise exception 'Hub snapshot must match the current active brand items';
    end if;
    if old.status = 'complete' and new.status <> 'complete' then
      raise exception 'Completed Hub enrollment cannot be reopened';
    end if;
  end if;
  return new;
end;
$$;
create trigger creator_hub_enrollment_guard
  before insert or update on public.creator_hub_enrollments
  for each row execute function public.guard_creator_hub_enrollment();

create function public.guard_creator_hub_enrollment_item() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_finalized_at timestamptz;
declare v_item_kind text;
begin
  select snapshot_finalized_at into v_finalized_at
    from public.creator_hub_enrollments where id = coalesce(new.enrollment_id, old.enrollment_id);
  if tg_op = 'DELETE' or (tg_op = 'INSERT' and v_finalized_at is not null) then
    raise exception 'Cannot change a finalized Hub snapshot';
  end if;
  if tg_op = 'INSERT' then
    select kind into v_item_kind from public.creator_hub_items
      where id = new.item_id and active and current_version_id = new.item_version_id
        and required = new.required;
    if v_item_kind is distinct from new.kind then
      raise exception 'Hub item version, requirement, or kind does not match brand configuration';
    end if;
  else
    if new.enrollment_id <> old.enrollment_id or new.tenant_id <> old.tenant_id
      or new.brand_id <> old.brand_id or new.item_id <> old.item_id
      or new.item_version_id <> old.item_version_id or new.kind <> old.kind
      or new.required <> old.required or new.created_at <> old.created_at
      or (old.completed_at is not null and new.completed_at is distinct from old.completed_at)
      or (old.accepted_at is not null and new.accepted_at is distinct from old.accepted_at) then
      raise exception 'Hub snapshot and recorded completion are immutable';
    end if;
  end if;
  return new;
end;
$$;
create trigger creator_hub_enrollment_item_guard
  before insert or update or delete on public.creator_hub_enrollment_items
  for each row execute function public.guard_creator_hub_enrollment_item();

-- One durable provisioning record lets Tempo Bot retry role and channel work.
-- Its channel_id is persisted once Discord confirms creation; the enrollment ID
-- should also be embedded in the channel topic for recovery after a crash.
create table public.creator_hub_provisioning (
  enrollment_id uuid primary key,
  tenant_id uuid not null,
  brand_id uuid not null,
  channel_id text unique,
  role_granted_at timestamptz,
  chat_created_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  last_error text,
  lease_token uuid,
  lease_until timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (enrollment_id, tenant_id, brand_id)
    references public.creator_hub_enrollments(id, tenant_id, brand_id),
  check (chat_created_at is null or channel_id is not null)
);
create index creator_hub_provisioning_brand_idx on public.creator_hub_provisioning(tenant_id, brand_id);

create view public.creator_hub_pending_provisioning with (security_invoker = true) as
  select e.id, e.tenant_id, e.brand_id, e.completed_at, p.last_attempt_at
  from public.creator_hub_enrollments e
  left join public.creator_hub_provisioning p on p.enrollment_id = e.id
  where e.status = 'complete'
    and (p.enrollment_id is null or p.role_granted_at is null or p.chat_created_at is null);

-- Explicit per-brand Discord destination. Inert until a server/channel/role
-- preflight has been completed and an operator enables the brand.
create table public.creator_hub_discord_destinations (
  brand_id uuid primary key,
  tenant_id uuid not null,
  guild_id text not null check (guild_id ~ '^[0-9]{17,20}$'),
  start_here_channel_id text not null check (start_here_channel_id ~ '^[0-9]{17,20}$'),
  creator_role_id text not null check (creator_role_id ~ '^[0-9]{17,20}$'),
  coaching_category_id text not null check (coaching_category_id ~ '^[0-9]{17,20}$'),
  staff_role_ids text[] not null check (cardinality(staff_role_ids) > 0),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  foreign key (brand_id, tenant_id) references public.brands_v2(id, tenant_id),
  -- Only the verified Creators Corner JiYu guild can be configured in V1.
  check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    and brand_id = 'b0000000-0000-0000-0000-000000000003'::uuid
    and guild_id = '1339335585776533708'),
  check (guild_id <> creator_role_id and guild_id <> coaching_category_id)
);

-- Decision delivery is a separate, retryable effect. A failed email or invite
-- must never erase the manager's decision or silently claim it was delivered.
create table public.creator_application_notifications (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null unique references public.creator_application_decisions(id),
  submission_id uuid not null references public.creator_application_submissions(id),
  tenant_id uuid not null references public.tenants(id),
  brand_id uuid not null,
  kind text not null check (kind in ('approved','declined')),
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  invite_url text,
  invite_created_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  sending_started_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (brand_id, tenant_id) references public.brands_v2(id, tenant_id)
);
create index creator_application_notifications_pending_idx
  on public.creator_application_notifications(status, created_at)
  where status <> 'sent';

create function public.queue_creator_application_decision_message() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.new_status in ('approved','declined') then
    insert into public.creator_application_notifications
      (decision_id, submission_id, tenant_id, brand_id, kind)
    values (new.id, new.submission_id, new.tenant_id, new.brand_id, new.new_status);
  end if;
  return new;
end;
$$;
create trigger creator_application_decision_notification
  after insert on public.creator_application_decisions
  for each row execute function public.queue_creator_application_decision_message();

create function public.claim_creator_application_notification(p_id uuid)
returns public.creator_application_notifications
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_row public.creator_application_notifications;
begin
  select * into v_row from public.creator_application_notifications where id = p_id for update;
  if not found or v_row.status = 'sent' or
    (v_row.status = 'sending' and v_row.sending_started_at > now() - interval '10 minutes') then
    return null;
  end if;
  update public.creator_application_notifications set
    status = 'sending', sending_started_at = now(), attempts = attempts + 1,
    updated_at = now()
    where id = p_id returning * into v_row;
  return v_row;
end;
$$;

create function public.guard_creator_hub_provisioning() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_status text;
begin
  select status into v_status from public.creator_hub_enrollments where id = new.enrollment_id;
  if v_status <> 'complete' or not public.creator_hub_required_complete(new.enrollment_id) then
    raise exception 'Creator Hub requirements must be complete before provisioning';
  end if;
  if tg_op = 'UPDATE' and (
    new.enrollment_id <> old.enrollment_id or new.tenant_id <> old.tenant_id
    or new.brand_id <> old.brand_id
    or (old.role_granted_at is not null and new.role_granted_at is distinct from old.role_granted_at)
    or (old.chat_created_at is not null and new.chat_created_at is distinct from old.chat_created_at)
    or (old.channel_id is not null and new.channel_id is distinct from old.channel_id)
  ) then
    raise exception 'Hub provisioning identity and recorded Discord effects are immutable';
  end if;
  return new;
end;
$$;
create trigger creator_hub_provisioning_guard
  before insert or update on public.creator_hub_provisioning
  for each row execute function public.guard_creator_hub_provisioning();

-- Only one worker may perform external Discord effects at a time. A crashed
-- worker can be retried after its lease expires; callers fence progress writes
-- with lease_token. Discord side effects are independently idempotent.
create function public.claim_creator_hub_provisioning(p_enrollment_id uuid)
returns public.creator_hub_provisioning
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_enrollment public.creator_hub_enrollments;
declare v_record public.creator_hub_provisioning;
begin
  select * into v_enrollment from public.creator_hub_enrollments
    where id = p_enrollment_id for update;
  if not found or v_enrollment.status <> 'complete'
    or not public.creator_hub_required_complete(p_enrollment_id) then
    raise exception 'Creator Hub requirements are incomplete';
  end if;
  insert into public.creator_hub_provisioning(enrollment_id, tenant_id, brand_id)
    values (v_enrollment.id, v_enrollment.tenant_id, v_enrollment.brand_id)
    on conflict (enrollment_id) do nothing;
  select * into v_record from public.creator_hub_provisioning
    where enrollment_id = p_enrollment_id for update;
  if v_record.lease_until is not null and v_record.lease_until > now() then
    return null;
  end if;
  update public.creator_hub_provisioning set
    lease_token = gen_random_uuid(), lease_until = now() + interval '2 minutes',
    attempt_count = attempt_count + 1, last_attempt_at = now(), updated_at = now()
    where enrollment_id = p_enrollment_id returning * into v_record;
  return v_record;
end;
$$;

-- Service-role RPC: create one complete, fixed snapshot for an approved
-- application. The function's transaction makes retries safe.
create function public.create_creator_hub_enrollment(p_application_id uuid)
returns public.creator_hub_enrollments
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_application public.creator_application_submissions;
  v_enrollment public.creator_hub_enrollments;
  v_active_count integer;
  v_required_count integer;
begin
  select * into v_application from public.creator_application_submissions
    where id = p_application_id for update;
  if not found or v_application.status <> 'approved' or v_application.discord_user_id is null then
    raise exception 'Approved application with verified Discord is required';
  end if;
  select * into v_enrollment from public.creator_hub_enrollments
    where application_id = p_application_id for update;
  if found then
    if v_enrollment.snapshot_finalized_at is null then
      raise exception 'Existing Hub enrollment has no finalized snapshot';
    end if;
    return v_enrollment;
  end if;

  perform 1 from public.creator_hub_items
    where tenant_id = v_application.tenant_id and brand_id = v_application.brand_id
      and active for share;
  select count(*), count(*) filter (where required)
    into v_active_count, v_required_count from public.creator_hub_items
    where tenant_id = v_application.tenant_id and brand_id = v_application.brand_id and active;
  if v_active_count = 0 or v_required_count = 0 then
    raise exception 'Brand Hub needs at least one required active item';
  end if;
  if exists (
    select 1 from public.creator_hub_items
    where tenant_id = v_application.tenant_id and brand_id = v_application.brand_id
      and active and current_version_id is null
  ) then
    raise exception 'Every active Hub item needs a published version';
  end if;

  insert into public.creator_hub_enrollments
    (application_id, tenant_id, brand_id, discord_user_id)
  values (p_application_id, v_application.tenant_id, v_application.brand_id,
    v_application.discord_user_id)
  on conflict (application_id) do nothing returning * into v_enrollment;
  if not found then
    select * into v_enrollment from public.creator_hub_enrollments
      where application_id = p_application_id for update;
    if v_enrollment.snapshot_finalized_at is null then
      raise exception 'Existing Hub enrollment has no finalized snapshot';
    end if;
    return v_enrollment;
  end if;

  insert into public.creator_hub_enrollment_items
    (enrollment_id, tenant_id, brand_id, item_id, item_version_id, kind, required)
  select v_enrollment.id, v_enrollment.tenant_id, v_enrollment.brand_id,
    item.id, item.current_version_id, item.kind, item.required
  from public.creator_hub_items item
  where item.tenant_id = v_enrollment.tenant_id
    and item.brand_id = v_enrollment.brand_id and item.active;
  update public.creator_hub_enrollments
    set snapshot_finalized_at = now(), updated_at = now()
    where id = v_enrollment.id returning * into v_enrollment;
  return v_enrollment;
end;
$$;

-- Approval and the frozen Hub assignment must succeed or fail together.
create function public.approve_creator_application_with_hub(
  p_submission_id uuid, p_tenant_id uuid, p_actor_id uuid,
  p_expected_status text, p_note text default null
) returns public.creator_application_submissions
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_application public.creator_application_submissions;
begin
  v_application := public.decide_creator_application(
    p_submission_id, p_tenant_id, p_actor_id, p_expected_status, 'approved', p_note
  );
  perform public.create_creator_hub_enrollment(p_submission_id);
  return v_application;
end;
$$;

-- The caller must pass the Discord ID verified in its server-side session.
-- The row lock serializes concurrent completion attempts for one enrollment.
create function public.record_creator_hub_completion(
  p_enrollment_id uuid, p_discord_user_id text,
  p_enrollment_item_id uuid, p_accept_acknowledgement boolean default false
) returns public.creator_hub_enrollments
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_enrollment public.creator_hub_enrollments;
  v_item public.creator_hub_enrollment_items;
begin
  select * into v_enrollment from public.creator_hub_enrollments
    where id = p_enrollment_id for update;
  if not found or v_enrollment.discord_user_id <> p_discord_user_id
    or v_enrollment.snapshot_finalized_at is null then
    raise exception 'Hub enrollment is unavailable for this Discord account';
  end if;
  select * into v_item from public.creator_hub_enrollment_items
    where id = p_enrollment_item_id and enrollment_id = p_enrollment_id for update;
  if not found then
    raise exception 'Hub item is not in this enrollment';
  end if;
  if (v_item.kind = 'acknowledgement') <> p_accept_acknowledgement then
    raise exception 'Acknowledgements require explicit acceptance';
  end if;
  if v_item.kind = 'acknowledgement' then
    update public.creator_hub_enrollment_items
      set accepted_at = coalesce(accepted_at, now()) where id = v_item.id;
  else
    update public.creator_hub_enrollment_items
      set completed_at = coalesce(completed_at, now()) where id = v_item.id;
  end if;
  if v_enrollment.status <> 'complete' then
    update public.creator_hub_enrollments
      set status = case when public.creator_hub_required_complete(id)
        then 'complete' else 'in_progress' end,
      completed_at = case when public.creator_hub_required_complete(id)
        then now() else null end,
      updated_at = now()
      where id = p_enrollment_id returning * into v_enrollment;
  end if;
  return v_enrollment;
end;
$$;

-- Publish a new immutable version and switch the brand item to it in one
-- transaction. The expected version prevents overwriting a concurrent edit.
create function public.publish_creator_hub_item(
  p_tenant_id uuid, p_brand_id uuid, p_item_id uuid,
  p_kind text, p_title text, p_content jsonb,
  p_required boolean, p_active boolean, p_sort_order integer,
  p_expected_version integer default null
) returns table(published_item_id uuid, published_version_id uuid, published_version integer)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_item public.creator_hub_items;
  v_version public.creator_hub_item_versions;
  v_current_version integer;
begin
  if not exists (
    select 1 from public.brands_v2
    where id = p_brand_id and tenant_id = p_tenant_id and not is_archived
  ) then
    raise exception 'Brand is unavailable';
  end if;
  if p_kind not in ('video','reading','link','acknowledgement')
    or p_title is null or length(trim(p_title)) not between 1 and 200
    or p_content is null or jsonb_typeof(p_content) <> 'object'
    or p_required is null or p_active is null or p_sort_order is null then
    raise exception 'Invalid Hub item';
  end if;

  if p_item_id is null then
    if p_expected_version is not null then
      raise exception 'New Hub item cannot have an expected version';
    end if;
    insert into public.creator_hub_items
      (tenant_id, brand_id, kind, required, active, sort_order)
    values (p_tenant_id, p_brand_id, p_kind, p_required, p_active, p_sort_order)
    returning * into v_item;
    v_current_version := 0;
  else
    select * into v_item from public.creator_hub_items
      where id = p_item_id and tenant_id = p_tenant_id and brand_id = p_brand_id
      for update;
    if not found or v_item.kind <> p_kind or v_item.current_version_id is null then
      raise exception 'Hub item is unavailable or kind changed';
    end if;
    select version into v_current_version from public.creator_hub_item_versions
      where id = v_item.current_version_id and item_id = v_item.id;
    if p_expected_version is distinct from v_current_version then
      raise exception 'Hub item version changed. Reload before publishing';
    end if;
  end if;

  insert into public.creator_hub_item_versions(item_id, version, title, content)
    values (v_item.id, v_current_version + 1, trim(p_title), p_content)
    returning * into v_version;
  update public.creator_hub_items
    set current_version_id = v_version.id, required = p_required,
        active = p_active, sort_order = p_sort_order, updated_at = now()
    where id = v_item.id;
  return query select v_item.id, v_version.id, v_version.version;
end;
$$;

alter table public.creator_hub_items enable row level security;
alter table public.creator_hub_item_versions enable row level security;
alter table public.creator_hub_enrollments enable row level security;
alter table public.creator_hub_enrollment_items enable row level security;
alter table public.creator_hub_provisioning enable row level security;
alter table public.creator_hub_discord_destinations enable row level security;
alter table public.creator_application_notifications enable row level security;
revoke all on public.creator_hub_items, public.creator_hub_item_versions,
  public.creator_hub_enrollments, public.creator_hub_enrollment_items,
  public.creator_hub_provisioning, public.creator_hub_discord_destinations,
  public.creator_application_notifications from public, anon, authenticated;
grant all on public.creator_hub_items, public.creator_hub_item_versions,
  public.creator_hub_enrollments, public.creator_hub_enrollment_items,
  public.creator_hub_provisioning, public.creator_hub_discord_destinations,
  public.creator_application_notifications to service_role;
revoke all on function public.queue_creator_application_decision_message() from public, anon, authenticated;
revoke all on function public.claim_creator_application_notification(uuid) from public, anon, authenticated;
grant execute on function public.claim_creator_application_notification(uuid) to service_role;
revoke all on public.creator_hub_pending_provisioning from public, anon, authenticated;
grant select on public.creator_hub_pending_provisioning to service_role;
revoke all on function public.creator_hub_required_complete(uuid) from public, anon, authenticated;
grant execute on function public.creator_hub_required_complete(uuid) to service_role;
revoke all on function public.claim_creator_hub_provisioning(uuid) from public, anon, authenticated;
grant execute on function public.claim_creator_hub_provisioning(uuid) to service_role;
revoke all on function public.create_creator_hub_enrollment(uuid) from public, anon, authenticated;
grant execute on function public.create_creator_hub_enrollment(uuid) to service_role;
revoke all on function public.approve_creator_application_with_hub(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.approve_creator_application_with_hub(uuid,uuid,uuid,text,text) to service_role;
revoke all on function public.record_creator_hub_completion(uuid,text,uuid,boolean) from public, anon, authenticated;
grant execute on function public.record_creator_hub_completion(uuid,text,uuid,boolean) to service_role;
revoke all on function public.publish_creator_hub_item(uuid,uuid,uuid,text,text,jsonb,boolean,boolean,integer,integer) from public, anon, authenticated;
grant execute on function public.publish_creator_hub_item(uuid,uuid,uuid,text,text,jsonb,boolean,boolean,integer,integer) to service_role;
revoke all on function public.reject_creator_hub_version_mutation() from public, anon, authenticated;
revoke all on function public.guard_creator_hub_item_kind() from public, anon, authenticated;
revoke all on function public.guard_creator_hub_enrollment() from public, anon, authenticated;
revoke all on function public.guard_creator_hub_enrollment_item() from public, anon, authenticated;
revoke all on function public.guard_creator_hub_provisioning() from public, anon, authenticated;
