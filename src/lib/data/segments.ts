import type { DatePreset } from './date-utils';

/**
 * A Segment's `filter_criteria` is a serialized snapshot of the roster's
 * filter state. Every key maps 1:1 to a `/api/roster` query param, so a
 * segment "resolves" to a creator list simply by replaying it through the
 * existing roster endpoint — there is no separate resolver/aggregation.
 */
export interface SegmentFilterCriteria {
  brand?: string | null;                    // brand slug | 'all' | null
  view?: 'managed' | 'unmanaged' | 'all';   // My Creators toggle
  status?: string | null;                   // managed_creators.status
  health?: string | null;                   // healthy|behind|silent|churned|no_data|low_roi
  product?: string | null;                  // products.product_key tag
  search?: string | null;
  range?: DatePreset | null;                // date preset, or 'custom'
  start?: string | null;                    // ISO yyyy-MM-dd (range === 'custom')
  end?: string | null;
  min_gmv?: number | null;                  // period-GMV floor  (post-enrichment)
  max_gmv?: number | null;                  // period-GMV ceiling
  min_posts?: number | null;                // period-posts floor
}

export interface Segment {
  id: string;
  tenant_id: string;
  brand_id: string | null;
  name: string;
  description: string | null;
  kind: 'prebuilt' | 'custom';
  prebuilt_key: string | null;
  filter_criteria: SegmentFilterCriteria;
  status: 'active' | 'archived';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Build the `/api/roster` query string that resolves a segment's criteria to
 * the same creator list the roster would show. Used for live counts and for
 * "open this segment on the roster".
 */
export function criteriaToRosterParams(c: SegmentFilterCriteria): URLSearchParams {
  const p = new URLSearchParams();
  if (c.brand && c.brand !== 'all') p.set('brand', c.brand);
  // My Creators toggle → the roster's include / managed params.
  if (c.view === 'all') p.set('include', 'all');
  else if (c.view === 'unmanaged') { p.set('include', 'all'); p.set('managed', 'unmanaged'); }
  if (c.status && c.status !== 'all') p.set('status', c.status);
  if (c.health && c.health !== 'all') p.set('health', c.health);
  if (c.product) p.set('product', c.product);
  if (c.search) p.set('search', c.search);
  if (c.range) {
    p.set('range', c.range);
    if (c.range === 'custom' && c.start && c.end) { p.set('start', c.start); p.set('end', c.end); }
  }
  if (c.min_gmv != null) p.set('min_gmv', String(c.min_gmv));
  if (c.max_gmv != null) p.set('max_gmv', String(c.max_gmv));
  if (c.min_posts != null) p.set('min_posts', String(c.min_posts));
  return p;
}

/** Human-readable one-line summary of a segment's criteria (for the list UI). */
export function describeCriteria(c: SegmentFilterCriteria): string {
  const parts: string[] = [];
  if (c.view === 'unmanaged') parts.push('Unmanaged');
  else if (c.view === 'all') parts.push('All creators');
  else parts.push('Managed');
  if (c.brand && c.brand !== 'all') parts.push(c.brand);
  if (c.product) parts.push(`product: ${c.product}`);
  if (c.status && c.status !== 'all') parts.push(c.status);
  if (c.health && c.health !== 'all') parts.push(c.health);
  if (c.min_gmv != null) parts.push(`GMV ≥ $${Number(c.min_gmv).toLocaleString()}`);
  if (c.max_gmv != null) parts.push(`GMV ≤ $${Number(c.max_gmv).toLocaleString()}`);
  if (c.min_posts != null) parts.push(`${c.min_posts}+ posts`);
  if (c.range) parts.push(c.range === 'custom' ? `${c.start ?? ''}–${c.end ?? ''}` : c.range);
  return parts.join(' · ');
}
