'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  max_brands: number;
  onboarding_complete: boolean;
  tiktok_connected: boolean;
  creators_added: boolean;
  discord_connected: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

/** Hook to get the current user's tenant, role, and plan awareness */
export function useTenant() {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [userRole, setUserRole] = useState<string>('customer');
  const [userName, setUserName] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [brandCount, setBrandCount] = useState(0);
  const [allowedBrands, setAllowedBrands] = useState<string[] | null>(null);
  const [canViewFinance, setCanViewFinance] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function fetchTenant() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      setUserEmail(user.email || '');

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('tenant_id, role, name, allowed_brands, can_view_finance')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profile) {
        setUserRole(profile.role || 'customer');
        setUserName(profile.name || user.user_metadata?.full_name || '');
        setAllowedBrands(
          Array.isArray(profile.allowed_brands) && profile.allowed_brands.length > 0
            ? profile.allowed_brands
            : null
        );
        // Owner/admin/viewer always see finance; managers only if their flag is set.
        setCanViewFinance(
          profile.role === 'owner' || profile.role === 'admin' || profile.role === 'viewer'
            ? true
            : ((profile as { can_view_finance?: boolean | null }).can_view_finance ?? true)
        );
      }

      if (profile?.tenant_id) {
        const [tenantRes, countRes] = await Promise.all([
          supabase.from('tenants').select('*').eq('id', profile.tenant_id).single(),
          supabase.from('brands_v2').select('id', { count: 'exact', head: true }),
        ]);

        setTenant(tenantRes.data as TenantInfo | null);
        setBrandCount(countRes.count ?? 0);
      }
      setLoading(false);
    }

    fetchTenant();
  }, []);

  const isMultiBrand = useMemo(() => brandCount > 1, [brandCount]);
  const isBrandPlan = useMemo(() => tenant?.plan === 'brand', [tenant]);
  const isOwner = useMemo(() => userRole === 'owner' || userRole === 'admin', [userRole]);
  const isBrandRestricted = useMemo(() => allowedBrands !== null, [allowedBrands]);

  return {
    tenant, userRole, userName, userEmail, brandCount,
    isMultiBrand, isBrandPlan, isOwner, allowedBrands, isBrandRestricted, canViewFinance, loading,
  };
}
