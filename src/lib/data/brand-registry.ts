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
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/server';
import {
  buildRegistry,
  expandSlugs,
  resolveUuids,
  activeBrandSlugs,
  type BrandRow,
  type BrandRegistry,
} from './brand-registry-core';

export * from './brand-registry-core';

/** One read of brands_v2 → indexed registry. Wrapped in React `cache()` so
 *  multiple callers in the SAME request (e.g. the Dashboard + its fold-in helper)
 *  share a single brands_v2 read instead of re-querying.
 *  Server-only (createAdminClient → next/headers): never import this module from
 *  a CLIENT bundle. Client components needing brand label/color use useBrandMeta;
 *  the brand-portal period type/labels live in ./brand-portal-periods (pure). */
export const getBrandRegistry = cache(async (): Promise<BrandRegistry> => {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from('brands_v2')
    .select('id, slug, name, display_name, color, is_archived, is_umbrella, parent_brand_id, store_order');
  return buildRegistry((data ?? []) as BrandRow[]);
});

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
