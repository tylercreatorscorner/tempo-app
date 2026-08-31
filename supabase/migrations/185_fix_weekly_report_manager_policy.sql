-- The weekly-report policies could not see the assignment table.
--
-- The policy asked "is this user the accountable manager for this brand" with
-- an EXISTS over brand_manager_assignments. That subquery runs AS THE USER and
-- is therefore subject to that table's own RLS, which is is_team_member() only.
-- is_team_member() excludes 'manager' and 'coach', so a manager's lookup
-- returned no rows and the policy denied them their own brand.
--
-- Verified before this fix: Hunter (accountable for peach_slices) was blocked
-- inserting a peach_slices report. The negative cases were already correct
-- (blocked on catakor, brand clients saw nothing), so the table was closed but
-- unusable, which is the failure mode that only shows up when a real manager
-- tries to file.
--
-- Verified after: Hunter inserts peach_slices ok, is blocked on catakor, reads
-- only his own row; the Director reads every row; a brand-portal client reads
-- none.
--
-- Fix: do the lookup in a SECURITY DEFINER helper so it reads the assignment
-- table as the owner. The helper answers exactly one question and leaks
-- nothing: a boolean about the CALLER, for a brand id the caller already has.
--
-- WARNING: do not "fix" this instead by opening up brand_manager_assignments to
-- every authenticated user. `authenticated` includes 15 brand-portal clients
-- and 191 creators (see migration 178), so that would publish CC's internal
-- reporting line to its own clients.

create or replace function public.is_accountable_manager(p_brand_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select exists (
    select 1 from public.brand_manager_assignments a
    where a.brand_id = p_brand_id
      and a.manager_user_id = auth.uid()
  );
$fn$;

revoke all on function public.is_accountable_manager(uuid) from public;
grant execute on function public.is_accountable_manager(uuid) to authenticated, service_role;

drop policy if exists "read_staff_or_owner"  on public.weekly_manager_reports;
drop policy if exists "write_staff_or_owner" on public.weekly_manager_reports;

create policy "read_staff_or_owner" on public.weekly_manager_reports
  for select to authenticated
  using (is_team_member() or is_accountable_manager(brand_id));

create policy "write_staff_or_owner" on public.weekly_manager_reports
  for all to authenticated
  using (is_team_member() or is_accountable_manager(brand_id))
  with check (is_team_member() or is_accountable_manager(brand_id));

comment on function public.is_accountable_manager(uuid) is
  'Is the CALLER the accountable Brand Manager for this brand? SECURITY DEFINER because RLS policies '
  'that consult brand_manager_assignments would otherwise be evaluated as the caller, and that table '
  'is is_team_member()-gated, which excludes the very managers the policies are meant to admit.';
