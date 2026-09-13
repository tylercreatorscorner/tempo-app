import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope, isBrandInScope } from '@/lib/auth/workspace-scope';
import { can, type Level } from '@/lib/auth/permissions';

/** Legacy finance records use brand slugs rather than tenant IDs. Resolve an
 * explicit, unambiguous tenant-owned set before any privileged financial query. */
export async function getFinanceAccess(
  screen: 'earnings' | 'invoicing' | 'payments',
  level: Level = 'read',
  adminOnly = false,
) {
  const scope = await getWorkspaceScope();
  if (!scope?.tenantId || !can(scope, screen, level)
    || (level !== 'read' && scope.impersonating)
    || (adminOnly && !['owner', 'admin'].includes(scope.role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const admin = await createAdminClient();
  const { data: brands, error, count } = await admin.from('brands_v2')
    .select('id, slug, parent_brand_id', { count: 'exact' }).eq('tenant_id', scope.tenantId);
  if (error || !brands || count !== brands.length) {
    return NextResponse.json({ error: 'Could not verify financial brand access.' }, { status: 503 });
  }
  const byId = new Map(brands.map(brand => [brand.id, brand]));
  const permitted = brands.filter(brand => {
    const parent = brand.parent_brand_id ? byId.get(brand.parent_brand_id) : null;
    return isBrandInScope(scope, { id: brand.id, slug: brand.slug })
      || !!(parent && isBrandInScope(scope, { id: parent.id, slug: parent.slug }));
  });
  const brandSlugs = [...new Set(permitted.map(brand => brand.slug).filter((slug): slug is string => typeof slug === 'string' && !!slug))];
  if (brandSlugs.length) {
    const { data: matches, error: matchError, count: matchCount } = await admin.from('brands_v2')
      .select('id, slug, tenant_id', { count: 'exact' }).in('slug', brandSlugs);
    if (matchError || !matches || matches.length !== matchCount || matchCount !== brandSlugs.length
      || matches.some(brand => brand.tenant_id !== scope.tenantId)) {
      return NextResponse.json({ error: 'Financial brand ownership is ambiguous.' }, { status: 503 });
    }
  }
  return { scope, brandSlugs, admin };
}
