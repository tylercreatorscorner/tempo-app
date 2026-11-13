import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCanonicalForPeriod, type CanonicalReportScope } from './client-report-canonical';

export interface ClientReportHistoryItem {
  token: string;
  label: string;
  reportType: string;
  periodStart: string;
  periodEnd: string;
}
export interface ReportHistorySource {
  token: string;
  tenant_id: string | null;
  brand_slug: string;
  report_type: string | null;
  period_start: string;
  period_end: string;
  period_label: string;
  created_at: string;
}
type HistoryRow = ReportHistorySource & { revoked_at: string | null; reconciliation?: unknown; correction?: { status?: unknown } | null; canonical?: boolean };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function day(value: unknown): value is string {
  return typeof value === 'string' && DATE.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
function valid(source: ReportHistorySource) {
  return typeof source.token === 'string' && /^[a-zA-Z0-9_-]{8,200}$/.test(source.token)
    && day(source.period_start) && day(source.period_end) && source.period_start <= source.period_end
    && Number.isFinite(Date.parse(source.created_at));
}
const periodKey = (row: ReportHistorySource) => row.report_type === 'monthly'
  ? row.period_start.slice(0, 7) : `${row.period_start}:${row.period_end}`;

/** The report table contains issued bearer links; unissued preparation previews are not saved here.
 * One active version per period, within the exact workspace, brand and report cadence.
 * Ordinary new versions do not replace issued links. Explicit approved period
 * corrections are verified separately and take priority over ordinary versions.
 */
export function selectClientReportHistory(rows: HistoryRow[], source: ReportHistorySource): ClientReportHistoryItem[] {
  if (!valid(source) || !source.tenant_id || source.brand_slug === 'all'
    || !['monthly', 'weekly'].includes(source.report_type ?? '')) return [];
  const unique = new Map<string, HistoryRow>();
  for (const row of rows.filter(valid).sort((a, b) => b.created_at.localeCompare(a.created_at) || a.token.localeCompare(b.token))) {
    if (!valid(row) || row.tenant_id !== source.tenant_id || row.brand_slug !== source.brand_slug
      || row.report_type !== source.report_type || row.revoked_at || row.reconciliation != null) continue;
    const key = periodKey(row);
    if (!unique.has(key) || (row.canonical && !unique.get(key)?.canonical)) unique.set(key, row);
  }
  const selected = unique.get(periodKey(source));
  if (!selected?.canonical || selected.period_start !== source.period_start || selected.period_end !== source.period_end) {
    unique.set(periodKey(source), { ...source, revoked_at: null });
  }
  return [...unique.values()].sort((a, b) => b.period_end.localeCompare(a.period_end) || b.period_start.localeCompare(a.period_start))
    .map(row => ({ token: row.token, label: row.period_label, reportType: row.report_type!, periodStart: row.period_start, periodEnd: row.period_end }));
}

/** Failure is optional metadata loss, never a change to the frozen report. No current roster reads. */
export async function loadClientReportHistory(db: SupabaseClient, source: ReportHistorySource): Promise<ClientReportHistoryItem[]> {
  return (await loadClientReportHistoryResult(db, source)).items;
}

export async function loadClientReportHistoryResult(db: SupabaseClient, source: ReportHistorySource): Promise<{ items: ClientReportHistoryItem[]; unavailable: boolean }> {
  const fallback = selectClientReportHistory([], source);
  if (!fallback.length) return { items: [], unavailable: false };
  const rows: HistoryRow[] = [];
  const size = 500;
  const signal = AbortSignal.timeout(8000);
  try {
    for (let offset = 0; offset < 10000; offset += size) {
      const result = await db.from('client_reports')
        .select('token,tenant_id,brand_slug,report_type,period_start,period_end,period_label,created_at,revoked_at,reconciliation:snapshot->reconciliation,correction:snapshot->reportCorrection')
        .eq('tenant_id', source.tenant_id!).eq('brand_slug', source.brand_slug).eq('report_type', source.report_type!)
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .range(offset, offset + size - 1).abortSignal(signal);
      if (result.error || !Array.isArray(result.data)) return { items: fallback, unavailable: true };
      rows.push(...result.data as HistoryRow[]);
      if (result.data.length < size) return canonicalHistory(db, rows, source);
    }
    // An unverified truncated history must not masquerade as complete.
    return { items: fallback, unavailable: true };
  } catch { return { items: fallback, unavailable: true }; }
}

async function canonicalHistory(db: SupabaseClient, rows: HistoryRow[], source: ReportHistorySource) {
  const exactKey = (row: ReportHistorySource) => `${row.period_start}:${row.period_end}`;
  const candidates = new Map<string, HistoryRow>();
  for (const row of rows) {
    if (valid(row) && row.tenant_id === source.tenant_id && row.brand_slug === source.brand_slug
      && row.report_type === source.report_type && row.correction?.status === 'approved') candidates.set(exactKey(row), row);
  }
  if (!candidates.size) return { items: selectClientReportHistory(rows, source), unavailable: false };
  const resolved: HistoryRow[] = [];
  const blocked = new Set<string>();
  // Only explicitly corrected windows incur a full validation read. Bound
  // concurrency rather than issuing one request for every historic report.
  const pending = [...candidates.entries()];
  for (let offset = 0; offset < pending.length; offset += 4) {
    await Promise.all(pending.slice(offset, offset + 4).map(async ([key, row]) => {
      try {
        const canonical = await loadCanonicalForPeriod({ tenantId: source.tenant_id!, brandSlug: source.brand_slug,
          reportType: source.report_type as CanonicalReportScope['reportType'],
          periodStart: row.period_start, periodEnd: row.period_end }, db);
        if (!canonical) { blocked.add(key); return; }
        resolved.push({ ...canonical, canonical: true });
      } catch { blocked.add(key); }
    }));
  }
  if (blocked.has(exactKey(source))) return { items: [], unavailable: true };
  return { items: selectClientReportHistory([...rows.filter(row => !blocked.has(exactKey(row))), ...resolved], source), unavailable: blocked.size > 0 };
}
