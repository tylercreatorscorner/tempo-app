import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientReportSnapshot } from './client-reports';

export interface CanonicalReportScope {
  tenantId: string;
  brandSlug: string;
  reportType: 'performance' | 'weekly' | 'monthly';
  periodStart: string;
  periodEnd: string;
}

export interface CanonicalReportSource {
  id: string;
  tenant_id: string | null;
  brand_slug: string;
  report_type: string | null;
  period_start: string;
  period_end: string;
  revoked_at: string | null;
}

/** Set only by the approved, server-side publication process, never request JSON. */
export interface ApprovedReportCorrection {
  v: 1;
  status: 'approved';
  sourceReportId: string;
  /** Financial approval time; notes-only copies must retain this timestamp. */
  approvedAt?: string;
  scope: CanonicalReportScope;
}

export interface CanonicalClientReport extends CanonicalReportSource {
  tenant_id: string;
  token: string;
  brand_name: string;
  period_label: string;
  snapshot: ClientReportSnapshot & { reportCorrection: ApprovedReportCorrection; revision?: { previousReportId?: unknown; [key: string]: unknown } };
  notes: string | null;
  plan: string | null;
  created_at: string;
  created_by: string | null;
  viewed_at: string | null;
  refreshed_at: string | null;
}

export class CanonicalReportUnavailableError extends Error {
  constructor() {
    super('The approved report revision could not be verified. Please try again or contact your agency.');
    this.name = 'CanonicalReportUnavailableError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{8,200}$/;
const TYPES = new Set(['performance', 'weekly', 'monthly']);
const COLUMNS = 'id,token,tenant_id,brand_slug,brand_name,report_type,period_start,period_end,period_label,snapshot,notes,plan,created_at,created_by,viewed_at,refreshed_at,revoked_at';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validScope(value: unknown): value is CanonicalReportScope {
  return record(value) && typeof value.tenantId === 'string' && UUID.test(value.tenantId)
    && typeof value.brandSlug === 'string' && value.brandSlug.length > 0 && value.brandSlug.length <= 200
    && typeof value.reportType === 'string' && TYPES.has(value.reportType)
    && validDay(value.periodStart) && validDay(value.periodEnd) && value.periodStart <= value.periodEnd;
}

function matchesScope(row: Record<string, unknown>, scope: CanonicalReportScope): boolean {
  return row.tenant_id === scope.tenantId && row.brand_slug === scope.brandSlug
    && row.report_type === scope.reportType && row.period_start === scope.periodStart && row.period_end === scope.periodEnd;
}

function sameScope(left: CanonicalReportScope, right: CanonicalReportScope): boolean {
  return left.tenantId === right.tenantId && left.brandSlug === right.brandSlug && left.reportType === right.reportType
    && left.periodStart === right.periodStart && left.periodEnd === right.periodEnd;
}

function snapshotDay(value: unknown): string | null {
  if (validDay(value)) return value;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

/**
 * A period acquires a canonical replacement only through explicit approved
 * metadata. Ordinary newer reports never supersede an already-issued link.
 * Read approved candidates INCLUDING revoked rows: a revoked or
 * damaged latest correction must not expose an older incorrect snapshot.
 */
export async function loadCanonicalForPeriod(
  scope: CanonicalReportScope,
  db: SupabaseClient,
): Promise<CanonicalClientReport | null> {
  if (!validScope(scope)) throw new CanonicalReportUnavailableError();
  try {
    const { data: candidates, error } = await db.from('client_reports').select(COLUMNS)
      .eq('tenant_id', scope.tenantId).eq('brand_slug', scope.brandSlug).eq('report_type', scope.reportType)
      .eq('period_start', scope.periodStart).eq('period_end', scope.periodEnd)
      .contains('snapshot', { reportCorrection: { status: 'approved' } })
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(201)
      .abortSignal(AbortSignal.timeout(8_000));
    if (error) throw new CanonicalReportUnavailableError();
    if (!Array.isArray(candidates) || candidates.length > 200) throw new CanonicalReportUnavailableError();
    if (!candidates.length) return null;
    // A late notes-only copy of an old approval cannot supersede a newer
    // financial approval. Legacy approvals use their original creation time.
    const ranked = candidates.map(candidate => {
      if (!record(candidate) || !record(candidate.snapshot) || !record(candidate.snapshot.reportCorrection)
        || typeof candidate.created_at !== 'string') throw new CanonicalReportUnavailableError();
      const created = Date.parse(candidate.created_at);
      const stamp = candidate.snapshot.reportCorrection.approvedAt;
      if (stamp !== undefined && (typeof stamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(stamp))) throw new CanonicalReportUnavailableError();
      const approved = stamp === undefined ? created : Date.parse(stamp as string);
      // Allow small clock/serialization skew, never a future-dated approval.
      if (!Number.isFinite(created) || !Number.isFinite(approved) || approved > created + 5_000) throw new CanonicalReportUnavailableError();
      return { candidate, approved, created };
    }).sort((a, b) => b.approved - a.approved || b.created - a.created || String(b.candidate.id).localeCompare(String(a.candidate.id)));
    const data = ranked[0].candidate;
    if (!record(data) || !matchesScope(data, scope) || data.revoked_at !== null
      || typeof data.id !== 'string' || !UUID.test(data.id)
      || typeof data.token !== 'string' || !TOKEN.test(data.token)
      || typeof data.created_at !== 'string' || !Number.isFinite(Date.parse(data.created_at))) {
      throw new CanonicalReportUnavailableError();
    }
    const snapshot = data.snapshot;
    const correction = record(snapshot) ? snapshot.reportCorrection : null;
    const report = record(snapshot) ? snapshot.report : null;
    if (!record(snapshot) || snapshot.v !== 1 || !record(correction) || correction.v !== 1
      || correction.status !== 'approved' || typeof correction.sourceReportId !== 'string'
      || !UUID.test(correction.sourceReportId) || correction.sourceReportId === data.id
      || !validScope(correction.scope)
      || !sameScope(correction.scope, scope)
      || !record(report) || report.brandSlug !== scope.brandSlug
      || snapshotDay(report.startDate) !== scope.periodStart || snapshotDay(report.endDate) !== scope.periodEnd) {
      throw new CanonicalReportUnavailableError();
    }
    // Provenance must point to a real original in exactly the same workspace,
    // brand, cadence and window. Its revocation does not revoke the new token.
    const original = await db.from('client_reports')
      .select('id,tenant_id,brand_slug,report_type,period_start,period_end')
      .eq('id', correction.sourceReportId).eq('tenant_id', scope.tenantId)
      .abortSignal(AbortSignal.timeout(8_000)).maybeSingle();
    if (original.error || !record(original.data) || original.data.id !== correction.sourceReportId
      || !matchesScope(original.data, scope)) throw new CanonicalReportUnavailableError();
    return data as unknown as CanonicalClientReport;
  } catch {
    throw new CanonicalReportUnavailableError();
  }
}

/** Source revocation always wins before any replacement token is looked up. */
export async function loadCanonicalForReport(
  source: CanonicalReportSource,
  db: SupabaseClient,
): Promise<CanonicalClientReport | null> {
  if (source.revoked_at !== null) return null;
  // Legacy rows without workspace ownership cannot be redirected into another
  // workspace. Their existing frozen-report behavior remains unchanged.
  if (!source.tenant_id) return null;
  return loadCanonicalForPeriod({
    tenantId: source.tenant_id, brandSlug: source.brand_slug,
    reportType: (source.report_type ?? 'performance') as CanonicalReportScope['reportType'],
    periodStart: source.period_start, periodEnd: source.period_end,
  }, db);
}
