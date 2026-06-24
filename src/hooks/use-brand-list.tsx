'use client';

/**
 * useBrandList — single source of truth for the "active brands" list on the
 * client. Fetches brands_v2 (active, non-umbrella's per-store splits hidden)
 * and respects the user's allowed_brands restriction.
 *
 * Replaces direct use of the hardcoded ACTIVE_BRANDS constant in user-facing
 * pickers so adding a brand via the New Client wizard immediately makes it
 * available in every dropdown.
 *
 * Name/color come straight from brands_v2 (display_name || name || slug; color,
 * else a neutral gray) — every brand row carries them, so no hardcoded fallback.
 */

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface BrandListItem {
  slug: string;
  name: string;          // brands_v2.display_name || name, then slug
  color: string;         // brands_v2.color, then gray default
  rawName: string;       // brands_v2.name (for cases where display_name shouldn't be used)
  id: string;
}

let cache: BrandListItem[] | null = null;
let inflight: Promise<BrandListItem[]> | null = null;

async function fetchBrands(): Promise<BrandListItem[]> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let allowedBrands: string[] | null = null;
    if (user) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('allowed_brands')
        .eq('user_id', user.id)
        .maybeSingle();
      if (Array.isArray(profile?.allowed_brands) && profile.allowed_brands.length > 0) {
        allowedBrands = profile.allowed_brands;
      }
    }

    let query = supabase
      .from('brands_v2')
      .select('id, slug, name, display_name, color, parent_brand_id')
      .eq('is_archived', false);
    if (allowedBrands) query = query.in('slug', allowedBrands);

    const { data, error } = await query.order('name');
    if (error) {
      console.error('useBrandList: failed to fetch brands_v2', error);
      return [];
    }

    // Per-store children (parent_brand_id set) never appear in the picker — the
    // umbrella slug is the canonical roster brand. Replaces the old hidden literal.
    const filtered = (data ?? []).filter((b) => b.parent_brand_id == null);
    const result: BrandListItem[] = filtered.map((b) => ({
      id: b.id,
      slug: b.slug,
      rawName: b.name,
      name: b.display_name || b.name || b.slug,
      color: b.color || '#6B7280',
    }));

    cache = result;
    return result;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Invalidate the in-memory brand cache. Call after creating/archiving a brand. */
export function invalidateBrandList() {
  cache = null;
}

export function useBrandList(): { brands: BrandListItem[]; loading: boolean } {
  const [brands, setBrands] = useState<BrandListItem[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let cancelled = false;
    fetchBrands().then((list) => {
      if (cancelled) return;
      setBrands(list);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return { brands, loading };
}
