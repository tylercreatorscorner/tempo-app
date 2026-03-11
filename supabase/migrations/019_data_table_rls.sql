-- RLS for all data tables using public.get_tenant_id()
-- Function created: public.get_tenant_id() returns tenant_id for current auth user

CREATE OR REPLACE FUNCTION public.get_tenant_id() RETURNS uuid AS $$
  SELECT tenant_id FROM public.user_profiles WHERE user_id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- brands_v2
ALTER TABLE brands_v2 ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_isolation_brands ON brands_v2
    FOR ALL USING (tenant_id = public.get_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- creators_v2
ALTER TABLE creators_v2 ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_iso_creators ON creators_v2
    FOR ALL USING (tenant_id = public.get_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- creator_brands
ALTER TABLE creator_brands ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_iso_creator_brands ON creator_brands
    FOR ALL USING (tenant_id = public.get_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- tiktok_accounts
ALTER TABLE tiktok_accounts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_iso_tiktok ON tiktok_accounts
    FOR ALL USING (tenant_id = public.get_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- daily_creator_stats
ALTER TABLE daily_creator_stats ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_iso_daily_creator ON daily_creator_stats
    FOR ALL USING (tenant_id = public.get_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- daily_video_stats
ALTER TABLE daily_video_stats ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_iso_daily_video ON daily_video_stats
    FOR ALL USING (tenant_id = public.get_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- daily_product_stats
ALTER TABLE daily_product_stats ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_iso_daily_product ON daily_product_stats
    FOR ALL USING (tenant_id = public.get_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- daily_video_product_stats
ALTER TABLE daily_video_product_stats ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tenant_iso_daily_vp ON daily_video_product_stats
    FOR ALL USING (tenant_id = public.get_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
