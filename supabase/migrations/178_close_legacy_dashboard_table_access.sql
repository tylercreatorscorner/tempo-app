-- Close public read AND unconditional write on the ten legacy-dashboard tables.
--
-- Found while sweeping for the same "Anyone can read" pattern fixed in 177.
-- The read was the smaller half. Several of these tables also carried write
-- policies named "Allow authenticated ..." or "Authenticated can manage ..."
-- whose actual condition was `true`, so ANY authenticated user could write.
--
-- That is not theoretical. 206 non-staff accounts hold the authenticated role
-- (15 brand-portal clients and 191 creators, all real Supabase auth users;
-- creators sign in with a custom JWT for the portal but the auth account still
-- exists). Acting as a real Cata-Kor client, is_team_member() returns false and
-- the account could still DELETE all 12 rows of product_commission_rates.
-- Verified in a rolled-back transaction before writing this, and verified
-- closed the same way afterwards (sees 0, deletes 0, service_role still 12).
--
-- Scope: all ten tables belong exclusively to the retired
-- creators-corner-dashboards app. Nothing in Tempo references any of them
-- (grep: zero hits across src/). Last writes range from 2025-12-16 to
-- 2026-01-02, and two are empty. anon already held SELECT only, so its write
-- path was closed by the earlier sweep; this closes the read and the
-- authenticated-user write.
--
-- Policies are dropped programmatically rather than by name so no permissive
-- remnant survives, then a uniform staff-only set is recreated. Tempo's own
-- access, if it ever needs these, runs through service_role, which bypasses
-- RLS entirely.
--
-- NOT covered by this migration, deliberately, because these are live systems
-- where a wrong revoke breaks something real:
--   * brand_discord_config, creator_milestones, discord_bot_settings,
--     pending_creator_links each carry a policy named service_role_all written
--     against role `public` with qual true, and anon still holds SELECT.
--     Checked: discord_bot_settings has 6 webhook URL columns but ZERO are
--     populated, so no credential is currently exposed.
--   * creator_messages has RLS switched OFF, which makes its policy inert, and
--     `authenticated` holds SELECT. A brand-portal client can read all 32 rows.
--     This table IS used by Tempo (8 files), so it needs a real policy rather
--     than a revoke.

do $$
declare
  t text;
  p record;
  tables text[] := array[
    'achievement_definitions','brand_app_settings','brand_campaigns',
    'commission_uploads','creator_commissions','manager_campaigns',
    'portal_faq','portal_resources','product_commission_rates','product_groups'
  ];
begin
  foreach t in array tables loop
    -- anon has no business with any of these.
    execute format('revoke all on public.%I from anon', t);

    -- Drop every existing policy, permissive or not, so nothing is missed.
    for p in select policyname from pg_policies
             where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;

    -- Recreate one uniform staff-only set.
    execute format(
      'create policy "staff_select" on public.%I for select to authenticated using (is_team_member())', t);
    execute format(
      'create policy "staff_insert" on public.%I for insert to authenticated with check (is_team_member())', t);
    execute format(
      'create policy "staff_update" on public.%I for update to authenticated using (is_team_member()) with check (is_team_member())', t);
    execute format(
      'create policy "staff_delete" on public.%I for delete to authenticated using (is_team_member())', t);

    -- RLS must actually be on, or the policies above are inert decoration.
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

comment on table public.product_commission_rates is
  'Legacy creators-corner-dashboards table. Staff-only as of 2026-08-30: it previously carried '
  '"Allow authenticated insert/delete" policies whose condition was literally true, which let any '
  'brand-portal client or creator account delete every row. Not referenced by Tempo.';

comment on table public.creator_commissions is
  'Legacy creators-corner-dashboards table, currently empty. Staff-only as of 2026-08-30 (same '
  'unconditional-write defect as product_commission_rates). Not referenced by Tempo.';
