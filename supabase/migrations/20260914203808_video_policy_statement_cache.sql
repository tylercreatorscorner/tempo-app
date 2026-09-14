-- Evaluate row-independent STABLE access helpers once per statement, not per video fact.
-- Preserve every policy's predicate, command, roles, permissiveness and WITH CHECK.
-- Refuse schema drift; never replace an unreviewed policy definition.
DO $$
DECLARE
  expected record;
  original text;
  optimized text;
BEGIN
  PERFORM set_config('search_path', 'public,pg_catalog', true);
  PERFORM set_config('lock_timeout', '2s', true);
  LOCK TABLE public.daily_video_product_stats IN SHARE ROW EXCLUSIVE MODE;
  IF (SELECT count(*) FROM pg_proc WHERE oid IN (
      'public.get_tenant_id()'::regprocedure, 'public.get_user_role()'::regprocedure,
      'public.is_platform_admin()'::regprocedure, 'public.auth_user_allowed_brand_uuids()'::regprocedure
    ) AND provolatile = 's') <> 4 THEN
    RAISE EXCEPTION 'Access helpers must remain STABLE';
  END IF;
  FOR expected IN SELECT * FROM (VALUES
    ('brand_read_access', '15bf48cf8bee53df0e6fe621504f53c2'),
    ('brand_restriction', '25d572b108aa30d2f6b1d265a5d10a8e'),
    ('coach_scoped_access', 'c89ebb3bc0030a8fa0fd969bde5cc496'),
    ('internal_full_access', 'cca9ae861074b559f100d4ca9d6ebd94'),
    ('manager_scoped_access', '51ab47a4fad9fbaf8137395a2aa7e194'),
    ('platform_admin_bypass', '1dfc9b274a8b9490b1957ebf330b541c')
  ) AS policies(name, fingerprint) LOOP
    SELECT qual INTO original FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'daily_video_product_stats' AND policyname = expected.name;
    IF original IS NULL OR md5(original) <> expected.fingerprint THEN
      RAISE EXCEPTION 'Unreviewed video policy: %', expected.name;
    END IF;
    optimized := regexp_replace(original,
      '\m(get_tenant_id|get_user_role|is_platform_admin)\(\)',
      '(SELECT public.\1())', 'g');
    -- The cast makes ANY treat the scalar subquery as an array expression.
    optimized := replace(optimized, 'auth_user_allowed_brand_uuids()',
      '((SELECT public.auth_user_allowed_brand_uuids())::uuid[])');
    optimized := replace(optimized, 'auth.uid()', '(SELECT auth.uid())');
    EXECUTE format('ALTER POLICY %I ON public.daily_video_product_stats USING (%s)', expected.name, optimized);
  END LOOP;
END $$;
