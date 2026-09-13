-- Authorization fields must be changed only through validated server actions.
-- Keep SELECT and existing read policies unchanged for session/profile hydration.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.user_profiles FROM PUBLIC, anon, authenticated;

-- Column grants survive a table-level revoke. Remove those mutation paths too.
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO cols
    FROM pg_attribute WHERE attrelid = 'public.user_profiles'::regclass
      AND attnum > 0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT (%s), UPDATE (%s), REFERENCES (%s) ON TABLE public.user_profiles FROM PUBLIC, anon, authenticated', cols, cols, cols);
END $$;

-- Abort the migration if a client still has any mutation path through grants.
DO $$
DECLARE client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(client_role, 'public.user_profiles', 'INSERT,UPDATE,DELETE,TRUNCATE')
      OR has_any_column_privilege(client_role, 'public.user_profiles', 'INSERT,UPDATE') THEN
      RAISE EXCEPTION 'Profile mutation grant remains for %', client_role;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('authenticated', 'public.user_profiles', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.user_profiles', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.user_profiles', 'UPDATE')
    OR NOT has_table_privilege('service_role', 'public.user_profiles', 'DELETE') THEN
    RAISE EXCEPTION 'Required profile read or server write grant is missing';
  END IF;
END $$;
