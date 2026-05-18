/**
 * Per-user Workspace scope resolver.
 *
 * The "Workspace" (the `(admin)` route group + its ~100 API routes) was
 * originally written assuming "internal user = sees the entire tenant". To
 * support agency operators ("managers") who should only see the brands
 * assigned to them, every Workspace data path must resolve scope through
 * THIS helper instead of the copy-pasted `getTenantId()` it replaces.
 *
 * Scope rules:
 *   - owner / admin / viewer  -> full tenant (brandScope = { kind: 'all' })
 *   - manager                 -> only brands in user_brand_access
 *   - brand / creator         -> not Workspace users; returns null (the
 *                                middleware already bounces them, this is
 *                                fail-closed defense-in-depth)
 *
 * A manager with zero assigned brands resolves to an EMPTY scoped list.
 * Callers must apply that list with `.in('brand', slugs)` / `.in('brand_id',
 * ids)` so the fail-closed behavior is "see nothing", never "see all".
 */
import { createClient, createAdminClient } from '@/lib/supabase/server';

/** Roles that get the full tenant view (no per-brand narrowing). */
const FULL_TENANT_ROLES = new Set(['owner', 'admin', 'viewer']);

export type BrandScope =
  | { kind: 'all' }
  | { kind: 'scoped'; brandIds: string[]; brandSlugs: string[] };

export interface WorkspaceScope {
  userId: string;
  email: string;
  name: string | null;
  tenantId: string;
  role: string;
  brandScope: BrandScope;
}

/**
 * Resolves the current user's Workspace scope, or null if they aren't a
 * Workspace user (unauthenticated, no profile, no tenant, or a
 * brand/creator-portal role). Routes should treat null as 401/redirect.
 */
export async function getWorkspaceScope(): Promise<WorkspaceScope | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = await createAdminClient();
  const { data: profile } = await admin
    .from('user_profiles')
    .select('user_id, email, name, role, tenant_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile || !profile.tenant_id || !profile.role) return null;

  const role = profile.role as string;

  // brand/creator portal roles are not Workspace users — fail closed.
  if (role === 'brand' || role === 'brand_contact' || role === 'creator') {
    return null;
  }

  const base = {
    userId: profile.user_id as string,
    email: (profile.email ?? user.email ?? '') as string,
    name: (profile.name ?? null) as string | null,
    tenantId: profile.tenant_id as string,
    role,
  };

  if (FULL_TENANT_ROLES.has(role)) {
    return { ...base, brandScope: { kind: 'all' } };
  }

  if (role === 'manager') {
    const { data: accessRows } = await admin
      .from('user_brand_access')
      .select('brand_id')
      .eq('user_id', profile.user_id)
      .eq('tenant_id', profile.tenant_id);

    const brandIds = [...new Set((accessRows ?? []).map((r) => r.brand_id as string))];

    let brandSlugs: string[] = [];
    if (brandIds.length > 0) {
      const { data: brands } = await admin
        .from('brands_v2')
        .select('slug')
        .in('id', brandIds)
        .eq('tenant_id', profile.tenant_id);
      brandSlugs = (brands ?? [])
        .map((b) => b.slug as string | null)
        .filter((s): s is string => !!s);
    }

    return { ...base, brandScope: { kind: 'scoped', brandIds, brandSlugs } };
  }

  // Unknown internal role — fail closed rather than leak the full tenant.
  return null;
}

/**
 * True if the given brand (slug or uuid) is visible under this scope.
 * Use in single-brand routes/pages to reject out-of-scope brand params.
 */
export function isBrandInScope(
  scope: WorkspaceScope,
  brand: { slug?: string | null; id?: string | null },
): boolean {
  if (scope.brandScope.kind === 'all') return true;
  if (brand.slug && scope.brandScope.brandSlugs.includes(brand.slug)) return true;
  if (brand.id && scope.brandScope.brandIds.includes(brand.id)) return true;
  return false;
}
