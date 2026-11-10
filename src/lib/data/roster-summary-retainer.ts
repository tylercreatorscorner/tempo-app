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

export interface RosterRetainerSummary {
  total: number | null;
  complete: boolean;
  missingCount: number;
}

/** Brand-level commitment: table search, status and segments do not change it. */
export async function getRosterSummaryRetainer(
  scope: WorkspaceScope,
  brand: string | null,
  activeBrandSlugs?: string[],
): Promise<RosterRetainerSummary | null> {
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
    if (activeBrandSlugs) query = query.in('brand', activeBrandSlugs);
    return query;
  }, 'roster-summary-retainer');

  await applyRosterAgreementTerms(rows,scope.tenantId,new Date().toLocaleDateString('en-CA',{timeZone:'America/Chicago'}));
  const commitments = new Map<string, number>();
  const missing = new Set<string>();
  for (const row of rows) {
    // Linked duplicates are one agreement per brand. Unlinked rows retain
    // their own identity; never merge two people just because names match.
    const key = row.creator_id ? `creator:${row.creator_id}|${row.brand ?? ''}` : `row:${row.id}`;
    // Missing recorded terms do not certify a zero-dollar commitment.
    if (row.retainer === null || row.retainer === '' || !Number.isFinite(Number(row.retainer))) {
      missing.add(key);
      continue;
    }
    const value = Number(row.retainer);
    commitments.set(key, Math.max(commitments.get(key) ?? 0, value));
  }
  for (const key of commitments.keys()) missing.delete(key);
  const total = Array.from(commitments.values()).reduce((sum, value) => sum + value, 0);
  return { total: total === 0 && missing.size ? null : total, complete: missing.size === 0, missingCount: missing.size };
}
