/**
 * Brand registry — the single DB-driven source of brand identity, read from
 * brands_v2. Replacement for the hardcoded brand maps in `constants.ts`. Adding
 * a brand or umbrella store becomes one brands_v2 row (with parent_brand_id) —
 * no code edits, no silent failures from a missed map.
 *
 * The PURE helpers + types live in ./brand-registry-core (no Next/DB deps, so
 * they're unit-testable and used by the parity harness). This module only adds
 * the brands_v2 read.
 *
 * Usage (avoids N+1 on hot/money paths): hydrate ONCE per request with
 * `await getBrandRegistry()`, then call the pure helpers in loops. The async
 * convenience wrappers below are for one-shot call sites.
 *
 * Server-only: reads via the admin client. Pickers/clients use /api/brands.
 */
import {
  buildRegistry,
  expandSlugs,
  resolveUuids,
  activeBrandSlugs,
  type BrandRow,
  type BrandRegistry,
} from './brand-registry-core';

export * from './brand-registry-core';

/** One read of brands_v2 → indexed registry. Call once per request and reuse. */
export async function getBrandRegistry(): Promise<BrandRegistry> {
  // Dynamic import keeps this module's STATIC import graph pure (just
  // brand-registry-core). createAdminClient pulls in next/headers; importing it
  // at top level poisons any CLIENT bundle that transitively imports this module
  // — e.g. a 'use client' component importing a const/type from a server data
  // fetcher that imports the registry. getBrandRegistry is only ever called
  // server-side, so loading createAdminClient lazily is free.
  const { createAdminClient } = await import('@/lib/supabase/server');
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from('brands_v2')
    .select('id, slug, name, display_name, color, is_archived, is_umbrella, parent_brand_id, store_order');
  return buildRegistry((data ?? []) as BrandRow[]);
}

// ── Async convenience wrappers (one read each; prefer the pure helpers from
//    ./brand-registry-core when resolving many brands in a single request) ────

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
