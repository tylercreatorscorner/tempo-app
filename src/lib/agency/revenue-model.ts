import { agencyMonthBounds, calculateServiceRevenue, isAgencyDate, selectMonthTerms, type AgencyTerms, type ClientRecord } from './model';
import { addDays, calculateManagerCompensation, managerAllocations, type FinanceRecord, type FinanceSettings, type ManagerTerms } from './finance-model';

export type RevenueTrueUpStatus = 'ready' | 'provisional' | 'review_required' | 'needs_setup' | 'outside_service';
export type RevenueFinanceRecord = Pick<FinanceRecord, 'client_id' | 'revision'> & { settings: Pick<FinanceSettings, 'managerTerms' | 'termsReviewRequired'> };
export interface RevenueTrueUpInput {
  client: ClientRecord;
  finance: RevenueFinanceRecord | null;
  month: string;
  /** The requested last day of recorded GMV, never a projected month-end. */
  throughDate: string;
  gmv: { amountCents: number | null; complete: boolean; recordedThrough: string | null };
}
export interface RevenueTrueUpRow {
  clientId: string;
  clientName: string;
  month: string;
  throughDate: string;
  status: RevenueTrueUpStatus;
  reasons: string[];
  gmvCents: number | null;
  recordedThrough: string | null;
  gmvComplete: boolean;
  coverage: 'complete' | 'partial' | 'missing';
  partialPeriod: boolean;
  feeCents: number | null;
  managerCents: number | null;
  retainedCents: number | null;
  agencyTerms: AgencyTerms | null;
  managerTerms: ManagerTerms | null;
  /** Headline amounts always use the same cohort for gross, pay, and retained. */
  excludedFromTotals: boolean;
}
export interface RevenueTrueUpTotals {
  feeCents: number | null;
  managerCents: number | null;
  retainedCents: number | null;
  totalCount: number;
  supportedCount: number;
  includedCount: number;
  excludedCount: number;
  partialCount: number;
  provisionalCount: number;
  reviewCount: number;
  missingCount: number;
  complete: boolean;
}

function needsAgencyGmv(terms: AgencyTerms): boolean {
  if (terms.feeModel === 'fixed') return false;
  if (terms.feeModel === 'tiered') return true;
  return terms.revSharePercent !== 0 || (terms.feeModel === 'components' && (terms.managerComponent?.revSharePercent ?? 0) !== 0);
}

/** Calculate service-month estimates without invoice, AP, or manual forecast prerequisites.
 * Full monthly fixed fees accompany recorded GMV; there is no daily proration
 * and no extrapolation of partial-period GMV into a month-end forecast.
 */
export function calculateRevenueTrueUp(input: RevenueTrueUpInput): RevenueTrueUpRow {
  const { client, finance, month, throughDate, gmv } = input;
  const bounds = agencyMonthBounds(month);
  const noClosedDays = throughDate === addDays(bounds.start, -1);
  if (!isAgencyDate(throughDate) || (throughDate < bounds.start && !noClosedDays) || throughDate > bounds.end) throw new Error('Choose a through date within the service month.');
  if (finance && finance.client_id !== client.id) throw new Error('Finance settings do not belong to this client.');
  const validGmv = noClosedDays ? gmv.amountCents === null : gmv.amountCents === null || (Number.isSafeInteger(gmv.amountCents) && gmv.amountCents >= 0);
  const validRecordedDate = gmv.recordedThrough === null || (isAgencyDate(gmv.recordedThrough) && gmv.recordedThrough >= bounds.start && gmv.recordedThrough <= throughDate);
  const amountCents = validGmv && validRecordedDate ? gmv.amountCents : null;
  const gmvComplete = amountCents !== null && gmv.complete && gmv.recordedThrough === throughDate;
  const row: RevenueTrueUpRow = {
    clientId: client.id, clientName: client.name, month, throughDate, status: 'needs_setup', reasons: [],
    gmvCents: amountCents, recordedThrough: validRecordedDate ? gmv.recordedThrough : null, gmvComplete,
    coverage: amountCents === null ? 'missing' : gmvComplete ? 'complete' : 'partial', partialPeriod: throughDate < bounds.end,
    feeCents: null, managerCents: null, retainedCents: null, agencyTerms: selectMonthTerms(client.terms, month),
    managerTerms: finance?.settings.managerTerms.filter(term => term.effectiveMonth <= month).sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth))[0] ?? null, excludedFromTotals: true,
  };
  const stop = (status: RevenueTrueUpStatus, reason: string) => { row.status = status; row.reasons.push(reason); return row; };
  if (client.historical && !(client.serviceStart && client.serviceEnd && isAgencyDate(client.serviceStart) && isAgencyDate(client.serviceEnd) && client.serviceStart <= client.serviceEnd)) return stop('outside_service', 'Past agreement has no recorded service period for this month.');
  if (!client.serviceStart || !isAgencyDate(client.serviceStart)) return stop('needs_setup', 'Add the confirmed service start date.');
  if (client.serviceEnd && (!isAgencyDate(client.serviceEnd) || client.serviceEnd < client.serviceStart)) return stop('review_required', 'Review the recorded service dates.');
  if (client.serviceStart > bounds.end || (client.serviceEnd && client.serviceEnd < bounds.start)) return stop('outside_service', 'Outside the recorded service period.');
  if (client.serviceStart > bounds.start || (client.serviceEnd && client.serviceEnd < bounds.end)) return stop('review_required', 'Partial service month requires an agreed fee; no automatic proration is applied.');
  if (finance?.settings.termsReviewRequired) return stop('review_required', 'Resolve the flagged agreement terms before including this client.');
  if (!row.agencyTerms) return stop('needs_setup', 'Add agency fee terms effective for this month.');
  if (!validGmv || !validRecordedDate) return stop('review_required', 'Review the recorded GMV amount and coverage dates.');

  if (noClosedDays) row.reasons.push('No completed source dates in this service month yet.');
  else if (amountCents === null) row.reasons.push('Managed GMV is not recorded for this period.');
  else if (!gmvComplete) row.reasons.push('Recorded GMV coverage is partial; these amounts are provisional.');
  if (row.partialPeriod) row.reasons.push('Full monthly fixed fees plus recorded GMV through the selected date; no month-end extrapolation.');
  try {
    const independentFee = !needsAgencyGmv(row.agencyTerms);
    // Zero is supplied only when the fee is algebraically independent of GMV;
    // the reported GMV remains NULL rather than inventing zero source data.
    const fee = calculateServiceRevenue({ client, month, periodStart: bounds.start, periodEnd: bounds.end,
      gmvCents: amountCents ?? (independentFee ? 0 : null), gmvComplete: amountCents !== null || independentFee });
    if (fee.status === 'calculated' && Number.isSafeInteger(fee.revenueCents) && fee.revenueCents! >= 0) row.feeCents = fee.revenueCents;
    else if (fee.status === 'review_required') return stop('review_required', 'Review the agency fee calculation, tier method, or contract GMV basis.');
    if (row.managerTerms) {
      const managerNeedsGmv = managerAllocations(row.managerTerms).some(term => term.gmvPercent !== 0);
      if (amountCents !== null || !managerNeedsGmv) row.managerCents = calculateManagerCompensation(row.managerTerms, amountCents ?? 0).totalCents;
    } else row.reasons.push('Add a manager pay arrangement effective for this month.');
    if (row.feeCents !== null && row.managerCents !== null) {
      row.retainedCents = row.feeCents - row.managerCents;
      row.excludedFromTotals = false;
    }
  } catch { return stop('review_required', 'Review the saved fee and manager calculations.'); }
  if (row.excludedFromTotals) row.status = 'needs_setup';
  else row.status = !gmvComplete || row.partialPeriod ? 'provisional' : 'ready';
  return row;
}

/** A single matched cohort guarantees gross less manager pay equals retained. */
export function sumRevenueTrueUps(rows: RevenueTrueUpRow[]): RevenueTrueUpTotals {
  const included = rows.filter(row => !row.excludedFromTotals && row.feeCents !== null && row.managerCents !== null && row.retainedCents !== null && !['review_required', 'needs_setup', 'outside_service'].includes(row.status));
  const total = (field: 'feeCents' | 'managerCents' | 'retainedCents') => {
    if (!included.length) return null;
    const value = included.reduce((sum, row) => sum + BigInt(row[field]!), BigInt(0));
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Revenue totals exceed supported limits.');
    return Number(value);
  };
  return {
    feeCents: total('feeCents'), managerCents: total('managerCents'), retainedCents: total('retainedCents'), totalCount: rows.length,
    supportedCount: included.length, includedCount: included.length, excludedCount: rows.length - included.length,
    partialCount: rows.filter(row => row.status !== 'outside_service' && (row.coverage === 'partial' || row.partialPeriod)).length,
    provisionalCount: included.filter(row => row.status === 'provisional').length,
    reviewCount: rows.filter(row => row.status === 'review_required').length,
    missingCount: rows.filter(row => row.status === 'needs_setup').length,
    complete: included.length > 0 && included.length === rows.filter(row => row.status !== 'outside_service').length && included.every(row => row.status === 'ready'),
  };
}
