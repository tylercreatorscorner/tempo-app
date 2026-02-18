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
  toplux: 'TopLux',
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

/** App name */
export const APP_NAME = 'Tempo';
export const APP_DESCRIPTION = 'TikTok Shop Analytics';
