-- 171 · Creator change history, Phase 1: record every edit to managed_creators.
--
-- ── Why a trigger and not application code ────────────────────────────────
--
-- roster_audit_log already existed, and it is the argument AGAINST the app-code
-- approach. It was written by application code since removed: 504 rows between
-- 2025-12-03 and 2026-01-08, then it stopped, and nobody noticed for eight
-- months. Even while running it could not answer the question it existed for —
-- of those 504 rows, changed_fields is populated 0 times, changed_by holds a
-- real user 0 times (every row is the literal string '{}'), and old_values
-- never mentions retainer once.
--
-- managed_creators is written from seven places across five route files today,
-- plus every manual repair run against the database directly. A trigger cannot
-- be forgotten when someone adds the eighth, and it sees the manual work too.
--
-- Scale it covers: 1,861 live roster rows, 536 on retainer, $578,950/month of
-- commitments, 676 rows edited in the last 30 days.
--
-- ── The actor, and its one honest limitation ──────────────────────────────
--
-- PostgREST runs each write in its own transaction as service_role, so the
-- database cannot see the application's user. The routes set
-- managed_creators.updated_by and this trigger reads it.
--
-- ⚠️ updated_by PERSISTS on the row. A write that does not set it carries the
-- previous actor forward, so a manual SQL update would be attributed to whoever
-- last edited through the UI. current_user is therefore recorded in `notes`, so
-- an app write and a hand-run repair stay distinguishable even when changed_by
-- looks plausible. Set updated_by explicitly in manual repairs.
--
-- ⚠️ Sanitises '{}' — the literal string that poisoned both updated_by (348
-- rows, including 43 of the last 30 days' edits) and roster_audit_log.changed_by.
-- It reads as a value and means nothing.
--
-- ⚠️ scope.email is safe as the actor even during "view as": middleware blocks
-- POST/PUT/PATCH/DELETE on /api/* while the platform_active_manager cookie is
-- set, so an impersonated session never reaches a write.
--
-- ── Fails closed, deliberately ────────────────────────────────────────────
-- An exception here aborts the edit. For a log covering $578,950/month of
-- retainer commitments an unaudited change is worse than a failed save, and the
-- insert is simple enough that failure means something is genuinely wrong.

-- ══ 1. Retire the unusable legacy rows ════════════════════════════════════
-- So a timeline never shows "changed by nobody, fields unknown" beside real
-- entries.
create schema if not exists repair_archive;

create table if not exists repair_archive.roster_audit_log_pre_2026_01 as
  select * from public.roster_audit_log;

delete from public.roster_audit_log;

-- ══ 2. The recorder ═══════════════════════════════════════════════════════
create or replace function public.log_managed_creator_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_old      jsonb;
  v_new      jsonb;
  v_changed  text[];
  v_action   text;
  v_actor    text;
  v_oldvals  jsonb;
  v_newvals  jsonb;
begin
  -- '{}' and '' are not actors. Treat them as unknown rather than as data.
  v_actor := nullif(nullif(btrim(coalesce(
    case when tg_op = 'DELETE' then old.updated_by else new.updated_by end, '')), '{}'), '');

  if tg_op = 'INSERT' then
    insert into public.roster_audit_log
      (managed_creator_id, action, changed_fields, old_values, new_values, changed_by, notes)
    values
      (new.id, 'create', null, null,
       to_jsonb(new) - 'updated_at' - 'created_at', v_actor, 'db_role=' || current_user);
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.roster_audit_log
      (managed_creator_id, action, changed_fields, old_values, new_values, changed_by, notes)
    values
      (old.id, 'delete', null,
       to_jsonb(old) - 'updated_at' - 'created_at', null, v_actor, 'db_role=' || current_user);
    return old;
  end if;

  -- UPDATE. Diff the two rows and keep only what actually moved.
  v_old := to_jsonb(old);
  v_new := to_jsonb(new);

  select array_agg(key order by key) into v_changed
  from jsonb_each(v_new)
  -- updated_at is set by its own trigger on every write and would appear in
  -- every diff; created_at never legitimately changes.
  where key not in ('updated_at', 'created_at')
    and (v_new -> key) is distinct from (v_old -> key);

  -- A write that changed nothing meaningful is not history. This is what keeps
  -- an idempotent re-save out of the timeline.
  if v_changed is null then
    return new;
  end if;

  -- Archiving is the roster's soft delete and reads very differently from an
  -- ordinary field edit, so it gets its own verb. Re-adding an archived creator
  -- un-archives in place, hence the reverse case.
  v_action := case
    when old.archived_at is null     and new.archived_at is not null then 'archive'
    when old.archived_at is not null and new.archived_at is null     then 'unarchive'
    else 'update'
  end;

  -- Only the changed keys. Storing whole rows would bury the one field that
  -- moved and duplicate 50 columns per edit.
  select jsonb_object_agg(k, coalesce(v_old -> k, 'null'::jsonb)) into v_oldvals from unnest(v_changed) as t(k);
  select jsonb_object_agg(k, coalesce(v_new -> k, 'null'::jsonb)) into v_newvals from unnest(v_changed) as t(k);

  insert into public.roster_audit_log
    (managed_creator_id, action, changed_fields, old_values, new_values, changed_by, notes)
  values
    (new.id, v_action, to_jsonb(v_changed), v_oldvals, v_newvals, v_actor, 'db_role=' || current_user);

  return new;
end;
$fn$;

drop trigger if exists trg_log_managed_creator_change on public.managed_creators;
create trigger trg_log_managed_creator_change
after insert or update or delete on public.managed_creators
for each row execute function public.log_managed_creator_change();

-- ══ 3. Read paths ═════════════════════════════════════════════════════════
-- One creator's timeline is the only access pattern Phase 3 needs.
create index if not exists idx_roster_audit_creator_time
  on public.roster_audit_log (managed_creator_id, changed_at desc);

-- Retainer edits are the reason this exists; find them without scanning.
create index if not exists idx_roster_audit_retainer
  on public.roster_audit_log (changed_at desc)
  where changed_fields @> '["retainer"]'::jsonb;

comment on table public.roster_audit_log is
  'Field-level change history for managed_creators, written by trg_log_managed_creator_change. '
  'changed_fields lists what moved; old_values/new_values carry ONLY those keys. changed_by comes from '
  'managed_creators.updated_by, which the routes set — it PERSISTS on the row, so a write that does not '
  'set it carries the previous actor forward; notes records the db role so app writes and hand-run '
  'repairs stay distinguishable. Rows before 2026-08-27 were written by removed application code, '
  'recorded no user and no field list, and are archived in repair_archive.roster_audit_log_pre_2026_01.';

-- ══ Verified on a scratch row, then rolled back ═══════════════════════════
--   create           -> full row snapshot, changed_by 'tyler@test'
--   retainer 1000->1500 -> changed_fields ["retainer"], old {1000}, new {1500}
--   notes edit       -> changed_fields ["notes"] only
--   no-op update     -> NO ROW WRITTEN
--   archived_at set  -> action 'archive'
