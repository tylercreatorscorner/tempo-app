import 'server-only';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope, isBrandInScope } from '@/lib/auth/workspace-scope';
import { getActiveTenantId } from '@/lib/auth/platform-admin';
import { can } from '@/lib/auth/permissions';

export interface DashboardManager {
  id: string;
  name: string;
  avatar: string | null;
  brands: string[];
}

/** Internal reporting only. Reauthorize requested brands before privileged identity reads. */
export async function getDashboardManagers(requestedSlugs: string[]): Promise<DashboardManager[] | null | undefined> {
  const scope = await getWorkspaceScope();
  if (!scope || !can(scope, 'reporting', 'read')) return undefined;
  if (!requestedSlugs.length) return [];
  const client = await createClient();
  const tenantId = await getActiveTenantId();
  let query = client.from('brands_v2').select('id,slug,tenant_id').in('slug', requestedSlugs).eq('is_archived', false);
  if (tenantId) query = query.eq('tenant_id', tenantId);
  const { data, error } = await query;
  if (error) return null;
  const brands = (data ?? []).filter(brand => isBrandInScope(scope, brand));
  if (!brands.length) return [];
  const admin = await createAdminClient();
  const { data: assignments, error: assignmentError } = await admin.from('brand_manager_assignments')
    .select('brand_id,manager_user_id').in('brand_id', brands.map(brand => brand.id));
  if (assignmentError) return null;
  const managerIds = [...new Set((assignments ?? []).map(row => row.manager_user_id))];
  const profiles = managerIds.length ? await admin.from('user_profiles')
    .select('user_id,name,discord_avatar,tenant_id').in('user_id', managerIds)
    .in('tenant_id', [...new Set(brands.map(brand => brand.tenant_id).filter((id): id is string => !!id))]) : { data: [], error: null };
  if (profiles.error) return null;
  const groups = new Map<string, DashboardManager>();
  for (const brand of brands) {
    const assignment = assignments?.find(row => row.brand_id === brand.id);
    const profile = profiles.data?.find(row => row.user_id === assignment?.manager_user_id && row.tenant_id === brand.tenant_id);
    // Missing/inaccessible identities are not matched by name or email.
    const id = profile?.user_id ?? (assignment ? `unavailable:${brand.id}` : 'unassigned');
    const group: DashboardManager = groups.get(id) ?? { id, name: profile?.name || (assignment ? 'Manager profile unavailable' : 'Unassigned brands'), avatar: profile?.discord_avatar ?? null, brands: [] };
    group.brands.push(brand.slug);
    groups.set(id, group);
  }
  return [...groups.values()].sort((a,b) => Number(a.id === 'unassigned') - Number(b.id === 'unassigned') || a.name.localeCompare(b.name));
}
