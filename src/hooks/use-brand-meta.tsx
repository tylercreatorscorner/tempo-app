'use client';

/**
 * useBrandMeta — client-side slug -> { label, color } lookup for rendering brand
 * names and colors anywhere in the UI.
 *
 * Sourced from brands_v2 (ALL rows — including the hidden per-store splits like
 * leefar_nutrition and archived brands — so labels/colors resolve for store-keyed
 * data and retired brands too), DB-first with the legacy BRAND_DISPLAY_NAMES /
 * BRAND_COLORS constants as the fallback during load and for unknown slugs.
 *
 * Replaces direct BRAND_DISPLAY_NAMES[slug] / BRAND_COLORS[slug] reads in client
 * components so brands added via the New Client wizard render with the right name
 * and color without a code change. (Server code uses brandLabel/brandColor from
 * brand-registry-core instead.)
 *
 * Note this is intentionally the FULL brand set, distinct from useBrandList which
 * returns the picker-filtered active list.
 */

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BRAND_DISPLAY_NAMES, BRAND_COLORS } from '@/lib/utils/constants';

const DEFAULT_COLOR = '#6B7280';

interface MetaRow {
  name: string;
  color: string;
}
type MetaMap = Map<string, MetaRow>;

export interface BrandMeta {
  /** Display name for a slug. 'all'/empty handled; falls back to the slug. */
  label: (slug: string | null | undefined) => string;
  /** Brand color hex for a slug; falls back to neutral gray. */
  color: (slug: string | null | undefined) => string;
  loading: boolean;
}

let cache: MetaMap | null = null;
let inflight: Promise<MetaMap> | null = null;

async function fetchMeta(): Promise<MetaMap> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const supabase = createClient();
    const { data, error } = await supabase.from('brands_v2').select('slug, name, display_name, color');
    if (error) {
      console.error('useBrandMeta: failed to fetch brands_v2', error);
      return new Map<string, MetaRow>();
    }
    const map: MetaMap = new Map();
    for (const b of data ?? []) {
      map.set(b.slug, {
        name: b.display_name || b.name || BRAND_DISPLAY_NAMES[b.slug] || b.slug,
        color: b.color || BRAND_COLORS[b.slug] || DEFAULT_COLOR,
      });
    }
    cache = map;
    return map;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Invalidate the in-memory brand-meta cache. Call after creating/editing a brand. */
export function invalidateBrandMeta() {
  cache = null;
}

function labelFrom(map: MetaMap | null, slug: string | null | undefined): string {
  if (!slug) return '';
  if (slug === 'all') return 'All Brands';
  return map?.get(slug)?.name || BRAND_DISPLAY_NAMES[slug] || slug;
}

function colorFrom(map: MetaMap | null, slug: string | null | undefined): string {
  if (!slug || slug === 'all') return DEFAULT_COLOR;
  return map?.get(slug)?.color || BRAND_COLORS[slug] || DEFAULT_COLOR;
}

export function useBrandMeta(): BrandMeta {
  const [map, setMap] = useState<MetaMap | null>(cache);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let cancelled = false;
    fetchMeta().then((m) => {
      if (cancelled) return;
      setMap(m);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Stable identity across renders (until map/loading change) so consumers can
  // safely put the returned object in useMemo/useCallback dependency arrays.
  return useMemo<BrandMeta>(
    () => ({
      label: (slug) => labelFrom(map, slug),
      color: (slug) => colorFrom(map, slug),
      loading,
    }),
    [map, loading],
  );
}
