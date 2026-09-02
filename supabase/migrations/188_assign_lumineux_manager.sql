-- Lumineux accountability, mirroring the Director's UI assignment.
--
-- ⚠️ THE UI AND THIS TABLE ARE NOT THE SAME ASSIGNMENT. Assigning a brand
-- owner in the app writes `user_brand_access`, which answers "who may SEE this
-- brand" and is many-to-many (catakor has six). `brand_manager_assignments`
-- answers "who is accountable", has exactly one answer, and is what
-- is_accountable_manager() and the weekly scorecard read.
--
-- So a brand can look assigned in the UI and still be absent from the weekly
-- report's ownership. That happened here: Lumineux was assigned to Andrew in
-- the UI on 2026-09-02 and had no accountability row at all. This writes it.
--
-- The real fix is for the assignment UI to write both, or for one to derive
-- from the other. Until then the two drift silently and every new brand
-- repeats this.

do $$
declare
  v_brand uuid;
  v_mgr   uuid;
begin
  select id into v_brand from public.brands_v2
    where slug = 'lumineux' and parent_brand_id is null;
  if v_brand is null then
    raise exception 'brand slug lumineux not found';
  end if;

  select p.user_id into v_mgr from public.user_profiles p
    where lower(p.email) = 'andrew.a@thecreatorscorner.io' limit 1;
  if v_mgr is null then
    raise exception 'manager andrew.a@thecreatorscorner.io not found';
  end if;

  insert into public.brand_manager_assignments (brand_id, manager_user_id, assigned_by, notes)
  values (v_brand, v_mgr, 'tyler.creatorscorner@gmail.com',
          'Director assigned Lumineux to Andrew in the UI 2026-09-02, which '
          || 'writes user_brand_access only. Mirrored here because the weekly '
          || 'report and scorecard read accountability from THIS table.')
  on conflict (brand_id) do update
    set manager_user_id = excluded.manager_user_id,
        updated_at = now();
end $$;
