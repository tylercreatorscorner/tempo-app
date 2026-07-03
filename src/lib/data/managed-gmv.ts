/**
 * Canonical "managed GMV" computation — the single source of truth.
 *
 * Both the Earnings page (src/lib/data/earnings.ts) and the Creators/roster
 * page (src/app/api/roster/route.ts) call this so their Managed GMV numbers
 * tie out to the penny for the same period. Previously each page rolled its
 * own definition of "managed" and they drifted (roster summed per row →
 * double-counted duplicate/merged creator identities; the dashboard counted
 * any creators_v2 handle). This module is THE definition:
 *
 *   managed  = the creator's TikTok handle is attached to a non-archived
 *              managed_creators row, and that row's brand (expanded through
 *              any umbrella → its data stores) matches the store the GMV was
 *              earned on.
 *   dedup    = GMV is aggregated per (handle, store); a handle attached to
 *              more than one managed_creators row is still counted once.
 *
 * Returns per DATA STORE slug (e.g. leefar_nutrition, not the umbrella
 * `leefar`). Callers that want an umbrella total sum the umbrella's store
 * slugs — see `sumManagedGmvForBrands`.
 */
import { createAdminClient } from '@/lib/supabase/server';
import { expandSlugs, type BrandRegistry } from '@/lib/data/brand-registry';

export interface ManagedCreatorGmv {
  /** Normalized handle (lowercased, @-stripped). */
  handleNorm: string;
  /** Handle as it appeared in creator_performance (for display). */
  rawName: string;
  /** GMV this handle drove on this store in the period. */
  gmv: number;
}

export interface ManagedGmvResult {
  /** Active data-store slugs considered (non-umbrella, non-archived, after any brand filter). */
  storeSlugs: string[];
  /** store slug → (normalized handle → aggregate) for managed creators only. */
  byStoreCreator: Map<string, Map<string, ManagedCreatorGmv>>;
  /** store slug → total managed affiliate GMV. */
  byStore: Map<string, number>;
  /** store slug → brand display name (from brands_v2). */
  labelByStore: Map<string, string>;
}

export function normalizeHandle(h: string | null | undefined): string {
  if (!h) return '';
  return h.replace(/^@/, '').trim().toLowerCase();
}

/**
 * Compute managed affiliate GMV per data store for an arbitrary date range.
 *
 * @param startDate         inclusive, "YYYY-MM-DD"
 * @param endDate           inclusive, "YYYY-MM-DD"
 * @param brandFilterSlugs  when non-null, restrict to these data-store slugs
 *                          (fail-closed: [] → empty result, never "all").
 * @param regArg            optional pre-fetched registry (saves a round-trip).
 */
export async function computeManagedGmv(
  startDate: string,
  endDate: string,
  brandFilterSlugs?: string[] | null,
  regArg?: BrandRegistry,
): Promise<ManagedGmvResult> {
  const supabase = await createAdminClient();
  void regArg; // kept for call-site compatibility; get_managed_gmv resolves brands itself

  // Active data stores = brands_v2 rows that are neither archived nor umbrella
  // groupings. Umbrella slugs (e.g. "leefar") carry no data of their own.
  const { data: brandsRaw } = await supabase
    .from('brands_v2')
    .select('slug, name')
    .eq('is_archived', false)
    .eq('is_umbrella', false);
  let activeRows = (brandsRaw as Array<{ slug: string; name: string }> | null) ?? [];
  if (brandFilterSlugs != null) {
    const allowed = new Set(brandFilterSlugs);
    activeRows = activeRows.filter((b) => allowed.has(b.slug));
  }
  const storeSlugs = activeRows.map((b) => b.slug);
  const labelByStore = new Map(activeRows.map((b) => [b.slug, b.name] as const));

  const empty: ManagedGmvResult = {
    storeSlugs,
    byStoreCreator: new Map(),
    byStore: new Map(),
    labelByStore,
  };
  if (storeSlugs.length === 0) return empty;

  // Canonical managed GMV — computed IN the database by get_managed_gmv(), which
  // does the managed_creators × tiktok_accounts × creator_performance join,
  // per-(handle, store) dedup, and umbrella→store expansion in Postgres, then
  // returns only the ~hundreds of GMV-bearing (store, handle) rows. This replaced
  // dragging managed_creators + tiktok_accounts + up to ~144k creator_performance
  // rows into Node and joining in JS — which also tripped PostgREST's 1000-row
  // cap on the two table reads (silently dropping handles → under-count). RPC
  // results are NOT subject to that cap, so nothing truncates.
  const { data: rows, error } = await supabase.rpc('get_managed_gmv', {
    p_start: startDate,
    p_end: endDate,
    p_brands: brandFilterSlugs ?? null,
  });
  if (error) {
    console.error('[managed-gmv] get_managed_gmv RPC failed:', error.message);
    return empty;
  }

  const byStoreCreator = new Map<string, Map<string, ManagedCreatorGmv>>();
  const byStore = new Map<string, number>();
  for (const slug of storeSlugs) {
    byStoreCreator.set(slug, new Map());
    byStore.set(slug, 0);
  }
  for (const r of (rows as Array<{ store_slug: string; handle: string; raw_name: string | null; gmv: number | string }> | null) ?? []) {
    const bucket = byStoreCreator.get(r.store_slug);
    if (!bucket) continue; // store outside the requested scope (defensive)
    const gmv = typeof r.gmv === 'number' ? r.gmv : (parseFloat(String(r.gmv)) || 0);
    byStore.set(r.store_slug, (byStore.get(r.store_slug) ?? 0) + gmv);
    bucket.set(r.handle, { handleNorm: r.handle, rawName: r.raw_name ?? r.handle, gmv });
  }

  return { storeSlugs, byStoreCreator, byStore, labelByStore };
}

/**
 * Sum managed GMV for a set of ROSTER brand slugs (which may be umbrellas),
 * expanding each to its data stores. Dedups stores so overlapping inputs don't
 * double-count. Pass an already-computed result to avoid recomputing.
 */
export function sumManagedGmvForBrands(
  result: ManagedGmvResult,
  reg: BrandRegistry,
  brandSlugs: string[],
): number {
  const stores = new Set<string>();
  for (const slug of brandSlugs) for (const s of expandSlugs(reg, slug)) stores.add(s);
  let total = 0;
  for (const s of stores) total += result.byStore.get(s) ?? 0;
  return total;
}
