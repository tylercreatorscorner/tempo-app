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
import { getBrandRegistry, expandSlugs, type BrandRegistry } from '@/lib/data/brand-registry';

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
  /** `${handle}|||${store}` membership set (managed creators only). */
  managedLookup: Set<string>;
  /** store slug → brand display name (from brands_v2). */
  labelByStore: Map<string, string>;
}

interface PerfRow {
  creator_name: string;
  brand: string;
  gmv: number | string;
}

function pNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isNaN(n) ? 0 : n;
}

export function normalizeHandle(h: string | null | undefined): string {
  if (!h) return '';
  return h.replace(/^@/, '').trim().toLowerCase();
}

/**
 * Fetch EVERY row of a Supabase table query, paging past PostgREST's default
 * 1000-row cap. `makeQuery` must return a FRESH builder each call (builders are
 * single-use) carrying a stable `.order()` so successive range windows line up.
 *
 * This matters here: RPC calls (get_creator_brand_gmv) are NOT subject to the
 * cap, but plain `.select()` table reads ARE. managed_creators (~1.3k rows) and
 * tiktok_accounts (~1.4k rows for managed creators) both exceed 1000, so an
 * un-paged read silently dropped handles → an incomplete managedLookup →
 * under-counted managed GMV (e.g. Lemme read $65,728.62 instead of $66,030.85).
 */
async function fetchAllRows<T>(
  makeQuery: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> },
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1);
    if (error) { console.error('[managed-gmv] paged fetch failed:', error.message); break; }
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
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
  const reg = regArg ?? (await getBrandRegistry());

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
    managedLookup: new Set(),
    labelByStore,
  };
  if (storeSlugs.length === 0) return empty;

  type ManagedRowLite = {
    brand: string | null;
    creator_id: string | null;
    account_1: string | null; account_2: string | null; account_3: string | null;
    account_4: string | null; account_5: string | null;
  };
  const [perfRes, managedRows] = await Promise.all([
    supabase.rpc('get_creator_brand_gmv', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_brands: storeSlugs,
    }),
    // Paged past the 1000-row cap so no managed creator is silently dropped.
    fetchAllRows<ManagedRowLite>(() =>
      supabase
        .from('managed_creators')
        .select('brand, creator_id, account_1, account_2, account_3, account_4, account_5')
        .is('archived_at', null)
        .order('id', { ascending: true })),
  ]);

  const perfData = (perfRes.data as PerfRow[] | null) ?? [];

  // Canonical handles per creator_id from tiktok_accounts (one query), with the
  // legacy account_1..5 columns as a fallback for rows lacking a creator_id.
  const managedCreatorIds = Array.from(
    new Set(managedRows.map((m) => m.creator_id).filter((v): v is string => !!v)),
  );
  const handlesByCreatorId = new Map<string, string[]>();
  {
    // Fetch tiktok handles for all managed creators. TWO truncation traps here:
    //  (1) a long `.in()` list overflows the request URL and silently returns a
    //      PARTIAL set — so CHUNK the ids into small batches; and
    //  (2) the 1000-row cap — so PAGE each batch.
    // Both were dropping handles and forcing a wrong per-row fallback to the
    // legacy account_1..5 columns, which under/over-counted managed GMV by brand.
    const CHUNK = 200;
    for (let i = 0; i < managedCreatorIds.length; i += CHUNK) {
      const batch = managedCreatorIds.slice(i, i + CHUNK);
      const taRows = await fetchAllRows<{ creator_id: string; tiktok_username: string | null }>(() =>
        supabase
          .from('tiktok_accounts')
          .select('creator_id, tiktok_username')
          .in('creator_id', batch)
          .order('id', { ascending: true }));
      for (const r of taRows) {
        const handle = normalizeHandle(r.tiktok_username);
        if (!handle) continue;
        const list = handlesByCreatorId.get(r.creator_id) ?? [];
        list.push(handle);
        handlesByCreatorId.set(r.creator_id, list);
      }
    }
  }

  // Build (handle|||store) membership. Umbrella brands expand to their stores
  // so an umbrella-managed creator counts toward every store it drives GMV on.
  const managedLookup = new Set<string>();
  for (const m of managedRows) {
    if (!m.brand) continue;
    const dataBrands = expandSlugs(reg, m.brand);
    const fromAccounts = m.creator_id ? handlesByCreatorId.get(m.creator_id) : undefined;
    const handles =
      fromAccounts && fromAccounts.length > 0
        ? fromAccounts
        : [m.account_1, m.account_2, m.account_3, m.account_4, m.account_5]
            .map(normalizeHandle)
            .filter(Boolean);
    for (const handle of handles) {
      for (const dataBrand of dataBrands) managedLookup.add(`${handle}|||${dataBrand}`);
    }
  }

  // Aggregate GMV per (store, handle) — managed creators only, deduped by handle.
  const storeSet = new Set(storeSlugs);
  const byStoreCreator = new Map<string, Map<string, ManagedCreatorGmv>>();
  const byStore = new Map<string, number>();
  for (const slug of storeSlugs) {
    byStoreCreator.set(slug, new Map());
    byStore.set(slug, 0);
  }
  for (const row of perfData) {
    const handle = normalizeHandle(row.creator_name);
    if (!handle) continue;
    if (!storeSet.has(row.brand)) continue;
    if (!managedLookup.has(`${handle}|||${row.brand}`)) continue;
    const gmv = pNum(row.gmv);
    byStore.set(row.brand, (byStore.get(row.brand) ?? 0) + gmv);
    const m = byStoreCreator.get(row.brand)!;
    const agg = m.get(handle);
    if (agg) agg.gmv += gmv;
    else m.set(handle, { handleNorm: handle, rawName: row.creator_name, gmv });
  }

  return { storeSlugs, byStoreCreator, byStore, managedLookup, labelByStore };
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
