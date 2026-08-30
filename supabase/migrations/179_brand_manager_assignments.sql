-- One accountable Brand Manager per brand.
--
-- WHY THIS IS NOT user_brand_access. That table answers "who may SEE this
-- brand" and is deliberately many-to-many: catakor currently has seven people
-- with access. Accountability is a different question with exactly one answer,
-- and it is the question the weekly report depends on ("whose submission is
-- missing"). Deriving one from the other is impossible, so it gets its own
-- table rather than a flag bolted onto the access grant.
--
-- Kept as a SEPARATE table for the ownership question still open with the Head
-- of Agency: this is CC's reporting line, not Tempo's permission model, and a
-- separate table detaches cleanly. Nothing in Tempo's auth path reads it.
--
-- NOT effective-dated, deliberately. Each weekly submission will record its own
-- submitting manager, so history lives where it is actually needed; this table
-- only ever answers "who is accountable now". Adding history here would
-- duplicate that and invite the two to disagree.
--
-- Seeded 2026-08-30 from the Director's list. Known gaps at seed time, left as
-- ABSENT rows rather than placeholders:
--   * Physicians Choice ($1,628,420 July) and Kitsch ($886,211 July) had no
--     owner on the list. That is $2.5M of July GMV with nobody accountable.
--   * Caramela Beauty (assigned to Tino) does not exist in brands_v2, in
--     creator_performance, or in managed_creators. It needs onboarding before
--     it can be assigned or scored.
--   * Tino is role 'coach', not 'manager'.
--   * Tyler has four accounts. tyler.creatorscorner@gmail.com (owner, signed in
--     2026-08-29) was chosen over tyler.d@thecreatorscorner.io (manager, last
--     signed in 2026-05-18). One UPDATE flips it.
--   * kyle.e@thecreatorscorner.io has NEVER signed in, and owns Neurogum.

create table if not exists public.brand_manager_assignments (
  id              uuid primary key default gen_random_uuid(),
  -- One row per brand is the whole point of the table.
  brand_id        uuid not null unique references public.brands_v2(id) on delete cascade,
  manager_user_id uuid not null references auth.users(id) on delete restrict,
  assigned_at     timestamptz not null default now(),
  assigned_by     text,
  notes           text,
  updated_at      timestamptz not null default now()
);

create index if not exists idx_bma_manager on public.brand_manager_assignments(manager_user_id);

alter table public.brand_manager_assignments enable row level security;

-- Staff-only, and written the way 177/178 established: named roles, real
-- conditions, no policy whose name does the gating.
drop policy if exists "staff_select" on public.brand_manager_assignments;
drop policy if exists "staff_write"  on public.brand_manager_assignments;

create policy "staff_select" on public.brand_manager_assignments
  for select to authenticated using (is_team_member());
create policy "staff_write" on public.brand_manager_assignments
  for all to authenticated using (is_team_member()) with check (is_team_member());

revoke all on public.brand_manager_assignments from anon;
grant select, insert, update, delete on public.brand_manager_assignments to authenticated, service_role;

-- Fails loudly on any unresolved name rather than inserting a null or silently
-- skipping: a missing assignment must be visible, not absorbed.
do $$
declare
  v_brand uuid;
  v_mgr   uuid;
  pairs   text[][] := array[
    ['neurogum',          'kyle.e@thecreatorscorner.io'],
    ['serene_herbs',      'andrew.a@thecreatorscorner.io'],
    ['forchics',          'amarisa.m@thecreatorscorner.io'],
    ['dr_dent',           'tyler.creatorscorner@gmail.com'],
    ['peach_slices',      'hunter.u@thecreatorscorner.io'],
    ['catakor',           'tyler.creatorscorner@gmail.com'],
    ['jiyu',              'tyler.creatorscorner@gmail.com'],
    ['leefar',            'tyler.creatorscorner@gmail.com'],
    ['lemme',             'tyler.creatorscorner@gmail.com'],
    ['keeps',             'jared.s@thecreatorscorner.io'],
    ['m3',                'tyler.creatorscorner@gmail.com'],
    ['bondie',            'tyler.creatorscorner@gmail.com']
  ];
begin
  for i in 1 .. array_length(pairs, 1) loop
    select id into v_brand from public.brands_v2
      where slug = pairs[i][1] and parent_brand_id is null;
    if v_brand is null then
      raise exception 'brand slug % not found', pairs[i][1];
    end if;

    select p.user_id into v_mgr from public.user_profiles p
      where lower(p.email) = lower(pairs[i][2]) limit 1;
    if v_mgr is null then
      raise exception 'manager % not found', pairs[i][2];
    end if;

    insert into public.brand_manager_assignments (brand_id, manager_user_id, assigned_by, notes)
    values (v_brand, v_mgr, 'tyler.creatorscorner@gmail.com',
            'Seeded from the Director of Brands ownership list, 2026-08-30.')
    on conflict (brand_id) do update
      set manager_user_id = excluded.manager_user_id,
          updated_at = now();
  end loop;
end $$;

comment on table public.brand_manager_assignments is
  'The accountable Brand Manager for each brand, one row per brand. This is ACCOUNTABILITY, not '
  'access: user_brand_access answers who may see a brand and is many-to-many (catakor has 7). The '
  'weekly manager report keys off this table to know whose submission is missing. Not effective-dated '
  'on purpose, because each submission records its own submitting manager. Unassigned brands are '
  'represented by the ABSENCE of a row, never by a placeholder.';
