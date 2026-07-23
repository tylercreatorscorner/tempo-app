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

interface TenantSnapshot {
  tenant: TenantInfo | null;
  userRole: string;
  userName: string;
  userEmail: string;
  brandCount: number;
  allowedBrands: string[] | null;
  canViewFinance: boolean;
}

const DEFAULT_SNAPSHOT: TenantSnapshot = {
  tenant: null,
  userRole: 'customer',
  userName: '',
  userEmail: '',
  brandCount: 0,
  allowedBrands: null,
  canViewFinance: true,
};

// Module-level cache (same pattern as use-brand-meta): a page can mount many
// useTenant consumers, and without this each one re-ran the full
// auth.getUser -> user_profiles -> tenants + brands_v2-count chain. One
// in-flight promise is shared across instances; the resolved snapshot is
// reused for the lifetime of the tab.
let cache: TenantSnapshot | null = null;
let inflight: Promise<TenantSnapshot> | null = null;

async function fetchTenantSnapshot(): Promise<TenantSnapshot> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const snapshot: TenantSnapshot = { ...DEFAULT_SNAPSHOT };
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        cache = snapshot;
        return snapshot;
      }

      snapshot.userEmail = user.email || '';

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('tenant_id, role, name, allowed_brands, can_view_finance')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profile) {
        snapshot.userRole = profile.role || 'customer';
        snapshot.userName = profile.name || user.user_metadata?.full_name || '';
        snapshot.allowedBrands =
          Array.isArray(profile.allowed_brands) && profile.allowed_brands.length > 0
            ? profile.allowed_brands
            : null;
        // Owner/admin/viewer always see finance; managers only if their flag is set.
        snapshot.canViewFinance =
          profile.role === 'owner' || profile.role === 'admin' || profile.role === 'viewer'
            ? true
            : ((profile as { can_view_finance?: boolean | null }).can_view_finance ?? true);
      }

      if (profile?.tenant_id) {
        const [tenantRes, countRes] = await Promise.all([
          supabase.from('tenants').select('*').eq('id', profile.tenant_id).single(),
          supabase.from('brands_v2').select('id', { count: 'exact', head: true }),
        ]);

        snapshot.tenant = tenantRes.data as TenantInfo | null;
        snapshot.brandCount = countRes.count ?? 0;
      }

      cache = snapshot;
      return snapshot;
    } catch {
      // Unexpected throw (e.g. network failure inside supabase-js): return the
      // defaults WITHOUT caching so the next mount retries.
      return snapshot;
    }
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Hook to get the current user's tenant, role, and plan awareness */
export function useTenant() {
  const [snapshot, setSnapshot] = useState<TenantSnapshot | null>(cache);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let cancelled = false;
    fetchTenantSnapshot().then((s) => {
      if (cancelled) return;
      setSnapshot(s);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const { tenant, userRole, userName, userEmail, brandCount, allowedBrands, canViewFinance } =
    snapshot ?? DEFAULT_SNAPSHOT;

  const isMultiBrand = useMemo(() => brandCount > 1, [brandCount]);
  const isBrandPlan = useMemo(() => tenant?.plan === 'brand', [tenant]);
  const isOwner = useMemo(() => userRole === 'owner' || userRole === 'admin', [userRole]);
  const isBrandRestricted = useMemo(() => allowedBrands !== null, [allowedBrands]);

  return {
    tenant, userRole, userName, userEmail, brandCount,
    isMultiBrand, isBrandPlan, isOwner, allowedBrands, isBrandRestricted, canViewFinance, loading,
  };
}
