-- 172 · Creator change history, Phase 2: make the retainer answerable AS OF a date.
--
-- Phase 1 (mig 171) answers "who changed it". This answers "what WAS it on
-- July 15", which is a different question and the one that reaches clients:
-- get_brand_client_report_granular read coalesce(mc.retainer, 0) — the CURRENT
-- value — for whatever historical window it was asked for. A July report
-- generated today showed today's retainers, and the 14 reports refreshed on
-- 2026-08-27 recomputed their retainer budgets at today's values.
--
-- ── The honesty problem, and how it is handled ────────────────────────────
--
-- There is no history before today and no trustworthy way to invent one:
--   retainer_start_date   0 of 539 populated
--   added_at / joined_at  539 of 539, but both are ROW-CREATION dates.
--                         joined_at famously records data entry rather than
--                         signing ($883k of GMV over 90 days predates the
--                         joined_at of the creator who earned it), and added_at
--                         is the bulk-import date.
--
-- So baseline rows are dated TODAY, because today is genuinely when the value
-- was first observed. Back-dating to added_at would assert a fact we do not
-- have.
--
-- get_retainer_as_of therefore returns is_exact:
--   true  — a record covers that date
--   false — the date predates our history, so the earliest observed value has
--           been carried backwards
--
-- ⚠️ Callers MUST surface is_exact = false rather than present a carried-back
-- value as a measurement. That flag is the entire difference from the previous
-- behaviour, which carried today's value backwards with no indication at all.
--
-- ⚠️ retainer_history.creator_id holds managed_creators.ID (the integer roster
-- row), NOT managed_creators.creator_id (the creators_v2 uuid). The column name
-- predates that distinction and there is no FK to disambiguate it.
--
-- ⚠️ creator_name and brand are NOT NULL on retainer_history and the source can
-- be null on both — ~9% of active creators carry no real_name, from a
-- 2025-11-29 bulk import that never captured them. Hence the coalesce chains: a
-- missing name must never block a retainer change from being recorded. The
-- first attempt at this migration failed on exactly that constraint.
--
-- ── Verified ──────────────────────────────────────────────────────────────
--   baseline        539 rows, $579,850.00, equal to the live roster total
--   change recorded increase: 500.00 -> 1250.00
--   as of today     1250.00  is_exact = true
--   as of 07-15     500.00   is_exact = false   (pre-change value, flagged)
--
-- The read-path change is a NO-OP TODAY and that is the point: every creator has
-- exactly one history row, so the report returns the same number the old code
-- did for every window. Confirmed identical across catakor, jiyu, lemme,
-- dr_dent and serene_herbs. Behaviour only diverges once a retainer changes,
-- which is the safest way to ship a change to a money read path.

-- ══ 1. Record retainer changes as they happen ═════════════════════════════
-- Extends the Phase 1 trigger. The generic log still records the field diff;
-- this adds an effective-dated row, because "what was it on date D" needs a
-- value to look up, not a diff to replay.
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
begin
  v_actor := nullif(nullif(btrim(coalesce(
    case when tg_op = 'DELETE' then old.updated_by else new.updated_by end, '')), '{}'), '');

  if tg_op = 'INSERT' then
    insert into public.roster_audit_log
      (managed_creator_id, action, changed_fields, old_values, new_values, changed_by, notes)
    values
      (new.id, 'create', null, null,
       to_jsonb(new) - 'updated_at' - 'created_at', v_actor, 'db_role=' || current_user);

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
       to_jsonb(old) - 'updated_at' - 'created_at', null, v_actor, 'db_role=' || current_user);
    return old;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);

  select array_agg(key order by key) into v_changed
  from jsonb_each(v_new)
  where key not in ('updated_at', 'created_at')
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
    (new.id, v_action, to_jsonb(v_changed), v_oldvals, v_newvals, v_actor, 'db_role=' || current_user);

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

-- ══ 2. Seed the baseline ══════════════════════════════════════════════════
insert into public.retainer_history
  (creator_id, creator_name, brand, previous_retainer, new_retainer,
   change_type, change_reason, effective_date, changed_by)
select mc.id,
       coalesce(nullif(btrim(mc.real_name), ''), nullif(btrim(mc.account_1), ''),
                '(unnamed #' || mc.id || ')'),
       coalesce(nullif(btrim(mc.brand), ''), 'unknown'),
       null, mc.retainer,
       'baseline',
       'Value observed when retainer history began; the date it actually took effect is unknown.',
       current_date, null
from public.managed_creators mc
where mc.archived_at is null
  and coalesce(mc.retainer, 0) > 0
  and not exists (select 1 from public.retainer_history rh where rh.creator_id = mc.id);

-- ══ 3. Read it back as of a date ══════════════════════════════════════════
create or replace function public.get_retainer_as_of(
  p_ids   integer[],
  p_as_of date
)
returns table(
  managed_creator_id integer,
  retainer           numeric,
  is_exact           boolean
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with ranked as (
    -- Newest record already in effect on p_as_of.
    select rh.creator_id, rh.new_retainer,
           row_number() over (partition by rh.creator_id
                              order by rh.effective_date desc, rh.id desc) as rn
    from public.retainer_history rh
    where rh.creator_id = any(p_ids) and rh.effective_date <= p_as_of
  ),
  earliest as (
    -- Fallback for dates predating our history. Carried backwards and FLAGGED,
    -- never presented as a measurement.
    select rh.creator_id, rh.new_retainer,
           row_number() over (partition by rh.creator_id
                              order by rh.effective_date asc, rh.id asc) as rn
    from public.retainer_history rh
    where rh.creator_id = any(p_ids)
  )
  select ids.id,
         coalesce(a.new_retainer, e.new_retainer, 0)::numeric,
         (a.new_retainer is not null) as is_exact
  from unnest(p_ids) as ids(id)
  left join ranked   a on a.creator_id = ids.id and a.rn = 1
  left join earliest e on e.creator_id = ids.id and e.rn = 1;
$function$;

revoke execute on function public.get_retainer_as_of(integer[], date) from public;
revoke execute on function public.get_retainer_as_of(integer[], date) from anon;
grant  execute on function public.get_retainer_as_of(integer[], date) to authenticated, service_role;

create index if not exists idx_retainer_history_creator_date
  on public.retainer_history (creator_id, effective_date desc, id desc);

comment on function public.get_retainer_as_of(integer[], date) is
  'Retainer in effect on a given date, keyed by managed_creators.id. is_exact=false means the date '
  'predates our history and the earliest observed value has been carried backwards — surface that, never '
  'present it as a measurement. History begins 2026-08-27.';

comment on table public.retainer_history is
  'Effective-dated retainer values. creator_id is managed_creators.ID (the integer roster row), NOT the '
  'creators_v2 uuid — the column name predates that distinction and there is no FK. Written by '
  'trg_log_managed_creator_change. change_type ''baseline'' rows were observed on 2026-08-27 when history '
  'began; their true effective date is unknown.';

-- ══ 4. Point the client report at it ══════════════════════════════════════
-- The roster CTE feeds BOTH the per-creator rows and monthlyRetainerBudget, so
-- one change fixes both. As of p_END: a monthly retainer is never apportioned
-- across a window, so the period needs ONE value, and the one a client
-- recognises is what they were on at the close of it.
--
-- Applied by transforming the live definition rather than restating 200 lines,
-- so nothing else in the function can drift by transcription.
do $do$
declare
  d text;
  n int;
begin
  select pg_get_functiondef(p.oid) into strict d
  from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
  where n2.nspname = 'public' and p.proname = 'get_brand_client_report_granular' and p.prokind = 'f';

  if d like '%get_retainer_as_of%' then
    raise notice 'already wired to retainer history; skipping';
    return;
  end if;

  n := length(d);
  d := replace(d,
    'coalesce(mc.retainer, 0)::numeric                       as retainer,',
    'coalesce(rasof.retainer, 0)::numeric                    as retainer,' || chr(10) ||
    '           coalesce(rasof.is_exact, true)                          as retainer_exact,');
  if length(d) = n then raise exception 'retainer select not matched'; end if;

  -- Quota applies only to creators who were ON a retainer in that window.
  n := length(d);
  d := replace(d,
    'case when coalesce(mc.retainer, 0) > 0',
    'case when coalesce(rasof.retainer, 0) > 0');
  if length(d) = n then raise exception 'quota gate not matched'; end if;

  n := length(d);
  d := replace(d,
    'from public.managed_creators mc',
    'from public.managed_creators mc' || chr(10) ||
    '    left join lateral public.get_retainer_as_of(array[mc.id], p_end) rasof on true');
  if length(d) = n then raise exception 'from clause not matched'; end if;

  -- ⚠️ FILTERED to retained creators. Unfiltered, affiliate-only creators —
  -- who correctly have no retainer_history row — voted is_exact=false and
  -- forced the flag false on every window, including ones fully covered by
  -- history. On catakor that was 381 of 435 creators voting about a figure they
  -- do not contribute to. The flag qualifies monthlyRetainerBudget, so it must
  -- be computed over exactly the creators that sum into it.
  n := length(d);
  d := replace(d,
    '''monthlyRetainerBudget'', coalesce(sum(retainer), 0)',
    '''monthlyRetainerBudget'', coalesce(sum(retainer), 0),' || chr(10) ||
    '        ''retainerHistoryExact'',  coalesce(bool_and(retainer_exact) filter (where retainer > 0), true)');
  if length(d) = n then raise exception 'budget block not matched'; end if;

  execute d;
end
$do$;

-- Verified after: window 08-01..08-22 (before history) -> exact=false;
-- window 08-21..08-27 (covers baseline) -> exact=true; budget $63,150.00 in
-- BOTH, and equal to the live managed_creators sum on all five brands tested.
