import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { buildRegistry, expandSlugs, type BrandRow } from '@/lib/data/brand-registry-core';
import { can, type Level } from './permissions';
import { isBrandInScope, type WorkspaceScope } from './workspace-scope';

export class ClientReportAccessError extends Error {}

export function reportGuard(scope: WorkspaceScope, level: Level) {
  return !scope.tenantId || !can(scope, 'reporting', level) || (level !== 'read' && scope.impersonating)
    ? NextResponse.json({ error: 'Forbidden' }, { status: 403 }) : null;
}

export async function getClientReportRegistry(scope: WorkspaceScope) {
  if (reportGuard(scope, 'read')) throw new Error('Report access denied.');
  const admin = await createAdminClient();
  const { data, error, count } = await admin.from('brands_v2')
    .select('id, slug, name, display_name, color, is_archived, is_umbrella, parent_brand_id, store_order', { count: 'exact' })
    .eq('tenant_id', scope.tenantId);
  if (error || !data || count !== data.length) throw new Error('Could not verify reporting brands.');
  const ids = new Set(data.map(b => b.id));
  if (data.some(b => b.parent_brand_id && !ids.has(b.parent_brand_id))) throw new Error('Invalid reporting brand ownership.');
  return buildRegistry(data as BrandRow[]);
}

export async function clientReportContext(scope: WorkspaceScope, brand: string) {
  const registry = await getClientReportRegistry(scope);
  if (brand === 'all') {
    if (scope.brandScope.kind !== 'all') throw new ClientReportAccessError('Select an assigned brand.');
  } else {
    const row = registry.bySlug.get(brand);
    const related = row ? [row, ...expandSlugs(registry, brand).map(s => registry.bySlug.get(s))] : [];
    if (row?.parent_brand_id) related.push(registry.byId.get(row.parent_brand_id));
    // Assignment authorizes the selected brand. Its tenant-owned stores and
    // parent roster are data grains of that report, not additional assignments.
    if (!row || !isBrandInScope(scope, row) || related.some(b => !b)) throw new ClientReportAccessError('Brand is not available for reporting.');
  }
  return { tenantId: scope.tenantId!, registry };
}

export type ClientReportContext = Awaited<ReturnType<typeof clientReportContext>>;
