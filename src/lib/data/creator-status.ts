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
 * @param creator - Current period metrics
 * @param brandGmvThresholds - Map of brand -> top 20% GMV threshold
 */
export function classifyCreator(
  creator: CreatorForStatus,
  brandGmvThresholds: Map<string, number>,
): CreatorStatus {
  const { total_videos, total_gmv, days_active, prev_gmv, brand } = creator;

  // New: less than 7 days of data
  if (days_active < 7) return 'new';

  const prevGmv = prev_gmv ?? 0;
  const gmvGrowth = prevGmv > 0 ? ((total_gmv - prevGmv) / prevGmv) : (total_gmv > 0 ? 1 : 0);
  const gmvDecline = prevGmv > 0 ? ((prevGmv - total_gmv) / prevGmv) : 0;

  // Crushing It: top 20% GMV for brand OR >25% WoW growth OR 5+ videos
  const brandThreshold = brand ? brandGmvThresholds.get(brand) : undefined;
  if (
    (brandThreshold !== undefined && total_gmv >= brandThreshold) ||
    gmvGrowth > 0.25 ||
    total_videos >= 5
  ) {
    return 'crushing_it';
  }

  // Slacking: 0-1 videos OR >30% GMV decline
  if (total_videos <= 1 || gmvDecline > 0.30) {
    return 'slacking';
  }

  // On Track: 2+ videos AND flat/positive GMV trend
  if (total_videos >= 2 && total_gmv >= prevGmv) {
    return 'on_track';
  }

  // Default to slacking if none of the above match
  return 'slacking';
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
