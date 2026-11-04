import 'server-only';
import { can } from '@/lib/auth/permissions';
import type { WorkspaceScope } from '@/lib/auth/workspace-scope';
import type { createAdminClient } from '@/lib/supabase/server';

type Client = Awaited<ReturnType<typeof createAdminClient>>;
const PAGE = 1000;
const MAX_PAGES = 50;

/** Legacy RPCs accept slugs rather than tenant IDs. Deny ambiguous namespaces. */
export async function assertLegacyPostSlugScope(client: Client, tenantId: string, brands: string[]): Promise<void> {
  if (!tenantId || !brands.length) throw new Error('Video data is unavailable for this workspace.');
  const { data, error } = await client.from('brands_v2').select('slug')
    .in('slug', brands).neq('tenant_id', tenantId).limit(1).abortSignal(AbortSignal.timeout(5_000));
  if (error || !data || data.length) throw new Error('Video data is unavailable for this workspace.');
}

/** Reviews have no tenant key, so the reviewer's retained profile supplies provenance. */
async function tenantReviewerIds(client: Client, scope: WorkspaceScope, signal: AbortSignal): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await client.from('user_profiles').select('user_id')
      .eq('tenant_id', scope.tenantId).order('user_id').range(page * PAGE, (page + 1) * PAGE - 1).abortSignal(signal);
    if (error || !data) throw new Error('Team review access could not be verified.');
    ids.push(...data.map(row => String(row.user_id)));
    if (data.length < PAGE) {
      if (!ids.includes(scope.userId)) throw new Error('Team review access could not be verified.');
      return [...new Set(ids)];
    }
  }
  throw new Error('Team review access exceeds the readable window.');
}

/** Cross-brand video identity is preserved inside the caller's workspace only. */
export async function readTenantVideoReviews(client: Client, scope: WorkspaceScope, options: {
  videoId?: string; includeNotes?: boolean;
} = {}): Promise<Record<string, unknown>[]> {
  if (!can(scope, 'posts', 'read')) throw new Error('Not permitted to read video reviews.');
  const signal = AbortSignal.timeout(5_000);
  const reviewerIds = await tenantReviewerIds(client, scope, signal);
  const columns = options.includeNotes
    ? 'id,video_id,reviewer_user_id,reviewer_name,rating,notes,tags,created_at,updated_at'
    : 'id,video_id,reviewer_user_id,rating,tags';
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < reviewerIds.length; offset += 150) {
    let complete = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      let query = client.from('video_reviews').select(columns)
        .in('reviewer_user_id', reviewerIds.slice(offset, offset + 150)).order('id')
        .range(page * PAGE, (page + 1) * PAGE - 1);
      if (options.videoId) query = query.eq('video_id', options.videoId);
      const { data, error } = await query.abortSignal(signal);
      if (error || !data) throw new Error('Video review history could not be loaded.');
      rows.push(...data as unknown as Record<string, unknown>[]);
      if (data.length < PAGE) { complete = true; break; }
    }
    if (!complete) throw new Error('Video review history exceeds the readable window.');
  }
  return options.includeNotes ? rows.sort((left, right) => String(right.updated_at ?? '').localeCompare(String(left.updated_at ?? ''))) : rows;
}

/** Validate the actual scoped video association before reading any private notes. */
export async function postVideoAssociation(client: Client, scope: WorkspaceScope, videoId: string, brand: string): Promise<
  { status: 403 | 404 | 500; error: string } | null
> {
  if (!can(scope, 'posts', 'read') || scope.brandScope.kind === 'scoped' && !scope.brandScope.brandSlugs.includes(brand)) return { status: 403, error: 'Forbidden: brand not in your access' };
  if (!videoId || videoId.length > 256 || !brand || brand.length > 100) return { status: 404, error: 'Video not found for this brand' };
  const signal = AbortSignal.timeout(5_000);
  const { data: brandRow, error: brandError } = await client.from('brands_v2').select('id')
    .eq('tenant_id', scope.tenantId).eq('slug', brand).abortSignal(signal).maybeSingle();
  if (brandError) return { status: 500, error: 'Brand access could not be verified' };
  if (!brandRow) return { status: 404, error: 'Video not found for this brand' };
  const { data: video, error } = await client.from('videos').select('video_id')
    .eq('tenant_id', scope.tenantId).eq('brand', brand).eq('video_id', videoId).limit(1).abortSignal(signal).maybeSingle();
  if (error) return { status: 500, error: 'Video access could not be verified' };
  return video ? null : { status: 404, error: 'Video not found for this brand' };
}
