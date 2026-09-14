import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { getCreatorReportBrands } from '@/lib/auth/creator-report-scope';
import { historyDays, historyPoints, type HistoryDay } from './creator-performance-history-model';

/** Authorization precedes the service-role read. No shared user-data cache. */
export async function getCreatorPerformanceHistory(creatorId: string, start: string, end: string, brand?: string) {
  const days = historyDays(start, end);
  if (!days.length) return { status: 'range' as const, points: [] };
  const brands = await getCreatorReportBrands(creatorId, brand);
  if (!brands.length) return { status: 'denied' as const, points: [] };
  const scope = await getWorkspaceScope();
  if (!scope) return { status: 'denied' as const, points: [] };
  try {
    const db = await createAdminClient();
    const deadline = AbortSignal.timeout(15_000);
    const accounts = await db.from('tiktok_accounts').select('tiktok_username', { count: 'exact' })
      .eq('creator_id', creatorId).limit(101).abortSignal(deadline);
    if (accounts.error || !accounts.data || accounts.count !== accounts.data.length || accounts.data.length > 100) throw new Error('Incomplete handles');
    const handles = [...new Set(accounts.data.map(row => String(row.tiktok_username ?? '').replace(/^@/, '').trim().toLowerCase()).filter(Boolean))];
    if (!handles.length) return { status: 'ready' as const, points: [] };
    const result = await db.rpc('get_creator_performance_history', {
      p_tenant_id: scope.tenantId, p_handles: handles, p_brands: brands, p_start: start, p_end: end,
    }).abortSignal(deadline);
    if (result.error || !result.data) throw new Error('History unavailable');
    const rows = result.data as HistoryDay[];
    if (rows.length !== days.length || rows.some((row, i) => row.stat_date !== days[i])) throw new Error('Incomplete history');
    return { status: 'ready' as const, points: historyPoints(days, rows) };
  } catch {
    return { status: 'unavailable' as const, points: [] };
  }
}
