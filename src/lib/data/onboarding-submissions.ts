import type { WorkspaceScope } from '@/lib/auth/workspace-scope';
import { assertCreatorInviteScope, CreatorInviteError } from '@/lib/auth/creator-invite-access';
import { createAdminClient } from '@/lib/supabase/server';

const PAGE_SIZE = 25;

export interface OnboardingSubmission {
  id: string;
  creatorId: string;
  name: string | null;
  email: string | null;
  brandSlug: string;
  brandName: string;
  appliedAt: string | null;
  handles: string[];
  reviewUrl: string;
}

export interface OnboardingSubmissionsResult {
  submissions: OnboardingSubmission[];
  total: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
}

type PendingRow = {
  id: string;
  creator_id: string;
  brand_id: string;
  applied_at: string | null;
  creator: { id: string; real_name: string | null; email: string | null };
  brand: { id: string; slug: string; name: string; display_name: string | null };
};

/** Read-only pending records, regardless of source. This does not approve a creator. */
export async function getOnboardingSubmissions(
  scope: WorkspaceScope,
  brandSlug?: string,
  page = 1,
): Promise<OnboardingSubmissionsResult> {
  assertCreatorInviteScope(scope);
  const db = await createAdminClient();
  let brandId: string | undefined;
  if (brandSlug !== undefined) {
    if (!brandSlug || brandSlug.length > 100) throw new CreatorInviteError('Select an active brand in your workspace.', 400);
    const brand = await db.from('brands_v2').select('id').eq('tenant_id', scope.tenantId)
      .eq('slug', brandSlug).eq('is_archived', false).maybeSingle();
    if (brand.error) throw new CreatorInviteError('Could not load pending creator details. Please retry.', 503);
    if (!brand.data) throw new CreatorInviteError('Select an active brand in your workspace.', 404);
    brandId = brand.data.id;
  }

  const pendingQuery = (head = false) => {
    let query = db.from('creator_brands')
      .select('id,creator_id,brand_id,applied_at,creator:creators_v2!inner(id,real_name,email),brand:brands_v2!inner(id,slug,name,display_name)', { count: 'exact', head })
      .eq('tenant_id', scope.tenantId).eq('creator.tenant_id', scope.tenantId)
      .eq('brand.tenant_id', scope.tenantId).eq('brand.is_archived', false)
      .eq('status', 'Applied').eq('is_managed', false);
    if (brandId) query = query.eq('brand_id', brandId);
    return query;
  };
  const counted = await pendingQuery(true);
  if (counted.error || !Number.isSafeInteger(counted.count) || counted.count === null || counted.count < 0) {
    throw new CreatorInviteError('Could not load pending creator details. Please retry.', 503);
  }
  const total = counted.count;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(Number.isSafeInteger(page) && page > 0 ? page : 1, totalPages);
  const pagination = { total, page: currentPage, pageSize: PAGE_SIZE, totalPages, hasMore: currentPage < totalPages };
  if (total === 0) return { ...pagination, submissions: [] };
  const from = (currentPage - 1) * PAGE_SIZE;
  const result = await pendingQuery().order('applied_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false }).range(from, from + PAGE_SIZE - 1);
  if (result.error || !result.data || result.count !== total || result.data.length !== Math.min(total - from, PAGE_SIZE)) {
    throw new CreatorInviteError('Pending creator details changed or could not be loaded. Please retry.', 503);
  }
  const rows = result.data as unknown as PendingRow[];
  if (rows.some(row => !row.creator || row.creator.id !== row.creator_id || !row.brand || row.brand.id !== row.brand_id)) {
    throw new CreatorInviteError('Could not verify pending creator details. Please retry.', 503);
  }

  const accounts = await db.from('tiktok_accounts')
    .select('creator_id,brand_id,tiktok_username', { count: 'exact' })
    .eq('tenant_id', scope.tenantId)
    .in('creator_id', [...new Set(rows.map(row => row.creator_id))])
    .in('brand_id', [...new Set(rows.map(row => row.brand_id))])
    .order('id').limit(1000);
  // New submissions allow ten handles each. If older records exceed the read
  // bound, show an unavailable state instead of presenting a partial handle list.
  if (accounts.error || !accounts.data || accounts.count === null || accounts.count !== accounts.data.length) {
    throw new CreatorInviteError('Could not load all claimed handles. Please retry.', 503);
  }
  const handlesByRecord = new Map<string, Set<string>>();
  for (const row of accounts.data) {
    const handle = typeof row.tiktok_username === 'string' ? row.tiktok_username.trim().replace(/^@/, '') : '';
    if (!handle) continue;
    const key = `${row.creator_id}:${row.brand_id}`;
    const handles = handlesByRecord.get(key) ?? new Set<string>();
    handles.add(handle);
    handlesByRecord.set(key, handles);
  }
  return {
    ...pagination,
    submissions: rows.map(row => ({
      id: row.id,
      creatorId: row.creator_id,
      name: row.creator.real_name?.trim() || null,
      email: row.creator.email?.trim() || null,
      brandSlug: row.brand.slug,
      brandName: row.brand.display_name || row.brand.name || row.brand.slug,
      appliedAt: row.applied_at && Number.isFinite(Date.parse(row.applied_at)) ? row.applied_at : null,
      handles: [...(handlesByRecord.get(`${row.creator_id}:${row.brand_id}`) ?? [])].sort(),
      reviewUrl: `/creators/${encodeURIComponent(row.creator_id)}?brand=${encodeURIComponent(row.brand.slug)}`,
    })),
  };
}
