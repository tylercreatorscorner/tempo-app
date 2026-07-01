import type { SegmentFilterCriteria } from './segments';

export interface PrebuiltSegment {
  key: string;
  name: string;
  description: string;
  criteria: SegmentFilterCriteria;
}

/**
 * Prebuilt lifecycle segments — fixed definitions shown at the top of the
 * Segments page. They use a fixed trailing-30-day window so a prebuilt means
 * the same thing every time, regardless of the roster's currently-selected
 * period. (Sample-based lifecycle segments like "Never sampled" arrive with
 * the sample-tracking layer.)
 */
export const PREBUILT_SEGMENTS: PrebuiltSegment[] = [
  {
    key: 'top_creators_10k',
    name: 'Top Creators (10K+ GMV)',
    description: 'Managed creators over $10K GMV in the last 30 days.',
    criteria: { view: 'managed', range: 'last30', min_gmv: 10000 },
  },
  {
    key: 'generated_sales',
    name: 'Generated sales',
    description: 'Managed creators with any GMV in the last 30 days.',
    criteria: { view: 'managed', range: 'last30', min_gmv: 0.01 },
  },
  {
    key: 'posted_video',
    name: 'Posted a video',
    description: 'Managed creators who posted at least once in the last 30 days.',
    criteria: { view: 'managed', range: 'last30', min_posts: 1 },
  },
  {
    key: 'going_silent',
    name: 'Going silent',
    description: 'Managed creators with no post in 14+ days.',
    criteria: { view: 'managed', range: 'last30', health: 'silent' },
  },
];

export function getPrebuilt(key: string): PrebuiltSegment | undefined {
  return PREBUILT_SEGMENTS.find((s) => s.key === key);
}
