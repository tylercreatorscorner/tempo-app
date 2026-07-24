/**
 * Shared plumbing for the /api/broadcasts routes: request-criteria loading
 * (inline criteria vs saved segment), the brand-scope targeting guard, and
 * the grouped recipient-status counts.
 *
 * broadcasts / broadcast_recipients are RLS-no-policy (service-role only) —
 * every read/write goes through createAdminClient, so tenant + brand scoping
 * MUST be enforced here in code.
 */
import { createAdminClient } from '@/lib/supabase/server';
import type { WorkspaceScope } from '@/lib/auth/workspace-scope';
import type { SegmentFilterCriteria } from '@/lib/data/segments';
import { BROADCAST_CHANNELS, type BroadcastChannel } from './audience';

export interface BroadcastRow {
  id: string;
  tenant_id: string | null;
  segment_id: string | null;
  audience_label: string;
  criteria: SegmentFilterCriteria;
  channel: BroadcastChannel;
  template_key: string | null;
  body: string;
  status: 'queued' | 'sending' | 'done' | 'failed' | 'canceled';
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface RecipientCounts {
  pending: number;
  sent: number;
  delivered: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
}

export function emptyCounts(): RecipientCounts {
  return { pending: 0, sent: 0, delivered: 0, failed: 0, blocked: 0, skipped: 0, total: 0 };
}

export function parseChannel(v: unknown): BroadcastChannel | null {
  return typeof v === 'string' && (BROADCAST_CHANNELS as readonly string[]).includes(v)
    ? (v as BroadcastChannel)
    : null;
}

export type CriteriaLoad =
  | { ok: true; criteria: SegmentFilterCriteria; segmentId: string | null; segmentName: string | null }
  | { ok: false; status: 400 | 404; error: string };

/**
 * Resolve the request's targeting: explicit `criteria` wins; otherwise the
 * saved segment's snapshot (tenant-checked). One of the two is required.
 */
export async function loadRequestCriteria(
  scope: WorkspaceScope,
  body: { segmentId?: unknown; criteria?: unknown },
): Promise<CriteriaLoad> {
  const segmentId = typeof body.segmentId === 'string' && body.segmentId ? body.segmentId : null;
  const explicit = body.criteria && typeof body.criteria === 'object' && !Array.isArray(body.criteria)
    ? (body.criteria as SegmentFilterCriteria)
    : null;

  if (explicit) return { ok: true, criteria: explicit, segmentId, segmentName: null };
  if (!segmentId) return { ok: false, status: 400, error: 'criteria or segmentId is required' };

  const admin = await createAdminClient();
  const { data: seg, error } = await admin
    .from('segments')
    .select('id, name, filter_criteria')
    .eq('id', segmentId)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();
  if (error) return { ok: false, status: 400, error: error.message };
  if (!seg) return { ok: false, status: 404, error: 'Segment not found' };

  const row = seg as { id: string; name: string | null; filter_criteria: SegmentFilterCriteria | null };
  return { ok: true, criteria: row.filter_criteria ?? {}, segmentId: row.id, segmentName: row.name };
}

/**
 * Brand-scope targeting guard: a brand-scoped manager may only target criteria
 * whose brand is inside their scope — 'all'-brand audiences are owner-only.
 * Returns the 403 message, or null when allowed. (The roster core would
 * fail-close anyway; rejecting here gives an honest error instead of an
 * empty audience.)
 */
export function brandScopeViolation(
  scope: WorkspaceScope,
  criteria: SegmentFilterCriteria,
): string | null {
  if (scope.brandScope.kind === 'all') return null;
  const brand = criteria.brand;
  if (!brand || brand === 'all') {
    return 'Forbidden: brand-scoped users must target a specific brand';
  }
  if (!scope.brandScope.brandSlugs.includes(brand)) {
    return 'Forbidden: brand not in your access';
  }
  return null;
}

/** True when this scoped user may SEE a stored broadcast (same rule as targeting). */
export function canViewBroadcast(scope: WorkspaceScope, b: BroadcastRow): boolean {
  return brandScopeViolation(scope, b.criteria ?? {}) === null;
}

/**
 * Recipient status counts for a set of broadcasts — ONE grouped read (a single
 * paged select of (broadcast_id, status), aggregated in JS), never per-
 * broadcast N+1. PostgREST aggregates are disabled on this project, so the
 * grouping happens client-side; the id list stays ≤50 (the list-route cap).
 */
export async function fetchRecipientCounts(
  broadcastIds: string[],
): Promise<Map<string, RecipientCounts>> {
  const out = new Map<string, RecipientCounts>();
  if (broadcastIds.length === 0) return out;
  const admin = await createAdminClient();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('broadcast_recipients')
      .select('broadcast_id, status')
      .in('broadcast_id', broadcastIds)
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) {
      console.error('[comms/broadcasts] recipient counts read failed:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    for (const r of data as { broadcast_id: string; status: string }[]) {
      const c = out.get(r.broadcast_id) ?? emptyCounts();
      // 'sending' is transient (in-flight for ≤ one cron tick) — surfaced as
      // pending so the counts always sum to total.
      const key = r.status === 'sending' ? 'pending' : r.status;
      if (key in c) c[key as keyof RecipientCounts] += 1;
      c.total += 1;
      out.set(r.broadcast_id, c);
    }
    if (data.length < 1000) break;
  }
  return out;
}
