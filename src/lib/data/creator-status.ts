export type CreatorStatus = 'crushing_it' | 'on_track' | 'slacking' | 'new';

export interface CreatorStatusInfo {
  status: CreatorStatus;
  label: string;
  color: string;       // text/border color
  bgColor: string;     // background color
  dotColor: string;    // dot/badge color
}

export const STATUS_CONFIG: Record<CreatorStatus, Omit<CreatorStatusInfo, 'status'>> = {
  crushing_it: { label: 'Crushing It', color: '#16a34a', bgColor: '#f0fdf4', dotColor: '#22c55e' },
  on_track:    { label: 'On Track',    color: '#2563eb', bgColor: '#eff6ff', dotColor: '#3b82f6' },
  slacking:    { label: 'Slacking',    color: '#dc2626', bgColor: '#fef2f2', dotColor: '#ef4444' },
  new:         { label: 'New',         color: '#6b7280', bgColor: '#f9fafb', dotColor: '#9ca3af' },
};

export const ALL_STATUSES: CreatorStatus[] = ['crushing_it', 'on_track', 'slacking', 'new'];

export function getStatusInfo(status: CreatorStatus): CreatorStatusInfo {
  return { status, ...STATUS_CONFIG[status] };
}

interface CreatorForStatus {
  total_videos: number;
  total_gmv: number;
  days_active: number;
  prev_gmv?: number;
  brand?: string;
}

/**
 * Classify a creator's status based on their metrics.
 * 
 * NOTE: days_active = days with sales in the selected period (NOT days since first appearance).
 * For a 7-day range, max days_active is 7. Most active creators have 3-5.
 * 
 * @param creator - Current period metrics
 * @param brandGmvThresholds - Map of brand -> top 20% GMV threshold
 */
export function classifyCreator(
  creator: CreatorForStatus,
  brandGmvThresholds: Map<string, number>,
): CreatorStatus {
  const { total_videos, total_gmv, days_active, prev_gmv, brand } = creator;

  // New: zero sales days AND zero videos (truly no activity)
  if (days_active === 0 && total_videos === 0) return 'new';

  const prevGmv = prev_gmv ?? 0;
  // Only compute growth/decline when prior period has meaningful data (>$10)
  const hasMeaningfulPrior = prevGmv > 10;
  const gmvGrowth = hasMeaningfulPrior ? ((total_gmv - prevGmv) / prevGmv) : 0;
  const gmvDecline = hasMeaningfulPrior ? ((prevGmv - total_gmv) / prevGmv) : 0;

  // Crushing It: top 20% GMV for brand AND (>15% WoW growth OR 5+ videos)
  const brandThreshold = brand ? brandGmvThresholds.get(brand) : undefined;
  const isTopGmv = brandThreshold !== undefined && total_gmv >= brandThreshold;
  if (isTopGmv && (gmvGrowth > 0.15 || total_videos >= 5)) {
    return 'crushing_it';
  }

  // Slacking: 0-1 videos OR >20% GMV decline (with meaningful prior data)
  if (total_videos <= 1 || (hasMeaningfulPrior && gmvDecline > 0.20)) {
    return 'slacking';
  }

  // On Track: 2+ videos AND GMV flat or growing (or no meaningful prior to compare)
  if (total_videos >= 2 && (!hasMeaningfulPrior || gmvDecline <= 0.15)) {
    return 'on_track';
  }

  // Default: slight decline but still posting = on_track
  return 'on_track';
}

/**
 * Compute top 20% GMV thresholds per brand from a list of creators.
 */
export function computeBrandGmvThresholds(
  creators: { total_gmv: number; brand?: string }[]
): Map<string, number> {
  const byBrand = new Map<string, number[]>();
  for (const c of creators) {
    if (!c.brand) continue;
    const arr = byBrand.get(c.brand) ?? [];
    arr.push(c.total_gmv);
    byBrand.set(c.brand, arr);
  }

  const thresholds = new Map<string, number>();
  for (const [brand, gmvs] of byBrand) {
    gmvs.sort((a, b) => b - a); // descending
    const idx = Math.max(0, Math.ceil(gmvs.length * 0.2) - 1);
    thresholds.set(brand, gmvs[idx] ?? 0);
  }
  return thresholds;
}
