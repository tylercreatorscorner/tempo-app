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
 * Falls back to BRAND_DISPLAY_NAMES + BRAND_COLORS constants only for legacy
 * slugs where the DB row lacks display_name/color — new wizard-created brands
 * populate those columns directly, so the constants are belt-and-suspenders.
 */

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BRAND_DISPLAY_NAMES, BRAND_COLORS } from '@/lib/utils/constants';

export interface BrandListItem {
  slug: string;
  name: string;          // display_name || name, falling back to BRAND_DISPLAY_NAMES, then slug
  color: string;         // brands_v2.color || BRAND_COLORS, then gray default
  rawName: string;       // brands_v2.name (for cases where display_name shouldn't be used)
  id: string;
}

// Per-store splits that should never appear in the brand picker. The umbrella
// slug ('leefar') is the canonical roster brand; the store slugs only exist
// for performance-data lookups under the hood.
const HIDDEN_FROM_PICKER = new Set(['leefar_nutrition', 'leefar_supplements']);

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
      .select('id, slug, name, display_name, color')
      .eq('is_archived', false);
    if (allowedBrands) query = query.in('slug', allowedBrands);

    const { data, error } = await query.order('name');
    if (error) {
      console.error('useBrandList: failed to fetch brands_v2', error);
      return [];
    }

    const filtered = (data ?? []).filter((b) => !HIDDEN_FROM_PICKER.has(b.slug));
    const result: BrandListItem[] = filtered.map((b) => ({
      id: b.id,
      slug: b.slug,
      rawName: b.name,
      name: b.display_name || b.name || BRAND_DISPLAY_NAMES[b.slug] || b.slug,
      color: b.color || BRAND_COLORS[b.slug] || '#6B7280',
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
