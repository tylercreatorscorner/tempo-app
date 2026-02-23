export type CreatorStatus = 'star' | 'on_track' | 'at_risk' | 'behind' | 'ghost';

export interface CreatorStatusInfo {
  status: CreatorStatus;
  label: string;
  color: string;
  bgColor: string;
  dotColor: string;
}

export const STATUS_CONFIG: Record<CreatorStatus, Omit<CreatorStatusInfo, 'status'>> = {
  star:     { label: 'Star',     color: '#7c3aed', bgColor: '#f5f3ff', dotColor: '#7c3aed' },
  on_track: { label: 'On Track', color: '#059669', bgColor: '#f0fdf4', dotColor: '#059669' },
  at_risk:  { label: 'At Risk',  color: '#d97706', bgColor: '#fffbeb', dotColor: '#d97706' },
  behind:   { label: 'Behind',   color: '#ea580c', bgColor: '#fff7ed', dotColor: '#ea580c' },
  ghost:    { label: 'Ghost',    color: '#dc2626', bgColor: '#fef2f2', dotColor: '#dc2626' },
};

export const ALL_STATUSES: CreatorStatus[] = ['star', 'on_track', 'at_risk', 'behind', 'ghost'];

export function getStatusInfo(status: CreatorStatus): CreatorStatusInfo {
  return { status, ...STATUS_CONFIG[status] };
}

/**
 * Classify a creator based on number of posts (total_videos) in the period.
 */
export function classifyCreator(totalVideos: number): CreatorStatus {
  if (totalVideos >= 8) return 'star';
  if (totalVideos >= 6) return 'on_track';
  if (totalVideos >= 4) return 'at_risk';
  if (totalVideos >= 1) return 'behind';
  return 'ghost';
}
