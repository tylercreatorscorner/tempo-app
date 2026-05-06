/** Brand color mapping — dynamic, keyed by brand slug */
export const BRAND_COLORS: Record<string, string> = {
  jiyu: '#E91E8C',
  catakor: '#00C853',
  physicians_choice: '#2196F3',
  toplux: '#FF9800',
  leefar: '#8BC34A',
  leefar_nutrition: '#8BC34A',
  leefar_supplements: '#66BB6A',
  lemme: '#FFC700',
};

/** Brand display name mapping */
export const BRAND_DISPLAY_NAMES: Record<string, string> = {
  jiyu: 'JiYu',
  catakor: 'Cata-Kor',
  physicians_choice: "Physician's Choice",
  toplux: 'Toplux',
  leefar: 'LeeFar',
  leefar_nutrition: 'LeeFar Nutrition',
  leefar_supplements: 'LeeFar Supplements',
  lemme: 'Lemme',
};

/** Get brand color with fallback */
export function getBrandColor(brand: string): string {
  return BRAND_COLORS[brand.toLowerCase().replace(/['\s]/g, '_')] ?? '#6B7280';
}

/** Date range preset options for selectors */
export const DATE_RANGE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last14', label: 'Last 14 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'thisQuarter', label: 'This quarter' },
] as const;

/** Active brands - only these appear in brand tags and filters.
 *
 * LeeFar lives here as the umbrella slug 'leefar' — managed_creators rows
 * are keyed to the umbrella, so the brand picker shows ONE LeeFar option.
 * The underlying store slugs (leefar_nutrition, leefar_supplements) still
 * exist in BRAND_DISPLAY_NAMES + DATA_ENABLED_BRANDS for performance data
 * (creator_performance, videos, etc.), which is keyed by store. */
export const ACTIVE_BRANDS = ['jiyu', 'catakor', 'leefar', 'physicians_choice', 'lemme'] as const;
export type ActiveBrand = (typeof ACTIVE_BRANDS)[number];

/** LeeFar store slugs — used when expanding 'leefar' to per-store performance lookups. */
export const LEEFAR_STORE_SLUGS = ['leefar_nutrition', 'leefar_supplements'] as const;

/** Brand slugs that exist in the data layer but should not appear in the UI brand
 * picker. LeeFar's per-store slugs are hidden because the umbrella 'leefar' is
 * the canonical roster brand — performance queries expand the umbrella back to
 * the store slugs at fetch time. */
export const HIDDEN_FROM_PICKER: ReadonlySet<string> = new Set([
  'leefar_nutrition',
  'leefar_supplements',
]);

/** Expand a roster brand slug to the actual data-table brand slugs. For LeeFar
 * the roster uses the umbrella but performance data is keyed by store. */
export function expandBrandToDataSlugs(brand: string): readonly string[] {
  if (brand === 'leefar') return LEEFAR_STORE_SLUGS;
  return [brand];
}

/**
 * Brands with active data pipelines (scraper/CSV).
 * ONLY these brand IDs are allowed to write to v2 data tables.
 * Toplux is excluded — no data access, no writes, ever.
 */
export const DATA_ENABLED_BRANDS = ['jiyu', 'catakor', 'physicians_choice', 'leefar_nutrition', 'leefar_supplements', 'lemme'] as const;
export const DATA_ENABLED_BRAND_IDS = new Set([
  'b0000000-0000-0000-0000-000000000001', // catakor
  'b0000000-0000-0000-0000-000000000002', // physicians_choice
  'b0000000-0000-0000-0000-000000000003', // jiyu
  'b0000000-0000-0000-0000-000000000006', // leefar_nutrition
  'b0000000-0000-0000-0000-000000000007', // leefar_supplements
  'b0000000-0000-0000-0000-000000000008', // lemme
]);

/** Validate a brand_id is allowed to have data written. Throws if not. */
export function assertDataWriteAllowed(brandId: string, context?: string): void {
  if (!DATA_ENABLED_BRAND_IDS.has(brandId)) {
    throw new Error(
      `DATA WRITE BLOCKED: brand_id ${brandId} is not in DATA_ENABLED_BRAND_IDS. ` +
      `Only brands with active data pipelines can write data. ` +
      (context ? `Context: ${context}` : '')
    );
  }
}

/** Brand slug → UUID mapping for v2 database tables */
export const BRAND_UUID_MAP: Record<string, string> = {
  catakor: 'b0000000-0000-0000-0000-000000000001',
  physicians_choice: 'b0000000-0000-0000-0000-000000000002',
  jiyu: 'b0000000-0000-0000-0000-000000000003',
  toplux: 'b0000000-0000-0000-0000-000000000004',
  leefar: 'b0000000-0000-0000-0000-000000000005',
  leefar_nutrition: 'b0000000-0000-0000-0000-000000000006',
  leefar_supplements: 'b0000000-0000-0000-0000-000000000007',
  lemme: 'b0000000-0000-0000-0000-000000000008',
};

/** UUID → brand slug reverse mapping */
export const BRAND_SLUG_MAP: Record<string, string> = {
  'b0000000-0000-0000-0000-000000000001': 'catakor',
  'b0000000-0000-0000-0000-000000000002': 'physicians_choice',
  'b0000000-0000-0000-0000-000000000003': 'jiyu',
  'b0000000-0000-0000-0000-000000000004': 'toplux',
  'b0000000-0000-0000-0000-000000000005': 'leefar',
  'b0000000-0000-0000-0000-000000000006': 'leefar_nutrition',
  'b0000000-0000-0000-0000-000000000007': 'leefar_supplements',
  'b0000000-0000-0000-0000-000000000008': 'lemme',
};

/** Convert brand slug to UUID, returns undefined if not found */
export function brandSlugToUuid(slug: string): string | undefined {
  return BRAND_UUID_MAP[slug.toLowerCase().replace(/['\s]/g, '_')];
}

/** Convert brand UUID to slug, returns undefined if not found */
export function brandUuidToSlug(uuid: string): string | undefined {
  return BRAND_SLUG_MAP[uuid];
}

/** App name */
export const APP_NAME = 'Tempo';
export const APP_DESCRIPTION = 'TikTok Shop Analytics';
