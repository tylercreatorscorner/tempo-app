-- The internal weekly manager report. One row per brand per week.
--
-- NOT the client report, and deliberately not sharing anything with it. The
-- client report is persuasive and leads with wins; this exists to surface
-- problems early, and two of its fields (client health, renewal risk) never
-- appear in front of a client at all. Merging them produces sanitised versions
-- of both. It is also on a FIXED weekly cadence so rows are comparable, while
-- client reports go out per brand on their own schedules.
--
-- WARNING: it must never be rendered through the public /r/[token] path.
--
-- WHY NOT manager_weekly_reports. That legacy table exists and covers roughly
-- seven of these fields, but it is keyed on manager_discord_id rather than a
-- user, its brand is a free-text campaign_name rather than a real brand, and it
-- carries gmv_cc_creators and gmv_total_affiliate as MANAGER-TYPED numbers,
-- which is precisely the hand entry this replaces. It is dead (11 rows, last
-- written 2026-01-07) and is left in place as history rather than reshaped.
--
-- COMPUTED VS TYPED. GMV, managed GMV, capture rate and content volume are
-- never typed. They come from get_brand_week_metrics and are shown read-only.
-- Capture rate especially: it is the metric the whole system rests on and the
-- one most easily got wrong by hand.
--
-- WARNING: WHY THE SNAPSHOT COLUMNS EXIST. Managed GMV for a PAST week changes
-- when creators are added to the roster later, because membership does not gate
-- on added_at (migration 180 explains why it must not). Recomputing July today
-- vs what it would have said at the time moved Forchics from $0 to $112,490 and
-- Peach Slices by +151%. So a grade is not stable over time. Each submission
-- freezes the figures it was graded on; the live figure can be recomputed
-- alongside, and a divergence between them is itself the signal that a roster
-- backfill happened. Never overwrite a snapshot on edit.
--
-- NOTE: the policies created here were WRONG and are replaced in migration 185.
-- They consulted brand_manager_assignments from inside a policy, which is
-- evaluated as the caller and therefore subject to that table's own RLS, so
-- managers were denied their own brands. Kept in sequence rather than edited so
-- the history matches what production actually ran.

create table if not exists public.weekly_manager_reports (
  id                uuid primary key default gen_random_uuid(),
  brand_id          uuid not null references public.brands_v2(id) on delete cascade,
  -- The Sunday the week ends on. Fixed day so rows line up week to week.
  week_ending       date not null,

  submitted_by      uuid references auth.users(id) on delete set null,
  submitted_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- ── Typed by the manager ────────────────────────────────────────────
  creators_recruited   integer,
  biggest_win          text,
  biggest_challenge    text,
  next_action          text,
  next_action_due      date,
  -- green / yellow / red plus the manager's own words. The words are the point:
  -- a colour alone tells the Director nothing they cannot already see.
  client_health        text check (client_health in ('green','yellow','red')),
  client_health_note   text,
  renewal_risk         text check (renewal_risk in ('none','watch','at_risk')),
  renewal_note         text,
  contract_ends_on     date,

  -- ── Frozen at submit. Computed, never typed. See the note above. ────
  snap_brand_gmv          numeric,
  snap_managed_gmv        numeric,
  snap_capture_pct        numeric,
  snap_posts              integer,
  snap_prior_brand_gmv    numeric,
  snap_prior_managed_gmv  numeric,
  snap_prior_capture_pct  numeric,
  -- How many of the week's 7 days actually had data when this was submitted.
  -- A week graded on 4 days is not comparable to one graded on 7, and the form
  -- says so rather than quietly reporting a short number.
  snap_days_covered       integer,
  snap_taken_at           timestamptz,

  -- One report per brand per week is the whole point.
  unique (brand_id, week_ending)
);

create index if not exists idx_wmr_week on public.weekly_manager_reports(week_ending desc);
create index if not exists idx_wmr_submitter on public.weekly_manager_reports(submitted_by);

alter table public.weekly_manager_reports enable row level security;

drop policy if exists "read_staff_or_owner"  on public.weekly_manager_reports;
drop policy if exists "write_staff_or_owner" on public.weekly_manager_reports;

-- is_team_member() covers admin/owner but NOT 'manager' or 'coach', and the
-- managers are the people who have to write these. So the policy also admits
-- the accountable manager for that brand, and nobody else.
create policy "read_staff_or_owner" on public.weekly_manager_reports
  for select to authenticated
  using (
    is_team_member()
    or exists (
      select 1 from public.brand_manager_assignments a
      where a.brand_id = weekly_manager_reports.brand_id
        and a.manager_user_id = auth.uid()
    )
  );

create policy "write_staff_or_owner" on public.weekly_manager_reports
  for all to authenticated
  using (
    is_team_member()
    or exists (
      select 1 from public.brand_manager_assignments a
      where a.brand_id = weekly_manager_reports.brand_id
        and a.manager_user_id = auth.uid()
    )
  )
  with check (
    is_team_member()
    or exists (
      select 1 from public.brand_manager_assignments a
      where a.brand_id = weekly_manager_reports.brand_id
        and a.manager_user_id = auth.uid()
    )
  );

revoke all on public.weekly_manager_reports from anon;
grant select, insert, update on public.weekly_manager_reports to authenticated, service_role;

comment on table public.weekly_manager_reports is
  'Internal weekly manager report, one row per brand per week. NOT client-facing: carries the '
  'manager''s candid client-health read and renewal risk, and must never render through /r/[token]. '
  'GMV, managed GMV, capture rate and posts are COMPUTED (get_brand_week_metrics), never typed. The '
  'snap_* columns freeze what the row was graded on, because managed GMV for a past week changes when '
  'creators are added to the roster later. Never overwrite a snapshot on edit.';
