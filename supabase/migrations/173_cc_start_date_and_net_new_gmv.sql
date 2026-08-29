-- 173 · CC start date, and net-new GMV per creator.
--
-- Some brands worked with a creator before CC did, and credit CC only with
-- revenue from content posted after the relationship began. This adds the date
-- that makes that computable, plus the two per-creator splits the monthly
-- report needs.
--
-- ⚠️ NET-NEW IS ADDITIVE, NOT A REPLACEMENT. `gmv` stays the full figure
-- everywhere; netNewGmv sits beside it as a second lens. netNewGmv + preCcGmv
-- === totalGmv, which is the cheap check that it has not been swapped in
-- somewhere by accident. Verified on jiyu: 131,731.17 + 38,355.97 = 170,087.14.
--
-- Definition settled with the operator: net-new counts GMV from videos POSTED
-- on or after cc_start_date — not GMV EARNED after it. A creator's pre-CC back
-- catalogue keeps earning, and that revenue is real; it just is not something
-- CC started.
--
-- ── cc_start_date ─────────────────────────────────────────────────────────
--
-- ⚠️ PER ROSTER ROW, not per person: a creator can join CC for one brand in
-- January and another in June, and managed_creators already carries one row per
-- (creator, brand).
--
-- ⚠️ NOT retainer_start_date — 0 of 539 populated, and its name only makes
-- sense for retained creators, while ~63% of the roster is affiliate-only and
-- still has a start date.
--
-- Backfilled from added_at. That is a row-creation date, which is why it is NOT
-- trustworthy as a signing date in general (joined_at, its sibling, has $883k
-- of GMV over 90 days predating it) — but the question here is narrower: "from
-- when should we credit ourselves", and "from when we put them in Tempo" is
-- both the operator's own definition and conservative.
--
-- Only ONE genuine bulk import exists: 2025-11-25, 384 creators, 19 on a
-- retainer. Every other add date is a batch of 48-136 — a real onboarding wave.
-- And the error runs the SAFE way: if a creator's true start predates the
-- import, videos posted in between count as pre-CC, so net-new is UNDERSTATED.
-- The opposite error cannot occur, because a video posted after we added them
-- is CC-era by definition.
--
-- DEFAULT current_date means the add flows need no change. An un-archive in
-- place does NOT reset it (an UPDATE never touches a defaulted column), which
-- is correct: a returning creator's relationship did not restart.

alter table public.managed_creators
  add column if not exists cc_start_date date default current_date;

update public.managed_creators
set cc_start_date = added_at::date
where cc_start_date is null
   or cc_start_date = current_date;

comment on column public.managed_creators.cc_start_date is
  'Date Creator''s Corner began working with this creator FOR THIS BRAND. Drives net-new GMV: revenue '
  'from videos POSTED on or after this date. Backfilled from added_at. The 2025-11-25 bulk-import '
  'cohort (384 creators, 19 on retainer) has an approximate date; the error understates net-new, which '
  'is the safe direction. Editable per creator to correct it.';

create index if not exists idx_managed_creators_cc_start
  on public.managed_creators (brand, cc_start_date);

-- ── The two per-creator splits ────────────────────────────────────────────
--
--   windowPostGmv — earned in this window FROM content posted in this window,
--                   i.e. their new work as opposed to the back catalogue.
--   netNewGmv     — earned from content posted on or after cc_start_date.
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

  if d like '%net_new_gmv%' then
    raise notice 'already wired; skipping';
    return;
  end if;

  n := length(d);
  d := replace(d,
    'mc.archived_at::date                                    as archived_on,',
    'mc.archived_at::date                                    as archived_on,' || chr(10) ||
    '           mc.cc_start_date                                        as cc_start_date,');
  if length(d) = n then raise exception 'roster CTE not matched'; end if;

  -- The join to roster is what brings cc_start_date to the fact rows:
  -- roster_facts carries creator_id and post_date but knows nothing about the
  -- contract.
  n := length(d);
  d := replace(d,
'  per_creator as (
    select creator_id,
           count(distinct video_id) filter (where post_date::date between p_start and p_end) as posts_published,
           count(distinct video_id)                                                          as videos_earning,
           sum(gmv)                                                                          as gmv,
           sum(orders)                                                                       as orders
    from roster_facts
    group by creator_id
  ),',
'  per_creator as (
    select f.creator_id,
           count(distinct f.video_id) filter (where f.post_date::date between p_start and p_end) as posts_published,
           count(distinct f.video_id)                                                            as videos_earning,
           sum(f.gmv)                                                                            as gmv,
           sum(f.orders)                                                                         as orders,
           sum(f.gmv) filter (where f.post_date::date between p_start and p_end)                 as window_post_gmv,
           -- NULL cc_start_date (a row predating the column) counts as net-new
           -- rather than silently dropping the creator''s revenue.
           sum(f.gmv) filter (where r.cc_start_date is null
                                 or f.post_date::date >= r.cc_start_date)                        as net_new_gmv
    from roster_facts f
    join roster r on r.id = f.creator_id
    group by f.creator_id
  ),');
  if length(d) = n then raise exception 'per_creator CTE not matched'; end if;

  n := length(d);
  d := replace(d,
    '               ''gmv'',            coalesce(pc.gmv, 0),',
    '               ''gmv'',            coalesce(pc.gmv, 0),' || chr(10) ||
    '               ''windowPostGmv'',  coalesce(pc.window_post_gmv, 0),' || chr(10) ||
    '               ''netNewGmv'',      coalesce(pc.net_new_gmv, 0),' || chr(10) ||
    '               ''ccStartDate'',    r.cc_start_date,');
  if length(d) = n then raise exception 'creators output not matched'; end if;

  n := length(d);
  d := replace(d,
    '''creators'', coalesce((',
    '''netNew'', (' || chr(10) ||
    '      select jsonb_build_object(' || chr(10) ||
    '        ''netNewGmv'',  coalesce(sum(pc.net_new_gmv), 0),' || chr(10) ||
    '        ''preCcGmv'',   coalesce(sum(pc.gmv) - sum(pc.net_new_gmv), 0),' || chr(10) ||
    '        ''totalGmv'',   coalesce(sum(pc.gmv), 0)' || chr(10) ||
    '      ) from per_creator pc' || chr(10) ||
    '    ),' || chr(10) || chr(10) ||
    '    ''creators'', coalesce((');
  if length(d) = n then raise exception 'netNew block not matched'; end if;

  execute d;
end
$do$;

-- Verified on jiyu 2026-08-01..26: roster $170,087.14, net-new $131,731.17
-- (77.4%), pre-CC $38,355.97, and the two halves sum to the whole exactly.
-- Per creator: Lissandro (cc_start 2026-07-09) shows pre-CC $0.00 — everything
-- he earned came from content posted after he joined, which is the check that
-- the date gating actually bites. godigitalwithdee posted 35 against a quota of
-- 30 yet only $4,005 of $8,231 is net-new, which is the kind of thing the
-- brand-level total cannot show.
