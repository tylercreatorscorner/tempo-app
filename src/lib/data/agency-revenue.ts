import type { SupabaseClient } from '@supabase/supabase-js';
import { agencyMonthBounds, isAgencyDate, selectMonthTerms, type ClientRecord } from '@/lib/agency/model';
import { financeSettingsSchema, managerAllocations } from '@/lib/agency/finance-model';
import { calculateRevenueTrueUp, sumRevenueTrueUps, type RevenueTrueUpRow, type RevenueTrueUpTotals, type RevenueFinanceRecord } from '@/lib/agency/revenue-model';

export interface AgencyRevenueCoverage {
  brandId: string;
  brandName: string;
  gmvCents: number | null;
  recordedDays: number;
  sourceRecordedDays: number;
  expectedDays: number;
  recordedThrough: string | null;
  latestRecordedThrough: string | null;
  dailyCoverageComplete: boolean;
}
export interface AgencyRevenueCash {
  collectedCents: number | null;
  managerPaidCents: number | null;
  retainedCashCents: number | null;
  collectedCount: number;
  managerPaidCount: number;
  complete: boolean;
}
export interface AgencyRevenueResponse {
  month: string;
  periodStart: string;
  periodEnd: string;
  asOfDate: string;
  throughDate: string;
  rows: Array<RevenueTrueUpRow & { brandCoverage: AgencyRevenueCoverage[]; managerRecipients: Array<{ managerId: string; name: string | null }> }>;
  totals: RevenueTrueUpTotals;
  cash: AgencyRevenueCash;
  warnings: string[];
}

export function revenuePeriod(month: string | null, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (name: string) => parts.find(value => value.type === name)!.value;
  const asOfDate = `${part('year')}-${part('month')}-${part('day')}`;
  const selectedMonth = month ?? asOfDate.slice(0, 7);
  if (!/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(selectedMonth) || selectedMonth > asOfDate.slice(0, 7)) throw new Error('Choose the current month or a past service month.');
  const bounds = agencyMonthBounds(selectedMonth);
  const yesterday = new Date(`${asOfDate}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const throughDate = selectedMonth === asOfDate.slice(0, 7) ? yesterday.toISOString().slice(0, 10) : bounds.end;
  return { month: selectedMonth, periodStart: bounds.start, periodEnd: bounds.end, asOfDate, throughDate };
}

type Performance = { brand_id: string; managed_gmv: unknown; recorded_days: number; source_recorded_days: number; expected_days: number; recorded_through: string | null; latest_recorded_through: string | null; complete: boolean };
type MoneyFact = { status: string; collected_on: string | null; manager_paid_on: string | null; fee_cents: unknown; manager_cents: unknown };
const finiteCents = (raw: unknown, dollars = false): number | null => {
  if ((typeof raw !== 'string' && typeof raw !== 'number')
    || (typeof raw === 'string' && !/^-?\d+(?:\.\d+)?$/.test(raw.trim()))) return null;
  const value = Number(raw);
  const cents = dollars ? Math.round(value * 100) : value;
  return Number.isFinite(value) && Number.isSafeInteger(cents) ? cents : null;
};
function addCents(values: number[]) {
  const total = values.reduce((sum, value) => sum + BigInt(value), BigInt(0));
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Revenue totals exceed supported limits.');
  return Number(total);
}

function recordedCash(rows: MoneyFact[], start: string, end: string): AgencyRevenueCash {
  const inPeriod = (day: string | null) => day !== null && isAgencyDate(day) && day >= start && day <= end;
  const collections = rows.filter(row => row.status === 'paid' && inPeriod(row.collected_on));
  const managerPayments = rows.filter(row => row.status === 'paid' && inPeriod(row.manager_paid_on));
  const total = (facts: MoneyFact[], field: 'fee_cents' | 'manager_cents') => {
    const amounts = facts.map(row => finiteCents(row[field]));
    return amounts.some(value => value === null || value < 0) ? null : addCents(amounts as number[]);
  };
  const collectedCents = total(collections, 'fee_cents');
  const managerPaidCents = total(managerPayments, 'manager_cents');
  return { collectedCents, managerPaidCents, retainedCashCents: collectedCents !== null && managerPaidCents !== null ? addCents([collectedCents, -managerPaidCents]) : null,
    collectedCount: collections.length, managerPaidCount: managerPayments.length, complete: collectedCents !== null && managerPaidCents !== null };
}

/** Read-only leadership data. Estimates and actual cash use separate sources. */
export async function loadAgencyRevenue(db: SupabaseClient, tenantId: string, period: ReturnType<typeof revenuePeriod>): Promise<AgencyRevenueResponse> {
  if (!tenantId) throw new Error('Agency tenant is required.');
  const hasClosedDates = period.throughDate >= period.periodStart;
  const [directory, clientResult, financeResult, performanceResult, cashResult, managerResult] = await Promise.all([
    db.from('brands_v2').select('id,name,display_name', { count: 'exact' }).eq('tenant_id', tenantId).is('parent_brand_id', null).order('id').limit(10000),
    db.rpc('agency_business_list_clients', { p_tenant_id: tenantId }),
    db.from('agency_finance_settings').select('client_id,revision,manager_terms:settings->managerTerms,terms_review_required:settings->termsReviewRequired', { count: 'exact' }).eq('tenant_id', tenantId).limit(10000),
    hasClosedDates ? db.rpc('agency_business_period_performance', { p_tenant_id: tenantId, p_month: period.periodStart, p_through: period.throughDate }) : Promise.resolve({ data: [], error: null }),
    hasClosedDates ? db.from('agency_client_invoices').select('status,collected_on,manager_paid_on,fee_cents:snapshot->>feeCents,manager_cents:snapshot->>managerCents', { count: 'exact' }).eq('tenant_id', tenantId).eq('status', 'paid')
      .or(`and(collected_on.gte.${period.periodStart},collected_on.lte.${period.throughDate}),and(manager_paid_on.gte.${period.periodStart},manager_paid_on.lte.${period.throughDate})`).limit(10000)
      : Promise.resolve({ data: [], error: null, count: 0 }),
    db.from('user_profiles').select('user_id,name', { count: 'exact' }).eq('tenant_id', tenantId).in('role', ['owner', 'admin', 'manager']).limit(10000),
  ]);
  if ([directory, clientResult, financeResult, performanceResult, cashResult, managerResult].some(result => result.error)
    || [directory, financeResult, cashResult, managerResult].some(result => !Array.isArray(result.data) || result.count !== result.data.length)
    || !Array.isArray(clientResult.data) || !Array.isArray(performanceResult.data)) throw new Error('Complete agency revenue data could not be loaded.');
  const brands = directory.data!;
  const brandIds = new Set(brands.map(row => row.id));
  const clients = clientResult.data as ClientRecord[];
  if (new Set(clients.map(client => client.id)).size !== clients.length
    || clients.some(client => !client.id || typeof client.name !== 'string' || !Array.isArray(client.brandIds) || client.brandIds.some(id => !brandIds.has(id)))) throw new Error('Agency client ownership could not be verified.');
  const coverageFor = (performance: Performance[], from: string, through: string) => {
    const hasDates = through >= from;
    if (hasDates && (performance.length !== brandIds.size || new Set(performance.map(row => row.brand_id)).size !== brandIds.size || performance.some(row => !brandIds.has(row.brand_id)))) throw new Error('Complete agency performance could not be loaded.');
    const expectedDays = hasDates ? Number(through.slice(8)) - Number(from.slice(8)) + 1 : 0;
    const performanceByBrand = new Map(performance.map(row => [row.brand_id, row]));
    return new Map<string, AgencyRevenueCoverage>(brands.map(brand => {
      const row = performanceByBrand.get(brand.id);
      if (row && (!Number.isInteger(row.recorded_days) || !Number.isInteger(row.source_recorded_days) || row.expected_days !== expectedDays
        || row.recorded_days < 0 || row.source_recorded_days < row.recorded_days || row.source_recorded_days > expectedDays
        || [row.recorded_through, row.latest_recorded_through].some(day => day !== null && (!isAgencyDate(day) || day < from || day > through)))) throw new Error('Agency source coverage could not be verified.');
      return [brand.id, { brandId: brand.id, brandName: brand.display_name || brand.name, gmvCents: row ? finiteCents(row.managed_gmv, true) : null,
        recordedDays: row?.recorded_days ?? 0, sourceRecordedDays: row?.source_recorded_days ?? 0, expectedDays,
        recordedThrough: row?.recorded_through ?? null, latestRecordedThrough: row?.latest_recorded_through ?? null,
        dailyCoverageComplete: row?.complete === true && row.recorded_days === expectedDays && row.recorded_through === through }];
    }));
  };
  const coverage = coverageFor(performanceResult.data as Performance[], period.periodStart, period.throughDate);
  // Explicit saved service ranges require separately bounded source facts.
  // The canonical range RPC also serves the existing month and MTD wrappers.
  const rangesByClient = new Map<string, { start: string; end: string }>();
  const uniqueRanges = new Map<string, { start: string; end: string }>();
  for (const client of clients) {
    const term = selectMonthTerms(client.terms, period.month);
    const approved = term?.servicePeriod;
    if (!approved || term.effectiveMonth !== period.month) continue;
    if (!isAgencyDate(approved.start) || !isAgencyDate(approved.end) || approved.start < period.periodStart || approved.end > period.periodEnd || approved.start > approved.end) throw new Error('Agency service range could not be verified.');
    const range = { start: approved.start, end: approved.end < period.throughDate ? approved.end : period.throughDate };
    rangesByClient.set(client.id, range);
    if (client.brandIds.length && (range.start !== period.periodStart || range.end !== period.throughDate)) uniqueRanges.set(`${range.start}:${range.end}`, range);
  }
  const rangedCoverage = new Map<string, Map<string, AgencyRevenueCoverage>>();
  await Promise.all([...uniqueRanges].map(async ([key, range]) => {
    if (range.end < range.start) { rangedCoverage.set(key, coverageFor([], range.start, range.end)); return; }
    const result = await db.rpc('agency_business_range_performance', { p_tenant_id: tenantId, p_month: period.periodStart, p_from: range.start, p_through: range.end });
    if (result.error || !Array.isArray(result.data)) throw new Error('Complete agency service-range GMV could not be loaded.');
    rangedCoverage.set(key, coverageFor(result.data as Performance[], range.start, range.end));
  }));
  const finance = new Map<string, RevenueFinanceRecord>();
  for (const value of financeResult.data!) {
    if (!value.client_id || finance.has(value.client_id) || (value.manager_terms != null && !Array.isArray(value.manager_terms)) || (value.terms_review_required != null && typeof value.terms_review_required !== 'boolean')) throw new Error('Agency finance terms could not be verified.');
    const managerTerms = financeSettingsSchema.shape.managerTerms.parse(value.manager_terms ?? []);
    finance.set(value.client_id, { client_id: value.client_id, revision: value.revision, settings: { managerTerms, termsReviewRequired: value.terms_review_required === true } });
  }
  const managerNames = new Map(managerResult.data!.map(profile => [profile.user_id, profile.name?.trim() || null]));
  const rows = clients.map(client => {
    const range = rangesByClient.get(client.id);
    const sourceCoverage = range ? rangedCoverage.get(`${range.start}:${range.end}`) ?? coverage : coverage;
    const brandCoverage = client.brandIds.map(id => sourceCoverage.get(id)!);
    const hasGmv = brandCoverage.length > 0 && brandCoverage.every(row => row.gmvCents !== null);
    const dates = brandCoverage.map(row => row.latestRecordedThrough);
    const recordedThrough = dates.length > 0 && dates.every(day => day !== null) ? [...dates as string[]].sort()[0] : null;
    const estimate = calculateRevenueTrueUp({ client, finance: finance.get(client.id) ?? null, month: period.month, throughDate: period.throughDate,
      gmv: { amountCents: hasGmv ? addCents(brandCoverage.map(row => row.gmvCents!)) : null, recordedThrough,
        complete: hasClosedDates && hasGmv && brandCoverage.every(row => row.dailyCoverageComplete),
        ...(range ? { periodStart: range.start, periodEnd: range.end } : {}),
      } });
    const managerRecipients = estimate.managerTerms ? managerAllocations(estimate.managerTerms).map(recipient => ({ managerId: recipient.managerId, name: managerNames.get(recipient.managerId) ?? null })) : [];
    return { ...estimate, brandCoverage, managerRecipients };
  });
  const warnings: string[] = ['Daily coverage describes source presence in every expected store; it does not verify every sale in an export.'];
  if (!hasClosedDates) warnings.push('No completed source dates in this service month yet.');
  const cash = hasClosedDates ? recordedCash(cashResult.data as MoneyFact[], period.periodStart, period.throughDate)
    : { collectedCents: null, managerPaidCents: null, retainedCashCents: null, collectedCount: 0, managerPaidCount: 0, complete: false };
  if (!cash.complete && hasClosedDates) warnings.push('Some recorded cash amounts are unavailable; cash totals remain unavailable.');
  return { ...period, rows, totals: sumRevenueTrueUps(rows), cash, warnings };
}
