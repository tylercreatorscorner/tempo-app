/** Brand color mapping — dynamic, keyed by brand slug */
export const BRAND_COLORS: Record<string, string> = {
  jiyu: '#E91E8C',
  catakor: '#00C853',
  physicians_choice: '#2196F3',
  toplux: '#FF9800',
  leefar: '#8BC34A',
  leefar_nutrition: '#8BC34A',
  leefar_supplements: '#66BB6A',
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

/** Active brands - only these appear in brand tags and filters */
export const ACTIVE_BRANDS = ['jiyu', 'catakor', 'leefar_nutrition', 'leefar_supplements', 'physicians_choice'] as const;
export type ActiveBrand = (typeof ACTIVE_BRANDS)[number];

/**
 * Brands with active data pipelines (scraper/CSV).
 * ONLY these brand IDs are allowed to write to v2 data tables.
 * Toplux is excluded — no data access, no writes, ever.
 */
export const DATA_ENABLED_BRANDS = ['jiyu', 'catakor', 'physicians_choice', 'leefar_nutrition', 'leefar_supplements'] as const;
export const DATA_ENABLED_BRAND_IDS = new Set([
  'b0000000-0000-0000-0000-000000000001', // catakor
  'b0000000-0000-0000-0000-000000000002', // physicians_choice
  'b0000000-0000-0000-0000-000000000003', // jiyu
  'b0000000-0000-0000-0000-000000000006', // leefar_nutrition
  'b0000000-0000-0000-0000-000000000007', // leefar_supplements
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
  leefar_nutrition: 'b0000000-0000-0000-0000-000000000006',
  leefar_supplements: 'b0000000-0000-0000-0000-000000000007',
};

/** UUID → brand slug reverse mapping */
export const BRAND_SLUG_MAP: Record<string, string> = {
  'b0000000-0000-0000-0000-000000000001': 'catakor',
  'b0000000-0000-0000-0000-000000000002': 'physicians_choice',
  'b0000000-0000-0000-0000-000000000003': 'jiyu',
  'b0000000-0000-0000-0000-000000000004': 'toplux',
  'b0000000-0000-0000-0000-000000000006': 'leefar_nutrition',
  'b0000000-0000-0000-0000-000000000007': 'leefar_supplements',
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
