import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope, isBrandInScope } from './workspace-scope';
import { authorizeCreator } from './authorize-creator';
import { can } from './permissions';

/** Explicit brand filters for privileged creator reporting. Never returns global/null. */
export async function getCreatorReportBrands(creatorId: string, selectedBrand?: string): Promise<string[]> {
  const scope = await getWorkspaceScope();
  if (!scope || !can(scope, 'roster', 'read') || await authorizeCreator(scope, creatorId)) return [];
  const admin = await createAdminClient();
  const { data: rows, error, count } = await admin.from('brands_v2')
    .select('id, slug, parent_brand_id, is_umbrella', { count: 'exact' }).eq('tenant_id', scope.tenantId);
  if (error || !rows?.length || rows.length !== count) return [];
  const byId = new Map(rows.map(row => [row.id, row]));
  const permitted = rows.filter(row => {
    const parent = row.parent_brand_id ? byId.get(row.parent_brand_id) : null;
    if (row.parent_brand_id && !parent) return false;
    return isBrandInScope(scope, { id: row.id, slug: row.slug })
      || !!(parent && isBrandInScope(scope, { id: parent.id, slug: parent.slug }));
  });
  let selected = permitted;
  if (selectedBrand) {
    const root = permitted.find(row => row.slug === selectedBrand);
    if (!root) return [];
    selected = root.is_umbrella ? permitted.filter(row => row.parent_brand_id === root.id) : [root];
  }
  const slugs = [...new Set(selected.filter(row => !row.is_umbrella).map(row => row.slug))];
  if (!slugs.length) return [];
  // Analytics facts are still keyed by slug. Refuse cross-tenant slug collisions.
  const { data: matches, error: matchError, count: matchCount } = await admin.from('brands_v2')
    .select('id, slug, tenant_id', { count: 'exact' }).in('slug', slugs);
  if (matchError || !matches || matches.length !== matchCount || matchCount !== slugs.length
    || matches.some(row => row.tenant_id !== scope.tenantId)) return [];
  return slugs;
}
