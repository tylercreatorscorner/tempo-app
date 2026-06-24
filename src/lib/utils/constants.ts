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

/**
 * Active brands — the umbrella-grain roster default.
 *
 * Brand identity is now DB-driven (brands_v2); the resolution + label/color
 * maps that used to live here were retired. This hardcoded list survives ONLY
 * as the unscoped default in lib/data/video-sections.ts (getDashboardVideos
 * isn't workspace-scoped yet) — replace it with the scoped roster when the
 * manager-isolation work lands. Everywhere else, use `activeBrandSlugs(reg)`
 * from `@/lib/data/brand-registry`.
 */
export const ACTIVE_BRANDS = ['jiyu', 'catakor', 'leefar', 'physicians_choice', 'lemme'] as const;
export type ActiveBrand = (typeof ACTIVE_BRANDS)[number];

/**
 * Brands with active data pipelines (scraper/CSV) — the write gate in
 * api/tiktok/sync/route.ts: only these slugs may write to the v2 data tables.
 * A deliberate write-permission gate, not a brand-identity map, so it stays
 * hardcoded (re-implement against brands_v2 only if/when that gate moves).
 */
export const DATA_ENABLED_BRANDS = ['jiyu', 'catakor', 'physicians_choice', 'leefar_nutrition', 'leefar_supplements', 'leefar_us', 'lemme'] as const;

/** App name */
export const APP_NAME = 'Tempo';
export const APP_DESCRIPTION = 'TikTok Shop Analytics';
