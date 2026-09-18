import { applyRosterAgreementTerms } from '@/lib/agreements/roster-terms';
import type { WorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { fetchAllRows } from './fetch-all-rows';

interface Commitment {
  id: string;
  creator_id: string | null;
  brand: string | null;
  retainer: number | string | null;
}

/** Brand-level commitment: table search, status and segments do not change it. */
export async function getRosterSummaryRetainer(
  scope: WorkspaceScope,
  brand: string | null,
): Promise<number | null> {
  if (!scope.canViewCreatorCost) return null;
  const allowed = scope.brandScope.kind === 'scoped' ? scope.brandScope.brandSlugs : null;
  const selected = brand && brand !== 'all' ? brand : null;
  if (allowed && (allowed.length === 0 || (selected && !allowed.includes(selected)))) return null;

  const supabase = await createAdminClient();
  const rows = await fetchAllRows<Commitment>(() => {
    let query = supabase.from('managed_creators')
      .select('id, creator_id, brand, retainer')
      .eq('tenant_id', scope.tenantId)
      .is('archived_at', null)
      .order('id', { ascending: true });
    if (selected) query = query.eq('brand', selected);
    else if (allowed) query = query.in('brand', allowed);
    return query;
  }, 'roster-summary-retainer');

  await applyRosterAgreementTerms(rows,scope.tenantId,new Date().toLocaleDateString('en-CA',{timeZone:'America/Chicago'}));
  const commitments = new Map<string, number>();
  for (const row of rows) {
    // Linked duplicates are one agreement per brand. Unlinked rows retain
    // their own identity; never merge two people just because names match.
    const key = row.creator_id ? `creator:${row.creator_id}|${row.brand ?? ''}` : `row:${row.id}`;
    const value = Number(row.retainer) || 0;
    commitments.set(key, Math.max(commitments.get(key) ?? 0, value));
  }
  return Array.from(commitments.values()).reduce((sum, value) => sum + value, 0);
}
