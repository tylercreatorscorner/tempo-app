'use client';

/**
 * Brand-list plumbing for the Reporting surface.
 *
 * - useLiveBrands: fetches /api/brands ONCE per tab via a module-level cache
 *   (same pattern as use-brand-meta) — previously every mounted card fired its
 *   own GET. Exposes an error flag instead of silently collapsing to
 *   "All Brands" on failure.
 * - useBrandOptions: maps the live list to picker options with RBAC +
 *   umbrella-collapse rules.
 * - useBrandSelect: option list + selection state in one hook. When the real
 *   options arrive and the current selection is not among them (the loading
 *   fallback is just "All Brands"), it snaps to the first real option — this
 *   is the fix for single-brand managers sending brand=all and getting 403s.
 */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { useTenant } from '@/hooks/use-tenant';

export interface BrandListEntry {
  slug: string;
  name: string;
  is_archived: boolean;
  is_umbrella: boolean;
  /** Set when this is a per-store child of an umbrella (e.g. leefar_nutrition).
   *  Null for top-level brands. Replaces the hardcoded HIDDEN_FROM_PICKER set. */
  parent_brand_id: string | null;
}

export interface BrandOption {
  value: string;
  label: string;
}

let brandsCache: BrandListEntry[] | null = null;
let brandsInflight: Promise<BrandListEntry[]> | null = null;

async function fetchLiveBrands(): Promise<BrandListEntry[]> {
  if (brandsCache) return brandsCache;
  if (brandsInflight) return brandsInflight;

  brandsInflight = (async () => {
    const res = await fetch('/api/brands');
    if (!res.ok) throw new Error(`GET /api/brands failed (${res.status})`);
    const d = (await res.json()) as { brands?: BrandListEntry[] };
    const live = (d.brands ?? [])
      .filter(b => !b.is_archived)
      .map(b => ({
        slug: b.slug,
        name: b.name,
        is_archived: b.is_archived,
        is_umbrella: b.is_umbrella,
        parent_brand_id: b.parent_brand_id ?? null,
      }));
    brandsCache = live;
    return live;
  })();

  try {
    return await brandsInflight;
  } finally {
    brandsInflight = null;
  }
}

/**
 * Live brand list sourced from brands_v2 via /api/brands. Cached at module
 * level so all cards on the page share one fetch. `brands` stays null while
 * loading or after a failure; `error` distinguishes the two.
 */
export function useLiveBrands(): { brands: BrandListEntry[] | null; error: boolean } {
  const [brands, setBrands] = useState<BrandListEntry[] | null>(brandsCache);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchLiveBrands()
      .then(b => { if (!cancelled) { setBrands(b); setError(false); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  return { brands, error };
}

/**
 * The brand options the current user is allowed to see, with an "All Brands"
 * entry prepended unless the user is restricted to one brand.
 *
 * Falls back to just "All Brands" while the brands fetch is in flight so
 * dropdowns stay usable; `ready` flips true once BOTH the live brand list and
 * the tenant scope have loaded (consumers must not trust the selection until
 * then — see useBrandSelect).
 */
export function useBrandOptions(opts?: { collapseUmbrella?: boolean }) {
  const { allowedBrands, loading: tenantLoading } = useTenant();
  const { brands, error } = useLiveBrands();
  const brandMeta = useBrandMeta();
  const collapseUmbrella = opts?.collapseUmbrella ?? false;

  const options = useMemo<BrandOption[]>(() => {
    if (!brands) return [{ value: 'all', label: 'All Brands' }];
    const allowed = allowedBrands && allowedBrands.length > 0
      ? brands.filter(b => allowedBrands.includes(b.slug))
      : brands;
    // Two views of an umbrella brand (LeeFar). Generators that aggregate the
    // umbrella back to its stores (Discord posts, Brand Client Report — both
    // expand via expandBrandToDataSlugs) show the single umbrella and hide the
    // per-store slugs, so the user picks "LeeFar" once and gets one consolidated
    // output. The text reports are per-store (they don't aggregate), so they keep
    // showing the stores and hide the umbrella (its slug has no data of its own).
    const visible = collapseUmbrella
      ? allowed.filter(b => b.parent_brand_id == null)
      : allowed.filter(b => !b.is_umbrella);
    const brandOpts = visible.map(b => ({
      value: b.slug,
      // Prefer the DB-driven display name (or static override fallback) when
      // present; otherwise fall back to the canonical name from brands_v2.
      label: brandMeta.label(b.slug) || b.name,
    }));
    if (visible.length === 1) return brandOpts; // Restricted to one brand: no "All"
    return [{ value: 'all', label: 'All Brands' }, ...brandOpts];
  }, [allowedBrands, brands, collapseUmbrella, brandMeta]);

  return { options, ready: brands !== null && !tenantLoading, error };
}

/**
 * Brand picker state for a generator card. Initializes from `initial` (e.g. the
 * schedule being edited) or the first available option. The exposed `brand` is
 * DERIVED: once the real option list lands, a selection that is not among the
 * options resolves to the first real option, so a scoped manager never submits
 * the 'all' loading fallback (which 403s server-side).
 */
export function useBrandSelect(opts?: { collapseUmbrella?: boolean; initial?: string }) {
  const { options, ready, error } = useBrandOptions({ collapseUmbrella: opts?.collapseUmbrella });
  const [rawBrand, setBrand] = useState(opts?.initial ?? options[0]?.value ?? 'all');

  const brand = useMemo(() => {
    if (options.some(o => o.value === rawBrand)) return rawBrand;
    // Not a valid option. Once the real list is loaded, resolve to its first
    // entry; during the loading window keep the raw value so the fallback
    // "All Brands" select still shows a selection.
    if (ready) return options[0]?.value ?? rawBrand;
    return rawBrand;
  }, [options, rawBrand, ready]);

  return { brand, setBrand, options, ready, error };
}

/** Inline warning shown near a brand picker when the live brand list failed to
 *  load (the picker is stuck on the "All Brands" fallback). */
export function BrandListWarning({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-[var(--pulse-warn)]">
      <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
      <span>Couldn&apos;t load the brand list. Only &quot;All Brands&quot; is available; reload the page to retry.</span>
    </p>
  );
}
