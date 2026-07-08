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
import { getActiveManagerId } from '@/lib/auth/platform-admin';

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
  /** False for a brand-scoped member the owner has walled off from Finance.
   *  Owner/admin/viewer are always true. THE finance access gate — checked by the
   *  finance pages + every /api/earnings|invoices|payments route. */
  canViewFinance: boolean;
  brandScope: BrandScope;
  /** Set when a platform admin is "viewing as" this member (read-only preview). */
  impersonating?: { userId: string; name: string | null };
}

type ProfileRow = {
  user_id: string; email: string | null; name: string | null;
  role: string | null; tenant_id: string | null; can_view_finance: boolean | null;
};

/** Builds a WorkspaceScope from a user_profiles row (the shared role→scope logic
 *  used for both the caller and an impersonated member). Returns null for
 *  non-Workspace roles / incomplete profiles (fail-closed). */
async function scopeFromProfile(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  profile: ProfileRow | null,
  emailFallback?: string,
): Promise<WorkspaceScope | null> {
  if (!profile || !profile.tenant_id || !profile.role) return null;
  const role = profile.role;
  if (role === 'brand' || role === 'brand_contact' || role === 'creator') return null;

  // Owner/admin/viewer always see finance; a manager sees it only if their flag is
  // set (column defaults true — new finance-blind members are invited with false).
  const canViewFinance = FULL_TENANT_ROLES.has(role) ? true : (profile.can_view_finance ?? true);
  const base = {
    userId: profile.user_id,
    email: profile.email ?? emailFallback ?? '',
    name: profile.name ?? null,
    tenantId: profile.tenant_id,
    role,
    canViewFinance,
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
        .from('brands_v2').select('slug').in('id', brandIds).eq('tenant_id', profile.tenant_id);
      brandSlugs = (brands ?? []).map((b) => b.slug as string | null).filter((s): s is string => !!s);
    }
    return { ...base, brandScope: { kind: 'scoped', brandIds, brandSlugs } };
  }

  // Unknown internal role — fail closed rather than leak the full tenant.
  return null;
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

  // "View as" impersonation: a platform admin previewing a specific member.
  // getActiveManagerId is cookie-first + platform-admin-gated (null otherwise),
  // so this only fires for an admin who explicitly switched. We resolve scope AS
  // the target member, so every scope-honoring surface renders their view.
  const impersonatedId = await getActiveManagerId();
  if (impersonatedId && impersonatedId !== user.id) {
    const { data: target } = await admin
      .from('user_profiles')
      .select('user_id, email, name, role, tenant_id, can_view_finance')
      .eq('user_id', impersonatedId)
      .maybeSingle();
    // Only ever impersonate a MANAGER — never resolve a full-tenant role (guards
    // against role-drift on a stale cookie escalating the view to {kind:'all'}).
    const targetRow = target as ProfileRow | null;
    if (targetRow?.role === 'manager') {
      const targetScope = await scopeFromProfile(admin, targetRow);
      if (targetScope) {
        return { ...targetScope, impersonating: { userId: targetScope.userId, name: targetScope.name } };
      }
    }
    // Invalid/stale/non-manager target → fall through to the admin's own scope.
  }

  const { data: profile } = await admin
    .from('user_profiles')
    .select('user_id, email, name, role, tenant_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return scopeFromProfile(admin, profile as ProfileRow | null, user.email ?? undefined);
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
