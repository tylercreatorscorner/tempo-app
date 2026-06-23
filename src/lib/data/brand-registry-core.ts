/**
 * Brand registry — PURE core. No Next/DB imports, so it is unit-testable and
 * usable by the parity harness (scripts/brand-parity.ts). `brand-registry.ts`
 * adds the brands_v2 read on top of these helpers.
 *
 * These replace the hardcoded brand maps (BRAND_UUID_MAP / LEEFAR_STORE_SLUGS /
 * HIDDEN_FROM_PICKER / ACTIVE_BRANDS) once the umbrella->store relationship is a
 * brands_v2 row (parent_brand_id + store_order, migration 056).
 */

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

/** Index a flat brands_v2 row set into the registry. Pure. */
export function buildRegistry(rows: BrandRow[]): BrandRegistry {
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
 *  silently widen to all). */
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

/** Umbrella-grain active brands: non-archived and NOT a child store. The grain
 *  the legacy ACTIVE_BRANDS used and that managed_creators.brand is keyed to. */
export function activeBrandSlugs(reg: BrandRegistry): string[] {
  return reg.rows.filter((r) => !r.is_archived && r.parent_brand_id == null).map((r) => r.slug);
}

export function brandLabel(reg: BrandRegistry, slug: string): string {
  const b = reg.bySlug.get(slug);
  return b?.display_name || b?.name || slug;
}
