-- Deploy the guarded creator-report callers before applying this migration.
-- Include historical overloads so stale signatures cannot bypass the boundary.
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN SELECT p.oid, p.oid::regprocedure::text AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN
      ('get_creator_engagement', 'get_creator_top_content', 'whos_cooking_agg', 'whos_cooking_agg_v2')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.signature);
    IF has_function_privilege('anon', fn.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', fn.oid, 'EXECUTE')
      OR NOT has_function_privilege('service_role', fn.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Unexpected reporting grant for %', fn.signature;
    END IF;
  END LOOP;
END $$;
