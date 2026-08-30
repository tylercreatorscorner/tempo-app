-- Close the unauthenticated read on the internal manager reports.
--
-- manager_weekly_reports and manager_monthly_reports each carried a policy
-- named "Anyone can read ..." with an unconditional qual (true) granted to
-- role public, and anon held SELECT. Reading them as anon returned manager
-- names and brand names, confirmed live before this ran.
--
-- The present exposure was nil: 2 weekly rows and 9 monthly rows of stale test
-- data from the abandoned static manager portal (last write 2026-01-07, no
-- Tempo code touches these tables). It stops being nil the moment the rebuilt
-- weekly report starts writing CLIENT HEALTH and RENEWAL RISK into them, which
-- is the whole point of the exercise. A brand could read their own manager's
-- candid assessment of them using the publishable key that ships in the
-- browser. So this is closed BEFORE anything writes to it, not after.
--
-- Also tightened: the INSERT policies were named "Authenticated can insert"
-- but were actually role public with a `with_check` of true. Only the missing
-- anon INSERT grant was stopping an anonymous write. Names should not be the
-- thing holding a table shut.
--
-- Verified after applying, by attempting the read as each role:
--   anon           denied at grant layer
--   authenticated  grant present, RLS returns 0 rows with no resolvable user
--   service_role   reads 2 rows, app path intact
--
-- WARNING: this intentionally BREAKS the legacy creators-corner-dashboards
-- manager portal, which read these tables with the anon key. That portal has
-- been write-dead since the anon sweep and unused for eight months.
--
-- WARNING: is_team_member() covers admin/owner/content_lead/analyst/payments/
-- automations/va. It does NOT cover 'manager' or 'coach', so the very people
-- who will submit these reports cannot read them under this policy. That is
-- deliberate for now (fail closed while nothing reads the tables). The manager
-- form will land its own explicit policy: a manager reads their own
-- submissions, the director reads all. Do not assume this policy is the final
-- access model.

-- anon needs nothing here at all.
revoke all on public.manager_weekly_reports  from anon;
revoke all on public.manager_monthly_reports from anon;

-- The app reaches these through server routes on service_role, which bypasses
-- RLS; these grants are what the authenticated path would need and are left
-- intact deliberately.
grant select, insert, update on public.manager_weekly_reports  to authenticated, service_role;
grant select, insert, update on public.manager_monthly_reports to authenticated, service_role;

drop policy if exists "Anyone can read manager_weekly_reports"           on public.manager_weekly_reports;
drop policy if exists "Anyone can read manager_monthly_reports"          on public.manager_monthly_reports;
drop policy if exists "Authenticated can insert manager_weekly_reports"  on public.manager_weekly_reports;
drop policy if exists "Authenticated can insert manager_monthly_reports" on public.manager_monthly_reports;

create policy "Internal staff can read manager_weekly_reports"
  on public.manager_weekly_reports for select
  to authenticated using (is_team_member());

create policy "Internal staff can read manager_monthly_reports"
  on public.manager_monthly_reports for select
  to authenticated using (is_team_member());

create policy "Internal staff can insert manager_weekly_reports"
  on public.manager_weekly_reports for insert
  to authenticated with check (is_team_member());

create policy "Internal staff can insert manager_monthly_reports"
  on public.manager_monthly_reports for insert
  to authenticated with check (is_team_member());

comment on table public.manager_weekly_reports is
  'Internal weekly manager submission, one row per manager per brand per week. '
  'NOT client-facing and must never be rendered through the public /r/[token] path: it carries the '
  'manager''s candid client-health read and renewal risk. anon has no access (closed 2026-08-30 after '
  'an unconditional "Anyone can read" policy was found live). Rows before 2026-01-08 are stale test '
  'data from the retired static manager portal.';

comment on table public.manager_monthly_reports is
  'Internal monthly manager submission. Same access rules and same caveats as manager_weekly_reports.';
