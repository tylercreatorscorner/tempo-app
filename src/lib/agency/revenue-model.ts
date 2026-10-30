import { agencyMonthBounds, calculateServiceRevenue, clientServicePeriod, isAgencyDate, selectMonthTerms, servicePeriodMatches, type AgencyTerms, type ClientRecord } from './model';
import { addDays, calculateManagerCompensation, managerAllocations, managerFor, type FinanceRecord, type FinanceSettings, type ManagerTerms } from './finance-model';
import { calculateCreatorBilling, type CreatorBillingResult } from './creator-billing';

export type RevenueTrueUpStatus = 'ready' | 'provisional' | 'partial_estimate' | 'review_required' | 'needs_setup' | 'outside_service' | 'no_agency_fee';
export type RevenueFinanceRecord = Pick<FinanceRecord, 'client_id' | 'revision'> & { settings: Pick<FinanceSettings, 'managerTerms' | 'termsReviewRequired'> & Partial<Pick<FinanceSettings, 'creatorBillingPeriods'>> };
export interface RevenueTrueUpInput {
  client: ClientRecord;
  finance: RevenueFinanceRecord | null;
  month: string;
  /** The requested last day of recorded GMV, never a projected month-end. */
  throughDate: string;
  gmv: { amountCents: number | null; complete: boolean; recordedThrough: string | null; periodStart?: string; periodEnd?: string };
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
  /** Confirmed saved components plus calculable recorded share. These are not full totals while pending. */
  knownFeeCents: number | null;
  knownManagerCents: number | null;
  knownRetainedCents: number | null;
  knownIncludedInTotals: boolean;
  feePending: boolean;
  managerPending: boolean;
  billingReviewRequired: boolean;
  creatorBilling: CreatorBillingResult | null;
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
  noAgencyFeeCount: number;
  knownFeeCents: number | null;
  knownManagerCents: number | null;
  knownRetainedCents: number | null;
  knownIncludedCount: number;
  pendingCount: number;
  complete: boolean;
}

function needsAgencyGmv(terms: AgencyTerms): boolean {
  if (terms.feeModel === 'fixed' || terms.feeModel === 'per_creator') return false;
  if (terms.feeModel === 'tiered') return true;
  return terms.revSharePercent !== 0 || (terms.feeModel === 'components' && (terms.managerComponent?.revSharePercent ?? 0) !== 0);
}

/** Calculate service-month estimates without invoice, AP, or manual forecast prerequisites.
 * Full monthly fixed fees accompany recorded GMV; there is no daily proration
 * and no extrapolation of partial-period GMV into a month-end forecast.
 */
function calculateExactRevenueTrueUp(input: RevenueTrueUpInput): RevenueTrueUpRow {
  const { client, finance, month, throughDate, gmv } = input;
  const bounds = agencyMonthBounds(month);
  const noClosedDays = throughDate === addDays(bounds.start, -1);
  if (!isAgencyDate(throughDate) || (throughDate < bounds.start && !noClosedDays) || throughDate > bounds.end) throw new Error('Choose a through date within the service month.');
  if (finance && finance.client_id !== client.id) throw new Error('Finance settings do not belong to this client.');
  const agencyTerms = selectMonthTerms(client.terms, month);
  const approvedPeriod = agencyTerms?.servicePeriod;
  const sourcePeriod = agencyTerms?.feeModel === 'per_creator' ? clientServicePeriod(client, month) : approvedPeriod;
  const dataStart = sourcePeriod?.start ?? bounds.start;
  const dataEnd = sourcePeriod && sourcePeriod.end < throughDate ? sourcePeriod.end : throughDate;
  const noClosedServiceDays = dataEnd < dataStart;
  const validGmv = noClosedServiceDays ? gmv.amountCents === null : gmv.amountCents === null || (Number.isSafeInteger(gmv.amountCents) && gmv.amountCents >= 0);
  const validRecordedDate = gmv.recordedThrough === null || (isAgencyDate(gmv.recordedThrough) && gmv.recordedThrough >= dataStart && gmv.recordedThrough <= dataEnd);
  const amountCents = validGmv && validRecordedDate ? gmv.amountCents : null;
  const gmvComplete = amountCents !== null && gmv.complete && gmv.recordedThrough === dataEnd;
  const row: RevenueTrueUpRow = {
    clientId: client.id, clientName: client.name, month, throughDate, status: 'needs_setup', reasons: [],
    gmvCents: amountCents, recordedThrough: validRecordedDate ? gmv.recordedThrough : null, gmvComplete,
    coverage: amountCents === null ? 'missing' : gmvComplete ? 'complete' : 'partial', partialPeriod: throughDate < bounds.end,
    feeCents: null, managerCents: null, retainedCents: null, agencyTerms,
    managerTerms: finance ? managerFor(finance.settings, month) : null, excludedFromTotals: true,
    knownFeeCents: null, knownManagerCents: null, knownRetainedCents: null, knownIncludedInTotals: false,
    feePending: true, managerPending: true, billingReviewRequired: finance?.settings.termsReviewRequired === true, creatorBilling: null,
  };
  const stop = (status: RevenueTrueUpStatus, reason: string) => { row.status = status; row.reasons.push(reason); return row; };
  if (client.historical && !(client.serviceStart && client.serviceEnd && isAgencyDate(client.serviceStart) && isAgencyDate(client.serviceEnd) && client.serviceStart <= client.serviceEnd)) return stop('outside_service', 'Past agreement has no recorded service period for this month.');
  if (!client.serviceStart || !isAgencyDate(client.serviceStart)) return stop('needs_setup', 'Add the confirmed service start date.');
  if (client.serviceEnd && (!isAgencyDate(client.serviceEnd) || client.serviceEnd < client.serviceStart)) return stop('review_required', 'Review the recorded service dates.');
  if (client.serviceStart > bounds.end || (client.serviceEnd && client.serviceEnd < bounds.start)) return stop('outside_service', 'Outside the recorded service period.');
  const expectedPeriod = clientServicePeriod(client, month);
  const partialService = client.serviceStart > bounds.start || Boolean(client.serviceEnd && client.serviceEnd < bounds.end);
  if (partialService && !servicePeriodMatches(approvedPeriod, expectedPeriod)) return stop('review_required', 'Partial service month requires an agreed fee; no automatic proration is applied.');
  if (approvedPeriod && !servicePeriodMatches(approvedPeriod, expectedPeriod)) return stop('review_required', 'The approved fee period does not match the recorded service dates.');
  if (row.managerTerms && ((partialService && !servicePeriodMatches(row.managerTerms.servicePeriod, expectedPeriod)) || (row.managerTerms.servicePeriod && !servicePeriodMatches(row.managerTerms.servicePeriod, expectedPeriod)))) return stop('review_required', 'Review the approved manager pay period for this service month.');
  if (finance?.settings.termsReviewRequired) return stop('review_required', 'Resolve the flagged agreement terms before including this client.');
  if (!row.agencyTerms) return stop('needs_setup', 'Add agency fee terms effective for this month.');
  if (approvedPeriod && (gmv.periodStart !== dataStart || gmv.periodEnd !== dataEnd)) return stop('review_required', 'Recorded GMV must be verified for the exact approved service period.');
  if (!validGmv || !validRecordedDate) return stop('review_required', 'Review the recorded GMV amount and coverage dates.');
  if (row.agencyTerms.feeModel === 'fixed' && row.agencyTerms.monthlyRetainer === 0 && row.agencyTerms.revSharePercent === 0 && row.managerTerms === null) {
    row.feeCents = 0;
    return stop('no_agency_fee', 'The effective agreement explicitly has no agency fee; manager pay is not recorded or assumed.');
  }

  if (noClosedServiceDays) row.reasons.push('No completed source dates in the approved service period yet.');
  else if (amountCents === null) row.reasons.push('Managed GMV is not recorded for this period.');
  else if (!gmvComplete) row.reasons.push('Recorded GMV coverage is partial; these amounts are provisional.');
  if (approvedPeriod) row.reasons.push(`Saved approved fixed amounts for ${approvedPeriod.start} through ${approvedPeriod.end}; no automatic proration.`);
  else if (row.partialPeriod) row.reasons.push('Full monthly fixed fees plus recorded GMV through the selected date; no month-end extrapolation.');
  try {
    const independentFee = !needsAgencyGmv(row.agencyTerms);
    // Zero is supplied only when the fee is algebraically independent of GMV;
    // the reported GMV remains NULL rather than inventing zero source data.
    const fee = calculateServiceRevenue({ client, month, periodStart: approvedPeriod?.start ?? bounds.start, periodEnd: approvedPeriod?.end ?? bounds.end,
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

/** Invoice review and missing variable inputs must not conceal confirmed fee components.
 * Exact totals remain separate; the known-component headline always uses one matched cohort.
 */
export function calculateRevenueTrueUp(input: RevenueTrueUpInput): RevenueTrueUpRow {
  const row = calculateExactRevenueTrueUp(input);
  const { client, month, throughDate, finance, gmv } = input;
  const term = row.agencyTerms;
  if (row.status === 'outside_service' || row.status === 'no_agency_fee' || !client.serviceStart || !isAgencyDate(client.serviceStart) || !term) return row;
  const bounds = agencyMonthBounds(month), service = clientServicePeriod(client, month);
  if (!service || (client.serviceEnd && (!isAgencyDate(client.serviceEnd) || client.serviceEnd < client.serviceStart))) return row;
  const creatorFee = term.feeModel === 'per_creator';
  if (row.billingReviewRequired && term.feeModel === 'fixed' && term.monthlyRetainer === 0 && term.revSharePercent === 0 && row.managerTerms === null) return row;
  if (row.status === 'review_required' && !row.billingReviewRequired && !creatorFee) return row;
  if (term.feeModel === 'tiered' && (!['marginal', 'whole'].includes(term.tierCalculation ?? '') || term.gmvBasis !== 'managed')) return row;
  const partialService = service.start !== bounds.start || service.end !== bounds.end;
  if (!creatorFee && partialService && !servicePeriodMatches(term.servicePeriod, service)) return row;
  if (term.servicePeriod && !servicePeriodMatches(term.servicePeriod, service)) return row;
  const sourcePeriod = creatorFee ? service : term.servicePeriod;
  const sourceStart = sourcePeriod?.start ?? bounds.start;
  const sourceEnd = sourcePeriod && sourcePeriod.end < throughDate ? sourcePeriod.end : throughDate;
  if (!creatorFee && ((gmv.amountCents !== null && (!Number.isSafeInteger(gmv.amountCents) || gmv.amountCents < 0)) ||
    (gmv.recordedThrough !== null && (!isAgencyDate(gmv.recordedThrough) || gmv.recordedThrough < sourceStart || gmv.recordedThrough > sourceEnd)) ||
    (term.servicePeriod && (gmv.periodStart !== sourceStart || gmv.periodEnd !== sourceEnd)))) return row;

  const cents = (amount: number) => {
    const result = Math.round(amount * 100);
    if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(result)) throw new Error('Invalid saved fixed amount.');
    return result;
  };
  try {
    // A contract review can hold GMV attribution/invoicing while its saved fixed amounts remain known.
    if (creatorFee) {
      if (!term.creatorRate) return row;
      row.creatorBilling = calculateCreatorBilling({ client, month, throughDate, rate: term.creatorRate,
        period: finance?.settings.creatorBillingPeriods?.find(period => period.month === month) ?? null });
      row.reasons = row.reasons.filter(reason => !/Partial service month requires|Resolve the flagged agreement|Managed GMV is not recorded|Full monthly fixed fees/.test(reason));
      row.reasons.push(...row.creatorBilling.reasons);
      row.knownFeeCents = row.creatorBilling.blocked ? null : row.creatorBilling.feeCents;
      row.feePending = row.creatorBilling.blocked || row.knownFeeCents === null;
      if (!row.billingReviewRequired && !row.feePending) row.feeCents = row.knownFeeCents;
    } else if (row.feeCents !== null) {
      row.knownFeeCents = row.feeCents;
      row.feePending = false;
    } else if (term.feeModel === 'fixed' || term.feeModel === 'additive' || term.feeModel === 'tiered') {
      row.knownFeeCents = cents(term.monthlyRetainer);
      row.feePending = needsAgencyGmv(term);
    } else if (term.feeModel === 'components' && term.managerComponent?.feeModel === 'additive') {
      row.knownFeeCents = cents(term.monthlyRetainer) + cents(term.managerComponent.monthlyRetainer);
      row.feePending = needsAgencyGmv(term);
    }
    const manager = row.managerTerms;
    const managerPeriodValid = manager && (!partialService || servicePeriodMatches(manager.servicePeriod, service)) &&
      (!manager.servicePeriod || servicePeriodMatches(manager.servicePeriod, service));
    if (managerPeriodValid) {
      const allocations = managerAllocations(manager);
      const managerNeedsGmv = allocations.some(allocation => allocation.gmvPercent !== 0);
      const managerGmvVerified = !creatorFee || (gmv.periodStart === sourceStart && gmv.periodEnd === sourceEnd &&
        (gmv.recordedThrough === null || (isAgencyDate(gmv.recordedThrough) && gmv.recordedThrough >= sourceStart && gmv.recordedThrough <= sourceEnd)));
      if (row.managerCents !== null) { row.knownManagerCents = row.managerCents; row.managerPending = false; }
      else if (!managerNeedsGmv || (!row.billingReviewRequired && row.gmvCents !== null && managerGmvVerified)) {
        row.knownManagerCents = calculateManagerCompensation(manager, row.gmvCents ?? 0).totalCents;
        row.managerPending = false;
        if (creatorFee && !row.billingReviewRequired) row.managerCents = row.knownManagerCents;
      } else if (allocations.every(allocation => (allocation.compensationModel ?? 'additive') === 'additive')) {
        row.knownManagerCents = allocations.reduce((sum, allocation) => sum + cents(allocation.fixedMonthly), 0);
        row.managerPending = true;
      }
    }
    if (row.billingReviewRequired) {
      row.reasons = row.reasons.filter(reason => !/Resolve the flagged agreement/.test(reason));
      row.reasons.push('Invoice approval remains pending. Confirmed fee components are shown separately from unresolved amounts.');
    }
    if (row.knownFeeCents !== null && row.knownManagerCents !== null) {
      if (!Number.isSafeInteger(row.knownFeeCents) || !Number.isSafeInteger(row.knownManagerCents)) throw new Error('Known amounts exceed supported limits.');
      row.knownRetainedCents = row.knownFeeCents - row.knownManagerCents;
      row.knownIncludedInTotals = true;
    }
    if (creatorFee && row.creatorBilling?.blocked) {
      row.status = row.creatorBilling.rosterConfirmed ? 'review_required' : 'needs_setup';
      row.feeCents = null; row.retainedCents = null; row.excludedFromTotals = true;
    } else if (creatorFee && row.feeCents !== null && row.managerCents !== null) {
      row.retainedCents = row.feeCents - row.managerCents;
      row.excludedFromTotals = false;
      const managerNeedsGmv = row.managerTerms && managerAllocations(row.managerTerms).some(allocation => allocation.gmvPercent !== 0);
      row.status = row.partialPeriod || row.billingReviewRequired || (managerNeedsGmv && !row.gmvComplete) ? 'provisional' : 'ready';
    } else if (row.knownFeeCents !== null || row.knownManagerCents !== null) {
      if (row.feePending || row.managerPending || row.billingReviewRequired) row.status = 'partial_estimate';
    }
    if (row.managerTerms === null && !row.reasons.some(reason => /manager pay arrangement/.test(reason))) row.reasons.push('Add a manager pay arrangement effective for this month.');
  } catch {
    row.knownFeeCents = null; row.knownManagerCents = null; row.knownRetainedCents = null; row.knownIncludedInTotals = false;
    row.status = 'review_required'; row.reasons.push('Review the saved component amounts or creator billing inputs.');
  }
  return row;
}

/** A single matched cohort guarantees gross less manager pay equals retained. */
export function sumRevenueTrueUps(rows: RevenueTrueUpRow[]): RevenueTrueUpTotals {
  const included = rows.filter(row => !row.excludedFromTotals && row.feeCents !== null && row.managerCents !== null && row.retainedCents !== null && !['review_required', 'needs_setup', 'outside_service', 'no_agency_fee'].includes(row.status));
  const total = (field: 'feeCents' | 'managerCents' | 'retainedCents') => {
    if (!included.length) return null;
    const value = included.reduce((sum, row) => sum + BigInt(row[field]!), BigInt(0));
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Revenue totals exceed supported limits.');
    return Number(value);
  };
  const known = rows.filter(row => row.knownIncludedInTotals && row.knownFeeCents !== null && row.knownManagerCents !== null && row.knownRetainedCents !== null && !['outside_service', 'no_agency_fee'].includes(row.status));
  const knownTotal = (field: 'knownFeeCents' | 'knownManagerCents' | 'knownRetainedCents') => {
    if (!known.length) return null;
    const value = known.reduce((sum, row) => sum + BigInt(row[field]!), BigInt(0));
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Revenue totals exceed supported limits.');
    return Number(value);
  };
  return {
    feeCents: total('feeCents'), managerCents: total('managerCents'), retainedCents: total('retainedCents'), totalCount: rows.length,
    supportedCount: included.length, includedCount: included.length, excludedCount: rows.length - included.length,
    partialCount: rows.filter(row => !['outside_service', 'no_agency_fee'].includes(row.status) && (row.coverage === 'partial' || row.partialPeriod)).length,
    provisionalCount: included.filter(row => row.status === 'provisional').length,
    reviewCount: rows.filter(row => row.status === 'review_required').length,
    missingCount: rows.filter(row => row.status === 'needs_setup').length,
    noAgencyFeeCount: rows.filter(row => row.status === 'no_agency_fee').length,
    knownFeeCents: knownTotal('knownFeeCents'), knownManagerCents: knownTotal('knownManagerCents'), knownRetainedCents: knownTotal('knownRetainedCents'),
    knownIncludedCount: known.length,
    pendingCount: rows.filter(row => !['outside_service', 'no_agency_fee'].includes(row.status) && (row.feePending || row.managerPending || row.billingReviewRequired)).length,
    complete: included.length > 0 && included.length === rows.filter(row => !['outside_service', 'no_agency_fee'].includes(row.status)).length && included.every(row => row.status === 'ready'),
  };
}
