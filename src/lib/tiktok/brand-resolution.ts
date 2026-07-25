/**
 * Map ONE authorized TikTok shop to EXACTLY ONE Tempo data-store brand slug.
 *
 * Why this file exists: the fact tables (creator_performance, video_performance,
 * videos, product_performance) key on `brand text` at DATA-STORE slug grain.
 * There is no umbrella row anywhere in them. So a shop written under 'leefar'
 * instead of 'leefar_nutrition' produces rows that no read path in the product
 * will ever select — the data is ingested, billed for, and invisible forever.
 * The previous integration resolved brands with a `?? slug` fallback, which
 * silently produced exactly that outcome. There is no fallback in this module,
 * by construction: every path either returns a verified store slug or fails.
 *
 * PURE by design — no DB import, no next/headers. Callers hydrate the registry
 * once (`await getBrandRegistry()` from '@/lib/data/brand-registry') and pass it
 * in, which keeps this logic unit-testable and safe to import from anywhere.
 */
import type { BrandRegistry, BrandRow } from '@/lib/data/brand-registry-core';

export type BrandResolutionFailure =
  /** The slug/name matched nothing in brands_v2. */
  | 'unknown_brand'
  /** Resolved to an umbrella (e.g. 'leefar'). Umbrellas have no fact-table rows. */
  | 'umbrella_slug'
  /** More than one store brand is a plausible match; a human must choose. */
  | 'ambiguous_match'
  /** Nothing usable was supplied to match on. */
  | 'no_input';

export type BrandResolution =
  | {
      ok: true;
      brandSlug: string;
      brand: BrandRow;
      /** How the match was made. 'explicit' is the only one that is not a guess;
       *  treat the *_name variants as a SUGGESTION to confirm in the UI, not as
       *  authority to start writing a client's GMV under it. */
      matchedOn: 'explicit' | 'exact_name' | 'prefix_name' | 'substring_name';
    }
  | {
      ok: false;
      reason: BrandResolutionFailure;
      /** Safe to surface in an admin UI; contains no secrets. */
      message: string;
      /** Populated for 'ambiguous_match' and for an umbrella hit (its stores). */
      candidates?: string[];
    };

export interface ShopIdentity {
  /** TikTok's shop display name, e.g. "LeeFar Nutrition Co.". */
  shopName?: string | null;
  /** TikTok's shop id — provenance for error messages; never used to guess. */
  shopId?: string | null;
  /**
   * The brand the operator explicitly chose (carried through the OAuth state
   * nonce). When present this is authoritative and no name guessing happens.
   */
  brandSlug?: string | null;
}

/** A brand that can legally own a TikTok shop: anything that is not an umbrella.
 *  Both standalone brands (cosrx) and umbrella children (leefar_us) qualify —
 *  they are the slugs the fact tables actually contain. */
export function isStoreBrand(brand: BrandRow): boolean {
  return !brand.is_umbrella;
}

/** Collapse to a comparison key: case- and punctuation-insensitive, so
 *  "LeeFar Nutrition Co." and "leefar_nutrition" become comparable. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function storeCandidates(reg: BrandRegistry): BrandRow[] {
  return reg.rows.filter(isStoreBrand);
}

function umbrellaStoreSlugs(reg: BrandRegistry, umbrella: BrandRow): string[] {
  return (reg.childrenByParentId.get(umbrella.id) ?? []).map((child) => child.slug);
}

/**
 * Validate an EXPLICITLY chosen slug. This is the OAuth-callback path: the
 * operator picked the brand before the redirect and the state nonce carried it,
 * so there is nothing to guess — only to verify.
 *
 * Archived brands are accepted here (a reconnect of a paused brand is
 * legitimate, and the DB trigger in migration 115 allows it too). Archived
 * brands are NOT accepted by the name-matching path below, because auto-guessing
 * into a retired brand is never what the operator meant.
 */
export function resolveExplicitBrandSlug(
  reg: BrandRegistry,
  slug: string | null | undefined,
): BrandResolution {
  const trimmed = (slug ?? '').trim();
  if (!trimmed) {
    return { ok: false, reason: 'no_input', message: 'No brand slug supplied.' };
  }

  const brand = reg.bySlug.get(trimmed);
  if (!brand) {
    return {
      ok: false,
      reason: 'unknown_brand',
      message: `"${trimmed}" is not a brand in brands_v2. Add the brand before connecting its shop.`,
    };
  }

  if (brand.is_umbrella) {
    const stores = umbrellaStoreSlugs(reg, brand);
    return {
      ok: false,
      reason: 'umbrella_slug',
      message:
        `"${trimmed}" is an umbrella, not a store. A TikTok shop maps to one store slug; ` +
        `the fact tables have no umbrella row, so data written here would be unreadable. ` +
        `Choose one of: ${stores.join(', ') || '(this umbrella has no store rows)'}.`,
      candidates: stores,
    };
  }

  return { ok: true, brandSlug: brand.slug, brand, matchedOn: 'explicit' };
}

/**
 * Resolve a shop to a store slug. Prefers the operator's explicit choice; falls
 * back to matching TikTok's shop name against brands_v2 in three tiers (exact,
 * prefix, substring), stopping at the first tier that matches anything.
 *
 * Every non-unique or non-existent outcome is a HARD FAILURE the caller must
 * handle. Do not add a `?? shopName` or `?? slug` fallback to this function —
 * that is the exact bug this module replaces.
 */
export function resolveShopToBrandSlug(
  reg: BrandRegistry,
  shop: ShopIdentity,
): BrandResolution {
  if (shop.brandSlug && shop.brandSlug.trim()) {
    return resolveExplicitBrandSlug(reg, shop.brandSlug);
  }

  const rawName = (shop.shopName ?? '').trim();
  if (!rawName) {
    return {
      ok: false,
      reason: 'no_input',
      message:
        `No brand slug and no shop name supplied${shop.shopId ? ` for shop ${shop.shopId}` : ''}; ` +
        `nothing to resolve against.`,
    };
  }

  const shopKey = normalize(rawName);
  if (!shopKey) {
    return {
      ok: false,
      reason: 'no_input',
      message: `Shop name "${rawName}" normalizes to nothing matchable.`,
    };
  }

  // Only live store brands are guessable targets.
  const candidates = storeCandidates(reg).filter((b) => !b.is_archived);
  const keysFor = (b: BrandRow): string[] =>
    [b.slug, b.name, b.display_name ?? '']
      .map(normalize)
      .filter((k) => k.length > 0);

  const exact = candidates.filter((b) => keysFor(b).some((k) => k === shopKey));
  const prefix = candidates.filter((b) =>
    keysFor(b).some((k) => k !== shopKey && (shopKey.startsWith(k) || k.startsWith(shopKey))),
  );
  // Substring is the loosest tier and the only one that can match on an
  // interior fragment, so short keys are excluded: 'deos' (4 chars) is a
  // substring of "videos store" and would confidently attribute a stranger's
  // shop to a real client. Five characters is the shortest length at which an
  // accidental interior hit stops being likely.
  const MIN_SUBSTRING_KEY = 5;
  const substring = candidates.filter((b) =>
    keysFor(b).some(
      (k) =>
        k !== shopKey &&
        k.length >= MIN_SUBSTRING_KEY &&
        shopKey.length >= MIN_SUBSTRING_KEY &&
        (shopKey.includes(k) || k.includes(shopKey)),
    ),
  );

  const tiers: Array<{ matches: BrandRow[]; matchedOn: 'exact_name' | 'prefix_name' | 'substring_name' }> = [
    { matches: exact, matchedOn: 'exact_name' },
    { matches: prefix, matchedOn: 'prefix_name' },
    { matches: substring, matchedOn: 'substring_name' },
  ];

  for (const tier of tiers) {
    if (tier.matches.length === 1) {
      const brand = tier.matches[0];
      return { ok: true, brandSlug: brand.slug, brand, matchedOn: tier.matchedOn };
    }
    if (tier.matches.length > 1) {
      // Deliberately does NOT fall through to a looser tier: several plausible
      // brands is a question for a human, not a reason to guess harder.
      // LeeFar is the live case — a shop literally named "LeeFar" matches all
      // three stores and must not silently land on the first one.
      const slugs = tier.matches.map((b) => b.slug).sort();
      return {
        ok: false,
        reason: 'ambiguous_match',
        message: `Shop name "${rawName}" matches ${slugs.length} brands: ${slugs.join(', ')}. Pick one explicitly.`,
        candidates: slugs,
      };
    }
  }

  // Nothing among the stores. If the name points at an UMBRELLA, say so and
  // name its stores — that is a far more actionable error than "unknown".
  const umbrellaHit = reg.rows.find(
    (b) => b.is_umbrella && [b.slug, b.name, b.display_name ?? ''].map(normalize).some((k) => k.length > 0 && (k === shopKey || shopKey.startsWith(k) || k.startsWith(shopKey))),
  );
  if (umbrellaHit) {
    const stores = umbrellaStoreSlugs(reg, umbrellaHit);
    return {
      ok: false,
      reason: 'umbrella_slug',
      message:
        `Shop name "${rawName}" resolves to the umbrella "${umbrellaHit.slug}", which has no fact-table rows. ` +
        `Pick the specific store: ${stores.join(', ') || '(no store rows)'}.`,
      candidates: stores,
    };
  }

  return {
    ok: false,
    reason: 'unknown_brand',
    message:
      `Shop name "${rawName}"${shop.shopId ? ` (shop ${shop.shopId})` : ''} matches no brand in brands_v2. ` +
      `Connect it by choosing the brand explicitly, or add the brand first.`,
  };
}

/** Throwing wrapper for call sites that genuinely cannot continue (an ingest
 *  job with nowhere to write). Prefer handling the result union in request
 *  paths so the operator sees `message` and `candidates`. */
export function resolveShopToBrandSlugOrThrow(reg: BrandRegistry, shop: ShopIdentity): string {
  const result = resolveShopToBrandSlug(reg, shop);
  if (!result.ok) throw new Error(`[tiktok/brand-resolution] ${result.reason}: ${result.message}`);
  return result.brandSlug;
}
