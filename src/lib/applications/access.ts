import { createAdminClient } from '@/lib/supabase/server';
import { can } from '@/lib/auth/permissions';
import { isBrandInScope, type WorkspaceScope } from '@/lib/auth/workspace-scope';

export type ApplicationBrand = { id: string; tenant_id: string; slug: string; name: string; display_name: string | null; is_archived: boolean };

export async function applicationBrand(scope: WorkspaceScope, brandId: string): Promise<ApplicationBrand | null> {
  if (!can(scope, 'roster', 'read') || scope.impersonating) return null;
  const db = await createAdminClient();
  const { data, error } = await db.from('brands_v2')
    .select('id,tenant_id,slug,name,display_name,is_archived')
    .eq('id', brandId).eq('tenant_id', scope.tenantId).maybeSingle();
  if (error || !data || data.is_archived || !isBrandInScope(scope, data)) return null;
  return data as ApplicationBrand;
}

/** Decision authority is the current accountable assignment, never broad brand access. */
export async function isAssignedApplicationManager(scope: WorkspaceScope, brand: ApplicationBrand): Promise<boolean> {
  if (scope.impersonating || !can(scope, 'roster', 'write') || !isBrandInScope(scope, brand)) return false;
  const db = await createAdminClient();
  const { data, error } = await db.from('brand_manager_assignments')
    .select('manager_user_id').eq('brand_id', brand.id).maybeSingle();
  return !error && data?.manager_user_id === scope.userId;
}
