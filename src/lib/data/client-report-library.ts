import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCanonicalForPeriod } from './client-report-canonical';

export interface ReportLibraryRow {
  id: string; token: string; tenant_id: string; brand_slug: string; brand_name: string;
  report_type?: string | null; period_start?: string; period_end?: string; period_label: string;
  created_by: string | null; created_at: string; viewed_at: string | null;
  revoked_at: string | null; refreshed_at: string | null;
  revision?: { previousReportId?: unknown } | null;
  correction?: { status?: unknown } | null;
}

/** Legacy rows without a full scope remain separate audit records. */
function periodKey(row: ReportLibraryRow): string {
  return row.period_start && row.period_end
    ? JSON.stringify([row.tenant_id, row.brand_slug, row.report_type ?? 'performance', row.period_start, row.period_end])
    : row.id;
}

/** Collapse before pagination, so superseded rows never consume page slots. */
export async function currentReportLibrary(rows: ReportLibraryRow[], db: SupabaseClient): Promise<ReportLibraryRow[]> {
  const groups = new Map<string, ReportLibraryRow[]>();
  for (const row of rows) {
    const key = periodKey(row);
    const group = groups.get(key) ?? [];
    group.push(row); groups.set(key, group);
  }
  const result: ReportLibraryRow[] = [];
  const values = [...groups.values()];
  for (let offset = 0; offset < values.length; offset += 4) {
    result.push(...await Promise.all(values.slice(offset, offset + 4).map(async group => {
      group.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.id.localeCompare(a.id));
      const representative = group[0];
      if (group.some(row => row.correction?.status === 'approved')) {
        const canonical = await loadCanonicalForPeriod({ tenantId: representative.tenant_id, brandSlug: representative.brand_slug,
          reportType: (representative.report_type ?? 'performance') as 'performance' | 'weekly' | 'monthly',
          periodStart: representative.period_start!, periodEnd: representative.period_end! }, db);
        if (!canonical) throw new Error('The approved report revision could not be verified.');
        const { snapshot, ...metadata } = canonical;
        return { ...metadata, tenant_id: representative.tenant_id,
          revision: (snapshot as typeof snapshot & { revision?: ReportLibraryRow['revision'] }).revision };
      }
      return group.find(row => !row.revoked_at) ?? representative;
    })));
  }
  return result.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '') || b.id.localeCompare(a.id));
}
