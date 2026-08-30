-- Two fixes to the creator change log.
--
-- ── 1. `notes` recorded the wrong role, so it could not do its job ────────
--
-- log_managed_creator_change is SECURITY DEFINER, which makes current_user the
-- function OWNER (postgres) for every caller. Every entry therefore read
-- "db_role=postgres", app writes and hand-run SQL alike, and migration 171's
-- claim that this kept them distinguishable was simply false. Verified: all
-- 2,319 rows said postgres, including the 81 genuine app writes.
--
-- session_user is the role that actually CONNECTED and is unaffected by
-- SECURITY DEFINER. PostgREST connects as `authenticator` before assuming
-- authenticated/service_role, so an app write and a psql/MCP write now differ.
--
-- This matters because updated_by PERSISTS on the row: a write that does not
-- set it carries the previous actor forward, and the only defence against
-- reading that as gospel is knowing whether the write came through the app.
--
-- ── 2. Migration 173's backfill left 2,238 meaningless entries ────────────
--
-- Adding cc_start_date with DEFAULT current_date stamped every existing row
-- 2026-08-29, and the backfill then set each to its added_at. That is a real column
-- change, dutifully logged 2,238 times. Every creator's timeline opened with
-- "CC start date 2026-08-29 -> <date>", which is an artifact of adding the
-- column, not history anyone needs.
--
-- ⚠️ 55 of them carried a NAMED USER, which is worse than the unattributed
-- ones: updated_by persisted from whoever last edited that creator through the
-- UI, so the log attributed this migration to real people. Deleting on
-- changed_by would have left exactly those 55 false attributions behind, so the
-- discriminator is the old VALUE instead.
--
-- Safe to identify that way because every pre-existing row held the column
-- default 2026-08-29 and nothing else could, and cc_start_date appears nowhere
-- in the app's write paths (grep: two comments, no assignment), so no UI edit
-- could produce a competing entry. Verified after: 2,238 archived, 0 left, and
-- the 81 surviving rows are exactly the genuine app writes.

-- Record the connecting role, not the definer's owner.
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
  v_name     text;
  v_brand    text;
  -- ⚠️ session_user, NOT current_user: this function is SECURITY DEFINER, so
  -- current_user is always the owner and tells you nothing about the caller.
  v_role     text := 'session_role=' || session_user;
begin
  v_actor := nullif(nullif(btrim(coalesce(
    case when tg_op = 'DELETE' then old.updated_by else new.updated_by end, '')), '{}'), '');

  if tg_op = 'INSERT' then
    insert into public.roster_audit_log
      (managed_creator_id, action, changed_fields, old_values, new_values, changed_by, notes)
    values
      (new.id, 'create', null, null,
       to_jsonb(new) - 'updated_at' - 'created_at', v_actor, v_role);

    if coalesce(new.retainer, 0) > 0 then
      v_name  := coalesce(nullif(btrim(new.real_name), ''), nullif(btrim(new.account_1), ''),
                          '(unnamed #' || new.id || ')');
      v_brand := coalesce(nullif(btrim(new.brand), ''), 'unknown');
      insert into public.retainer_history
        (creator_id, creator_name, brand, previous_retainer, new_retainer,
         change_type, effective_date, changed_by)
      values
        (new.id, v_name, v_brand, null, new.retainer, 'initial', current_date, v_actor);
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.roster_audit_log
      (managed_creator_id, action, changed_fields, old_values, new_values, changed_by, notes)
    values
      (old.id, 'delete', null,
       to_jsonb(old) - 'updated_at' - 'created_at', null, v_actor, v_role);
    return old;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);

  select array_agg(key order by key) into v_changed
  from jsonb_each(v_new)
  where key not in ('updated_at', 'created_at', 'updated_by')
    and (v_new -> key) is distinct from (v_old -> key);

  if v_changed is null then
    return new;
  end if;

  v_action := case
    when old.archived_at is null     and new.archived_at is not null then 'archive'
    when old.archived_at is not null and new.archived_at is null     then 'unarchive'
    else 'update'
  end;

  select jsonb_object_agg(k, coalesce(v_old -> k, 'null'::jsonb)) into v_oldvals from unnest(v_changed) as t(k);
  select jsonb_object_agg(k, coalesce(v_new -> k, 'null'::jsonb)) into v_newvals from unnest(v_changed) as t(k);

  insert into public.roster_audit_log
    (managed_creator_id, action, changed_fields, old_values, new_values, changed_by, notes)
  values
    (new.id, v_action, to_jsonb(v_changed), v_oldvals, v_newvals, v_actor, v_role);

  if coalesce(new.retainer, 0) is distinct from coalesce(old.retainer, 0) then
    v_name  := coalesce(nullif(btrim(new.real_name), ''), nullif(btrim(new.account_1), ''),
                        '(unnamed #' || new.id || ')');
    v_brand := coalesce(nullif(btrim(new.brand), ''), 'unknown');
    insert into public.retainer_history
      (creator_id, creator_name, brand, previous_retainer, new_retainer,
       change_type, effective_date, changed_by)
    values
      (new.id, v_name, v_brand,
       coalesce(old.retainer, 0), coalesce(new.retainer, 0),
       case
         when coalesce(new.retainer, 0) = 0                         then 'removed'
         when coalesce(new.retainer, 0) > coalesce(old.retainer, 0) then 'increase'
         else 'decrease'
       end,
       current_date, v_actor);
  end if;

  return new;
end;
$fn$;

-- Archive the backfill artifacts, then remove them from the timeline.
create table if not exists repair_archive.roster_audit_log_cc_start_backfill as
  select * from public.roster_audit_log
  where action = 'update'
    and changed_fields = '["cc_start_date"]'::jsonb
    and old_values ->> 'cc_start_date' = '2026-08-29';

delete from public.roster_audit_log
where action = 'update'
  and changed_fields = '["cc_start_date"]'::jsonb
  and old_values ->> 'cc_start_date' = '2026-08-29';

comment on table public.roster_audit_log is
  'Field-level change history for managed_creators, written by trg_log_managed_creator_change. '
  'changed_fields lists what moved; old_values/new_values carry ONLY those keys. changed_by comes from '
  'managed_creators.updated_by, which the routes set. It PERSISTS on the row, so a write that does not '
  'set it carries the previous actor forward. `notes` records session_user (the role that CONNECTED), '
  'which is how an app write is told from hand-run SQL, because current_user would be useless here: the '
  'trigger is SECURITY DEFINER and would always report its owner. Pre-2026-08-27 rows and the '
  'cc_start_date backfill are archived in repair_archive.';
