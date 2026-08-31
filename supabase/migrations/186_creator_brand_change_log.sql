-- Field-level change history for creator_brands.
--
-- WHY. creator_brands holds one row per creator PER BRAND (role, status,
-- retainer, post requirement). An edit route wrote to it filtered on creator_id
-- alone, so every brand a creator worked was overwritten with one value, for
-- roughly six months. When it came to repairing the damage, THERE WAS NO
-- EVIDENCE: no audit trail, and updated_at is never bumped because the table has
-- no trigger and no writer sets it. The damaged rows could not be identified,
-- only guessed at. This is that gap closed.
--
-- Mirrors trg_log_managed_creator_change on managed_creators, with the two
-- corrections that table needed later:
--   * `notes` records session_user, NOT current_user. This function is SECURITY
--     DEFINER, so current_user is always the owner and says nothing about the
--     caller (migration 176). PostgREST connects as `authenticator`; hand-run
--     SQL as `postgres`.
--   * updated_at is now actually maintained, by a BEFORE trigger, so the column
--     that failed to catch this bug can catch the next one.
--
-- Verified on a creator working 8 brands, in a rolled-back transaction:
--   no-op update across all rows  -> 0 log entries
--   unscoped write (8 rows)       -> 8 log entries, one per brand
--   entry captured: fields ["role"], from {"role": null} to {"role":"ZZ-TEST"}
--   rows where updated_at > created_at: 8 (previously always 0)
--
-- WARNING: updated_by PERSISTS on the row, exactly as it does on
-- managed_creators. A write that does not set it carries the previous actor
-- forward, so a manual SQL repair is attributed to whoever last edited through
-- the UI. SET IT in manual repairs, and read `notes` to tell an app write from a
-- hand-run one.
--
-- WARNING: A BULK IMPORT WILL BE LOGGED, one row per record. The roster backfill
-- in migration 173 produced 2,238 meaningless entries this way and had to be
-- archived out. Before running a bulk write here, decide whether it should be
-- logged and plan the archive criteria FIRST, while the rows are still
-- distinguishable from real edits.

alter table public.creator_brands
  add column if not exists updated_by text;

comment on column public.creator_brands.updated_by is
  'Email of whoever last wrote this row, stamped by the API routes. PERSISTS: a write that does not '
  'set it carries the previous actor forward, so set it explicitly in manual repairs.';

create table if not exists public.creator_brand_audit_log (
  id               bigserial primary key,
  creator_brand_id uuid,
  -- Denormalised so the log survives the row being deleted, and so "what
  -- happened to this creator on this brand" is answerable without a join.
  creator_id       uuid,
  brand_id         uuid,
  action           text not null,
  changed_fields   jsonb,
  old_values       jsonb,
  new_values       jsonb,
  changed_by       text,
  notes            text,
  changed_at       timestamptz not null default now()
);

create index if not exists idx_cbal_creator on public.creator_brand_audit_log(creator_id, changed_at desc);
create index if not exists idx_cbal_brand   on public.creator_brand_audit_log(brand_id, changed_at desc);
create index if not exists idx_cbal_row     on public.creator_brand_audit_log(creator_brand_id, changed_at desc);

alter table public.creator_brand_audit_log enable row level security;

drop policy if exists "staff_read" on public.creator_brand_audit_log;
create policy "staff_read" on public.creator_brand_audit_log
  for select to authenticated using (is_team_member());

revoke all on public.creator_brand_audit_log from anon;
grant select on public.creator_brand_audit_log to authenticated;
grant select, insert on public.creator_brand_audit_log to service_role;
grant usage, select on sequence public.creator_brand_audit_log_id_seq to service_role;

-- ── updated_at, finally maintained ──────────────────────────────────────
create or replace function public.touch_creator_brands_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists trg_touch_creator_brands on public.creator_brands;
create trigger trg_touch_creator_brands
  before update on public.creator_brands
  for each row execute function public.touch_creator_brands_updated_at();

-- ── The log itself ──────────────────────────────────────────────────────
create or replace function public.log_creator_brand_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_old     jsonb;
  v_new     jsonb;
  v_changed text[];
  v_actor   text;
  v_oldvals jsonb;
  v_newvals jsonb;
  -- session_user, NOT current_user: see the header note.
  v_role    text := 'session_role=' || session_user;
begin
  -- '{}' has poisoned actor columns elsewhere in this schema; treat it as null.
  v_actor := nullif(nullif(btrim(coalesce(
    case when tg_op = 'DELETE' then old.updated_by else new.updated_by end, '')), '{}'), '');

  if tg_op = 'INSERT' then
    insert into public.creator_brand_audit_log
      (creator_brand_id, creator_id, brand_id, action, changed_fields,
       old_values, new_values, changed_by, notes)
    values
      (new.id, new.creator_id, new.brand_id, 'create', null, null,
       to_jsonb(new) - 'updated_at' - 'created_at', v_actor, v_role);
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.creator_brand_audit_log
      (creator_brand_id, creator_id, brand_id, action, changed_fields,
       old_values, new_values, changed_by, notes)
    values
      (old.id, old.creator_id, old.brand_id, 'delete', null,
       to_jsonb(old) - 'updated_at' - 'created_at', null, v_actor, v_role);
    return old;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);

  -- Record only what MOVED. updated_at is excluded because the BEFORE trigger
  -- above sets it on every write, and updated_by because it is captured as
  -- changed_by; including either would make every edit look like it touched a
  -- field nobody edited.
  select array_agg(key order by key) into v_changed
  from jsonb_each(v_new)
  where key not in ('updated_at', 'created_at', 'updated_by')
    and (v_new -> key) is distinct from (v_old -> key);

  -- A no-op update writes NO row, so idempotent re-saves stay out of history.
  if v_changed is null then
    return new;
  end if;

  select jsonb_object_agg(k, coalesce(v_old -> k, 'null'::jsonb)) into v_oldvals from unnest(v_changed) as t(k);
  select jsonb_object_agg(k, coalesce(v_new -> k, 'null'::jsonb)) into v_newvals from unnest(v_changed) as t(k);

  insert into public.creator_brand_audit_log
    (creator_brand_id, creator_id, brand_id, action, changed_fields,
     old_values, new_values, changed_by, notes)
  values
    (new.id, new.creator_id, new.brand_id, 'update', to_jsonb(v_changed),
     v_oldvals, v_newvals, v_actor, v_role);

  return new;
end;
$fn$;

drop trigger if exists trg_log_creator_brand_change on public.creator_brands;
create trigger trg_log_creator_brand_change
  after insert or update or delete on public.creator_brands
  for each row execute function public.log_creator_brand_change();

comment on table public.creator_brand_audit_log is
  'Field-level change history for creator_brands (one row per creator per brand), written by '
  'trg_log_creator_brand_change. Exists because a six-month cross-brand overwrite could not be '
  'repaired: there was no audit trail and updated_at was never bumped. changed_fields lists what '
  'moved; old_values/new_values carry ONLY those keys. changed_by comes from creator_brands.updated_by, '
  'which PERSISTS on the row. `notes` records session_user, which is how an app write is told from '
  'hand-run SQL.';
