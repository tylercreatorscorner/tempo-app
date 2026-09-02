-- Close the Caramela Beauty gap left open by migration 179.
--
-- 179 recorded it as a known ABSENT row rather than a placeholder: the brand
-- was on the Director's ownership list (assigned to Tino) but did not exist in
-- brands_v2 yet, so there was nothing to key an assignment to. The brand was
-- onboarded 2026-09-01 (4bf6a2d), so the row can now be written.
--
-- ⚠️ Tino is role 'coach', not 'manager', which 179 also flagged. That is NOT
-- fixed here and is deliberate: accountability for a brand and a permission
-- role are different questions, and this table is CC's reporting line rather
-- than Tempo's auth model (nothing in the auth path reads it). But the weekly
-- report's is_accountable_manager() check keys on this table, so if Tino is
-- meant to SUBMIT the weekly report for Caramela, the role needs raising
-- separately.
--
-- Lumineux is intentionally left ABSENT. It was onboarded in the same commit
-- but never appeared on the ownership list, so it has no named owner to record.
-- An absent row reads as "nobody is accountable"; a placeholder would read as
-- "somebody is", which is the more expensive lie.

do $$
declare
  v_brand uuid;
  v_mgr   uuid;
begin
  select id into v_brand from public.brands_v2
    where slug = 'caramela_beauty' and parent_brand_id is null;
  if v_brand is null then
    raise exception 'brand slug caramela_beauty not found';
  end if;

  select p.user_id into v_mgr from public.user_profiles p
    where lower(p.email) = 'tino.p@thecreatorscorner.io' limit 1;
  if v_mgr is null then
    raise exception 'manager tino.p@thecreatorscorner.io not found';
  end if;

  insert into public.brand_manager_assignments (brand_id, manager_user_id, assigned_by, notes)
  values (v_brand, v_mgr, 'tyler.creatorscorner@gmail.com',
          'From the Director of Brands ownership list, 2026-08-30. Deferred by '
          || 'migration 179 because the brand did not exist yet; written once '
          || 'Caramela Beauty was onboarded 2026-09-01.')
  on conflict (brand_id) do update
    set manager_user_id = excluded.manager_user_id,
        updated_at = now();
end $$;
