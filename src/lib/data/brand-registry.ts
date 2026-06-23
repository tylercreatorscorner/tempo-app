/**
 * Brand registry — the single DB-driven source of brand identity, read from
 * brands_v2. This is the replacement for the hardcoded brand maps in
 * `constants.ts` (BRAND_UUID_MAP / BRAND_SLUG_MAP / LEEFAR_STORE_SLUGS /
 * HIDDEN_FROM_PICKER / ACTIVE_BRANDS). Adding a brand or umbrella store becomes a
 * single brands_v2 row (with parent_brand_id set) — no code edits, no silent
 * failures from a missed map.
 *
 * Phase 0 of the retirement: this module exists and is unit-equivalent to the
 * legacy maps, but NO call site uses it yet. Later phases swap call sites onto
 * it, money paths last and behind a parity harness.
 *
 * Usage pattern (avoids N+1 on hot/money paths): hydrate the registry ONCE per
 * request with `await getBrandRegistry()`, then call the pure sync helpers
 * (expandSlugs / resolveUuids / …) inside loops. The async convenience wrappers
 * below are for one-shot call sites.
 *
 * Server-only: reads via the admin client. Pickers/clients use /api/brands.
 */
import { createAdminClient } from '@/lib/supabase/server';

export interface BrandRow {
  id: string;
  slug: string;
  name: string;
  display_name: string | null;
  color: string | null;
  is_archived: boolean;
  is_umbrella: boolean;
  parent_brand_id: string | null;
  store_order: number | null;
}

export interface BrandRegistry {
  rows: BrandRow[];
  bySlug: Map<string, BrandRow>;
  byId: Map<string, BrandRow>;
  /** umbrella id → its store rows, ordered by store_order (load-bearing: the
   *  marketing-GMV editor parks the umbrella amount on store[0]). */
  childrenByParentId: Map<string, BrandRow[]>;
}

/** One read of brands_v2 → indexed registry. Call once per request and reuse. */
export async function getBrandRegistry(): Promise<BrandRegistry> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from('brands_v2')
    .select('id, slug, name, display_name, color, is_archived, is_umbrella, parent_brand_id, store_order');
  const rows = (data ?? []) as BrandRow[];

  const bySlug = new Map<string, BrandRow>();
  const byId = new Map<string, BrandRow>();
  const childrenByParentId = new Map<string, BrandRow[]>();
  for (const r of rows) {
    bySlug.set(r.slug, r);
    byId.set(r.id, r);
  }
  for (const r of rows) {
    if (r.parent_brand_id) {
      const arr = childrenByParentId.get(r.parent_brand_id) ?? [];
      arr.push(r);
      childrenByParentId.set(r.parent_brand_id, arr);
    }
  }
  for (const arr of childrenByParentId.values()) {
    arr.sort((a, b) => (a.store_order ?? 0) - (b.store_order ?? 0) || a.slug.localeCompare(b.slug));
  }
  return { rows, bySlug, byId, childrenByParentId };
}

// ── Pure helpers (take the registry; safe to call in loops) ──────────────────

/** Expand a brand slug to the per-store DATA slugs. An umbrella → its children
 *  (ordered by store_order); any other brand → just itself. Mirrors the legacy
 *  expandBrandToDataSlugs('leefar') === [nutrition, supplements, us]. */
export function expandSlugs(reg: BrandRegistry, slug: string): string[] {
  const b = reg.bySlug.get(slug);
  if (b?.is_umbrella) {
    const kids = reg.childrenByParentId.get(b.id) ?? [];
    if (kids.length) return kids.map((k) => k.slug);
  }
  return [slug];
}

/** Resolve a brand slug to the data-table brand_id(s). 'all'/empty → null (no
 *  brand filter). A known-but-unresolvable brand → [] (scope to nothing, never
 *  silently widen to all). Equivalent to the legacy resolveBrandDataUuids but
 *  DB-driven, so newer brands (absent from the old map) resolve correctly. */
export function resolveUuids(
  reg: BrandRegistry,
  slug: string | null | undefined,
  fallbackUuid?: string,
): string[] | null {
  if (!slug || slug === 'all') return null;
  const uuids = expandSlugs(reg, slug)
    .map((s) => reg.bySlug.get(s)?.id)
    .filter((x): x is string => Boolean(x));
  if (uuids.length) return uuids;
  return fallbackUuid ? [fallbackUuid] : [];
}

export function slugToUuid(reg: BrandRegistry, slug: string): string | undefined {
  return reg.bySlug.get(slug)?.id;
}

export function uuidToSlug(reg: BrandRegistry, id: string): string | undefined {
  return reg.byId.get(id)?.slug;
}

/** Umbrella-grain active brands: non-archived and NOT a child store. This is the
 *  grain the legacy ACTIVE_BRANDS used and that managed_creators.brand is keyed
 *  to (the umbrella 'leefar', not its stores), now including newer brands. */
export function activeBrandSlugs(reg: BrandRegistry): string[] {
  return reg.rows.filter((r) => !r.is_archived && r.parent_brand_id == null).map((r) => r.slug);
}

export function brandLabel(reg: BrandRegistry, slug: string): string {
  const b = reg.bySlug.get(slug);
  return b?.display_name || b?.name || slug;
}

// ── Async convenience wrappers (one cached read each; prefer the sync helpers
//    above when resolving many brands in a single request) ──────────────────

export async function expandBrandToDataSlugsDb(slug: string): Promise<string[]> {
  return expandSlugs(await getBrandRegistry(), slug);
}

export async function resolveBrandDataUuidsDb(
  slug: string | null | undefined,
  fallbackUuid?: string,
): Promise<string[] | null> {
  return resolveUuids(await getBrandRegistry(), slug, fallbackUuid);
}

export async function getActiveBrandSlugs(): Promise<string[]> {
  return activeBrandSlugs(await getBrandRegistry());
}

export async function getActiveBrandUuids(): Promise<string[]> {
  const reg = await getBrandRegistry();
  return activeBrandSlugs(reg)
    .map((s) => reg.bySlug.get(s)?.id)
    .filter((x): x is string => Boolean(x));
}
