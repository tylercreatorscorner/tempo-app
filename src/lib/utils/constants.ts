/** Brand color mapping — dynamic, keyed by brand slug */
export const BRAND_COLORS: Record<string, string> = {
  jiyu: '#E91E8C',
  catakor: '#00C853',
  physicians_choice: '#2196F3',
  toplux: '#FF9800',
};

/** Brand display name mapping */
export const BRAND_DISPLAY_NAMES: Record<string, string> = {
  jiyu: 'JiYu',
  catakor: 'Catakor',
  physicians_choice: "Physician's Choice",
  toplux: 'Toplux',
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
export const ACTIVE_BRANDS = ['jiyu', 'catakor', 'physicians_choice'] as const;
export type ActiveBrand = (typeof ACTIVE_BRANDS)[number];

/** Brand slug → UUID mapping for v2 database tables */
export const BRAND_UUID_MAP: Record<string, string> = {
  catakor: 'b0000000-0000-0000-0000-000000000001',
  physicians_choice: 'b0000000-0000-0000-0000-000000000002',
  jiyu: 'b0000000-0000-0000-0000-000000000003',
  toplux: 'b0000000-0000-0000-0000-000000000004',
};

/** UUID → brand slug reverse mapping */
export const BRAND_SLUG_MAP: Record<string, string> = {
  'b0000000-0000-0000-0000-000000000001': 'catakor',
  'b0000000-0000-0000-0000-000000000002': 'physicians_choice',
  'b0000000-0000-0000-0000-000000000003': 'jiyu',
  'b0000000-0000-0000-0000-000000000004': 'toplux',
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
