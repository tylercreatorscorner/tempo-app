import { createAdminClient } from '@/lib/supabase/server';
import { buildRegistry, type BrandRow } from '@/lib/data/brand-registry-core';
import { canAccessSchedule } from './schedule-access';
import { can } from './permissions';
import type { WorkspaceScope } from './workspace-scope';

export class ReportAccessError extends Error {}

/** Report generators receive an explicit tenant registry, including for All brands. */
export async function getReportRegistry(scope: WorkspaceScope | null, brand: string, type: string) {
  if (!scope || !scope.tenantId || !can(scope,'reporting','read')) throw new ReportAccessError('Report access denied.');
  if (brand === 'all') {
    if (scope.brandScope.kind !== 'all') throw new ReportAccessError('Select one of your assigned brands.');
  } else if (!(await canAccessSchedule(scope, {
    tenant_id:scope.tenantId,brand,source:'reporting',report_type:type,
  },'read'))) throw new ReportAccessError('Brand is not available for reporting.');
  const admin = await createAdminClient();
  const { data, error, count } = await admin.from('brands_v2')
    .select('id, slug, name, display_name, color, is_archived, is_umbrella, parent_brand_id, store_order', {count:'exact'})
    .eq('tenant_id',scope.tenantId);
  if (error || !data || data.length !== count) throw new Error('Could not verify reporting brands.');
  const ids = new Set(data.map(row=>row.id));
  if (data.some(row=>row.parent_brand_id && !ids.has(row.parent_brand_id))) throw new Error('Reporting brand ownership is inconsistent.');
  if (brand === 'all' && data.length) {
    const slugs = data.map(row=>row.slug);
    const { data: matches,error:matchError,count:matchCount } = await admin.from('brands_v2')
      .select('id, tenant_id',{count:'exact'}).in('slug',slugs);
    if (matchError || !matches || matches.length !== matchCount || matchCount !== slugs.length
        || matches.some(row=>row.tenant_id !== scope.tenantId)) throw new Error('Reporting brand names are ambiguous.');
  }
  return buildRegistry(data as BrandRow[]);
}
