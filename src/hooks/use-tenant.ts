'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Tenant } from '@/types';

/** Hook to get the current user's tenant with plan awareness */
export function useTenant() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [brandCount, setBrandCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function fetchTenant() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      if (profile?.tenant_id) {
        const [tenantRes, countRes] = await Promise.all([
          supabase.from('tenants').select('*').eq('id', profile.tenant_id).single(),
          supabase.from('brands').select('id', { count: 'exact', head: true }).eq('tenant_id', profile.tenant_id),
        ]);

        setTenant(tenantRes.data as Tenant | null);
        setBrandCount(countRes.count ?? 0);
      }
      setLoading(false);
    }

    fetchTenant();
  }, []);

  /** True when tenant has more than one brand (agency/enterprise) */
  const isMultiBrand = useMemo(() => brandCount > 1, [brandCount]);

  /** True when tenant is on brand plan (single brand expected) */
  const isBrandPlan = useMemo(() => tenant?.plan === 'brand', [tenant]);

  return { tenant, brandCount, isMultiBrand, isBrandPlan, loading };
}
