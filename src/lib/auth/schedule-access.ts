import { createAdminClient } from '@/lib/supabase/server';
import { can, type Level } from './permissions';
import { isBrandInScope, type WorkspaceScope } from './workspace-scope';

export interface ScheduleTarget {
  tenant_id: string;
  brand: unknown;
  source: unknown;
  report_type: unknown;
}

/** Both the API actor and the current execution owner must pass this boundary. */
export async function canAccessSchedule(
  scope: WorkspaceScope | null, target: ScheduleTarget, level: Level,
): Promise<boolean> {
  if (!scope || scope.tenantId !== target.tenant_id || (level !== 'read' && scope.impersonating)) return false;
  const types = target.source === 'reporting'
    ? ['performance-summary', 'creator-activity', 'brand-report']
    : target.source === 'discord-posts' ? ['whats-cooking', 'whos-cooking', 'daily-drop'] : [];
  if (typeof target.report_type !== 'string' || !types.includes(target.report_type)) return false;
  if (!can(scope, target.source === 'reporting' ? 'reporting' : 'drops', level)) return false;
  // Existing generators interpret all/empty as global, not tenant-wide.
  if (typeof target.brand !== 'string' || !target.brand || target.brand === 'all') return false;
  const admin = await createAdminClient();
  const { data: brand, error } = await admin.from('brands_v2')
    .select('id, slug, tenant_id, parent_brand_id, is_umbrella')
    .eq('slug', target.brand).eq('tenant_id', scope.tenantId).maybeSingle();
  if (error || !brand) return false;
  const related = [brand];
  if (brand.parent_brand_id) {
    const { data: parent, error: parentError } = await admin.from('brands_v2')
      .select('id, slug, tenant_id').eq('id', brand.parent_brand_id).maybeSingle();
    if (parentError || !parent) return false;
    related.push(parent as typeof brand);
  }
  if (brand.is_umbrella) {
    const { data: children, error: childError, count } = await admin.from('brands_v2')
      .select('id, slug, tenant_id', { count: 'exact' }).eq('parent_brand_id', brand.id);
    if (childError || !children?.length || count !== children.length) return false;
    related.push(...children as typeof brand[]);
  }
  // Generators expand umbrellas and consult parent roster rows. Check that reach too.
  for (const row of related) {
    if (row.tenant_id !== scope.tenantId || !isBrandInScope(scope, { id: row.id, slug: row.slug })) return false;
    // Downstream legacy analytics resolve globally by slug. Ambiguous slugs must
    // not resolve to a different tenant's UUID or combine its slug-keyed facts.
    const { data: matches, error: matchError } = await admin.from('brands_v2')
      .select('id').eq('slug', row.slug).limit(2);
    if (matchError || matches?.length !== 1 || matches[0].id !== row.id) return false;
  }
  return true;
}
