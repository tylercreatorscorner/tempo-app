// Fictional, local-only revenue source. No authenticated or production requests.
import { createRoot } from 'react-dom/client';
import { AgencyRevenueWorkspace } from '../../src/app/(admin)/agency/revenue/workspace';
import { agencyMonthBounds, type AgencyTerms, type ClientRecord } from '../../src/lib/agency/model';
import { calculateRevenueTrueUp, sumRevenueTrueUps, type RevenueFinanceRecord } from '../../src/lib/agency/revenue-model';
import type { AgencyRevenueResponse } from '../../src/lib/data/agency-revenue';

const managerNames = [{ managerId: '00000000-0000-4000-8000-000000000020', name: 'Jordan Example' }, { managerId: '00000000-0000-4000-8000-000000000021', name: 'Alex Example' }, { managerId: '00000000-0000-4000-8000-000000000022', name: 'Riley Example' }];
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const components = (fixed: number, rate: number, managerFixed: number, managerRate: number, mode: 'additive' | 'minimum' = 'additive'): AgencyTerms => ({ effectiveMonth: '2026-01', monthlyRetainer: fixed, revSharePercent: rate, feeModel: 'components', managerComponent: { monthlyRetainer: managerFixed, revSharePercent: managerRate, feeModel: mode } });
const sources: Array<{ client: ClientRecord; finance: RevenueFinanceRecord | null; gmv: number | null; partial?: boolean }> = [
  { client: { id: id(1), revision: 1, name: 'Northstar Beauty', brandIds: [id(101)], serviceStart: '2026-01-01', serviceEnd: null, exitReason: null, updatedAt: null, terms: [components(4000, 2, 6000, 3, 'minimum')] }, finance: { client_id: id(1), revision: 1, settings: { termsReviewRequired: false, managerTerms: [{ effectiveMonth: '2026-01', managerId: id(20), fixedMonthly: 6000, gmvPercent: 3, compensationModel: 'minimum', payoutDays: 7 }] } }, gmv: 16843050 },
  { client: { id: id(2), revision: 1, name: 'Solstice Wellness', brandIds: [id(102)], serviceStart: '2026-01-01', serviceEnd: null, exitReason: null, updatedAt: null, terms: [{ effectiveMonth: '2026-01', monthlyRetainer: 10000, revSharePercent: 10, feeModel: 'additive' }] }, finance: { client_id: id(2), revision: 1, settings: { termsReviewRequired: false, managerTerms: [{ effectiveMonth: '2026-01', managerId: id(21), fixedMonthly: 5000, gmvPercent: 5, payoutDays: 7 }] } }, gmv: 23428184 },
  { client: { id: id(3), revision: 1, name: 'Cedar Labs', brandIds: [id(103)], serviceStart: '2026-01-01', serviceEnd: null, exitReason: null, updatedAt: null, terms: [components(2000, 2, 3500, 2)] }, finance: { client_id: id(3), revision: 1, settings: { termsReviewRequired: false, managerTerms: [{ effectiveMonth: '2026-01', managerId: id(20), fixedMonthly: 3500, gmvPercent: 2, payoutDays: 7, compensationModel: 'additive', allocations: [{ managerId: id(20), fixedMonthly: 3500, gmvPercent: 1.5 }, { managerId: id(22), fixedMonthly: 0, gmvPercent: 0.5 }] }] } }, gmv: 7928325, partial: true },
  { client: { id: id(4), revision: 1, name: 'Harbor Skin', brandIds: [id(104)], serviceStart: '2026-01-01', serviceEnd: null, exitReason: null, updatedAt: null, terms: [components(3000, 2, 5000, 3)] }, finance: { client_id: id(4), revision: 1, settings: { termsReviewRequired: true, managerTerms: [{ effectiveMonth: '2026-01', managerId: id(21), fixedMonthly: 5000, gmvPercent: 3, payoutDays: 7 }] } }, gmv: 8031280 },
  { client: { id: id(5), revision: 1, name: 'Meridian Essentials', brandIds: [id(105)], serviceStart: '2026-01-01', serviceEnd: null, exitReason: null, updatedAt: null, terms: [{ effectiveMonth: '2026-01', monthlyRetainer: 6000, revSharePercent: 4, feeModel: 'additive' }] }, finance: null, gmv: 10287432 },
  { client: { id: id(6), revision: 1, name: 'Aster Home', brandIds: [id(106)], serviceStart: '2026-01-01', serviceEnd: null, exitReason: null, updatedAt: null, terms: [components(2500, 2, 3000, 3)] }, finance: { client_id: id(6), revision: 1, settings: { termsReviewRequired: false, managerTerms: [{ effectiveMonth: '2026-01', managerId: id(22), fixedMonthly: 3000, gmvPercent: 3, payoutDays: 7 }] } }, gmv: null },
  { client: { id: id(8), revision: 1, name: 'Low-volume Pilot', brandIds: [id(108)], serviceStart: '2026-01-01', serviceEnd: null, exitReason: null, updatedAt: null, terms: [{ effectiveMonth: '2026-01', monthlyRetainer: 1000, revSharePercent: 0, feeModel: 'fixed' }] }, finance: { client_id: id(8), revision: 1, settings: { termsReviewRequired: false, managerTerms: [{ effectiveMonth: '2026-01', managerId: id(22), fixedMonthly: 1500, gmvPercent: 0, payoutDays: 7 }] } }, gmv: 0 },
  { client: { id: id(7), revision: 1, name: 'October Studio', brandIds: [id(107)], serviceStart: '2026-11-01', serviceEnd: null, exitReason: null, updatedAt: null, terms: [] }, finance: null, gmv: null },
];
function fixture(month: string): AgencyRevenueResponse {
  const scenario = new URLSearchParams(window.location.search).get('scenario');
  const noClosedDates = scenario === 'first-day' && month === '2026-10';
  const bounds = agencyMonthBounds(month), throughDate = noClosedDates ? '2026-09-30' : month === '2026-10' ? '2026-10-28' : bounds.end;
  const expectedDays = noClosedDates ? 0 : Number(throughDate.slice(8));
  const rows = sources.filter(source => scenario !== 'negative' || source.client.id === id(8)).map(source => {
    if (noClosedDates) source = { ...source, gmv: null };
    const recordedDays = source.gmv === null ? 0 : source.partial ? expectedDays - 2 : expectedDays;
    const recordedThrough = source.gmv === null ? null : source.partial ? `${month}-${String(expectedDays - 1).padStart(2, '0')}` : throughDate;
    return { ...calculateRevenueTrueUp({ client: source.client, finance: source.finance, month, throughDate, gmv: { amountCents: source.gmv, complete: !source.partial && source.gmv !== null, recordedThrough } }), managerRecipients: source.finance ? managerNames.filter(manager => source.finance!.settings.managerTerms.some(term => (term.allocations ?? [term]).some(recipient => recipient.managerId === manager.managerId))) : [], brandCoverage: [{ brandId: source.client.brandIds[0], brandName: source.client.name, gmvCents: source.gmv, recordedDays, sourceRecordedDays: recordedDays, expectedDays, recordedThrough, latestRecordedThrough: recordedThrough, dailyCoverageComplete: !source.partial && source.gmv !== null }] };
  });
  return { month, periodStart: bounds.start, periodEnd: bounds.end, throughDate, asOfDate: noClosedDates ? '2026-10-01' : '2026-10-29', rows, totals: sumRevenueTrueUps(rows), cash: noClosedDates ? { collectedCents: null, managerPaidCents: null, retainedCashCents: null, collectedCount: 0, managerPaidCount: 0, complete: false } : { collectedCents: 2184000, managerPaidCents: 850000, retainedCashCents: 1334000, collectedCount: 2, managerPaidCount: 1, complete: true }, warnings: noClosedDates ? ['No completed source dates in this service month yet.'] : ['Daily coverage describes source presence in every expected store; it does not verify every sale in an export.'] };
}
window.fetch = async input => {
  const url = new URL(String(input), window.location.origin);
  if (url.pathname !== '/api/agency/revenue') return Response.json({ error: 'Local fixture: action unavailable.' }, { status: 400 });
  return Response.json(fixture(url.searchParams.get('month') ?? '2026-10'));
};
const requestedMonth = new URLSearchParams(window.location.search).get('month');
const initialMonth = requestedMonth && /^20\d{2}-(0[1-9]|1[0-2])$/.test(requestedMonth) && requestedMonth <= '2026-10' ? requestedMonth : '2026-10';
createRoot(document.getElementById('root')!).render(<AgencyRevenueWorkspace initialData={fixture(initialMonth)} latestMonth="2026-10" />);
