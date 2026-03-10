-- Ensure RLS is enabled on user_profiles and tenants
-- Users should be able to read their own profile and their own tenant

-- user_profiles: users can read/update their own profile
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'users_read_own_profile') THEN
    CREATE POLICY users_read_own_profile ON user_profiles FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_profiles' AND policyname = 'users_update_own_profile') THEN
    CREATE POLICY users_update_own_profile ON user_profiles FOR UPDATE USING (user_id = auth.uid());
  END IF;
END $$;

-- tenants: users can read their own tenant (via user_profiles lookup)
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenants' AND policyname = 'users_read_own_tenant') THEN
    CREATE POLICY users_read_own_tenant ON tenants FOR SELECT USING (
      id IN (SELECT tenant_id FROM user_profiles WHERE user_id = auth.uid())
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenants' AND policyname = 'users_update_own_tenant') THEN
    CREATE POLICY users_update_own_tenant ON tenants FOR UPDATE USING (
      id IN (SELECT tenant_id FROM user_profiles WHERE user_id = auth.uid())
    );
  END IF;
END $$;
