import { agencyMonthBounds, calculateFeeComponent, calculateServiceRevenue, type AgencyTerms } from './model';
import { calculateManagerCompensation, managerAllocations } from './finance-model';
import type { RevenueTrueUpRow } from './revenue-model';

export interface RevenueTraceLine { label: string; amountCents: number | null; detail?: string }
export interface RevenueCalculationTrace { feeLines: RevenueTraceLine[]; managerLines: RevenueTraceLine[] }
type TraceInput = RevenueTrueUpRow & { managerRecipients?: Array<{ managerId: string; name: string | null }> };
const dollars = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
const shareDetail = (percent: number, gmvCents: number | null) => gmvCents === null
  ? `${percent}% of managed GMV; the share amount is pending.`
  : `${percent}% × ${dollars(gmvCents)} recorded managed GMV, rounded to cents.`;

function fallback(target: number | null, kind: 'fee' | 'manager', pending: boolean): RevenueTraceLine[] {
  return [{ label: target === null ? `${kind === 'fee' ? 'Agency fee' : 'Manager pay'} pending` : `Known ${kind === 'fee' ? 'agency fee' : 'manager pay'}`,
    amountCents: target,
    detail: target === null ? 'The source calculation has not established an amount.'
      : pending ? 'Authoritative known component amount. Additional components or approvals remain pending.'
        : 'Authoritative source-calculated amount for the saved arrangement.' }];
}

/** A trace is descriptive only: known lines must reconcile exactly to the source amount. */
function reconcile(lines: RevenueTraceLine[], target: number | null, kind: 'fee' | 'manager', pending: boolean): RevenueTraceLine[] {
  if (target === null) return fallback(null, kind, pending);
  if (!Number.isSafeInteger(target) || lines.length === 0
    || lines.some(line => line.amountCents !== null && (!Number.isSafeInteger(line.amountCents) || line.amountCents < 0))) return fallback(target, kind, pending);
  const known = lines.filter(line => line.amountCents !== null);
  const total = known.reduce((sum, line) => sum + BigInt(line.amountCents!), BigInt(0));
  return known.length > 0 && total === BigInt(target) ? lines : fallback(target, kind, pending);
}

function componentLines(label: string, fixed: number, percent: number, mode: 'additive' | 'minimum', gmv: number | null, pending: boolean, fixedDetail: string): RevenueTraceLine[] {
  if (pending) {
    if (mode === 'minimum') return [];
    const fixedCents = calculateFeeComponent(0, fixed, 0).fixedCents;
    return [{ label: `${label} fixed`, amountCents: fixedCents, detail: fixedDetail },
      ...(percent !== 0 ? [{ label: `${label} share pending`, amountCents: null, detail: shareDetail(percent, null) }] : [])];
  }
  if (gmv === null && percent !== 0) return [];
  // Zero is supplied only when the formula is algebraically independent of GMV.
  const result = calculateFeeComponent(gmv ?? 0, fixed, percent, mode);
  if (mode === 'minimum') return [{ label: `${label} higher-of amount`, amountCents: result.totalCents,
    detail: `Higher of ${dollars(Math.round(fixed * 100))} fixed or ${percent}% of recorded managed GMV. ${result.shareCents > 0 ? 'The share applies.' : 'The fixed amount applies.'}` }];
  return [
    ...(fixed !== 0 || percent === 0 ? [{ label: `${label} fixed`, amountCents: result.fixedCents, detail: fixedDetail }] : []),
    ...(percent !== 0 ? [{ label: `${label} managed-GMV share`, amountCents: result.shareCents, detail: shareDetail(percent, gmv) }] : []),
  ];
}

function agencyFeeLines(row: TraceInput): RevenueTraceLine[] {
  const terms = row.agencyTerms;
  if (!terms || row.knownFeeCents === null) return [];
  const fixedDetail = terms.servicePeriod
    ? `Saved amount for ${terms.servicePeriod.start} to ${terms.servicePeriod.end}; no further proration.`
    : 'Saved monthly fixed amount; no extrapolation or daily proration.';
  if (terms.feeModel === 'per_creator') return [{ label: 'Eligible creator sourcing fees', amountCents: row.knownFeeCents,
    detail: 'Source-calculated eligible creator days with contract rounding. Creator stipends are separate.' }];
  if (terms.feeModel === 'fixed') return componentLines('Agency fee', terms.monthlyRetainer, 0, 'additive', row.gmvCents, false, fixedDetail);
  if (terms.feeModel === 'share') return row.feePending ? [] : componentLines('Agency fee', 0, terms.revSharePercent, 'additive', row.gmvCents, false, fixedDetail);
  if (terms.feeModel === 'additive' || terms.feeModel === 'minimum') {
    return componentLines('Agency fee', terms.monthlyRetainer, terms.revSharePercent, terms.feeModel === 'minimum' ? 'minimum' : 'additive', row.gmvCents, row.feePending, fixedDetail);
  }
  if (terms.feeModel === 'components') {
    if (!terms.managerComponent) return [];
    return [
      ...componentLines('CC fee component', terms.monthlyRetainer, terms.revSharePercent, 'additive', row.gmvCents, row.feePending, fixedDetail),
      ...componentLines('Manager fee component', terms.managerComponent.monthlyRetainer, terms.managerComponent.revSharePercent, terms.managerComponent.feeModel, row.gmvCents, row.feePending, fixedDetail),
    ];
  }
  if (terms.feeModel === 'tiered') {
    if (terms.gmvBasis !== 'managed') return [{ label: 'Known agency fee', amountCents: row.knownFeeCents,
      detail: terms.gmvBasis === 'agency_supported_affiliate'
        ? 'The contract uses agency-supported affiliate GMV. Recorded managed GMV is not substituted for that basis; only the authoritative known amount is shown.'
        : 'The contract GMV basis needs confirmation. Only the authoritative known amount is shown.' }];
    if (row.feePending) return [{ label: 'Agency fee fixed', amountCents: calculateFeeComponent(0, terms.monthlyRetainer, 0).fixedCents, detail: fixedDetail },
      { label: 'Tiered share pending', amountCents: null, detail: 'The variable component is not established.' }];
    // This formula-only client carries the already-selected calculation period.
    // It never changes lifecycle or the revenue row, and reconciliation below
    // rejects any result which differs from the authoritative source amount.
    const period = terms.servicePeriod ?? agencyMonthBounds(row.month);
    const result = calculateServiceRevenue({
      client: { id: row.clientId, revision: 0, name: row.clientName, brandIds: [], serviceStart: period.start,
        serviceEnd: period.end, exitReason: null, updatedAt: null, terms: [terms as AgencyTerms] },
      month: row.month, periodStart: period.start, periodEnd: period.end, gmvCents: row.gmvCents, gmvComplete: row.gmvCents !== null,
    });
    if (result.status !== 'calculated' || result.shareCents === null || result.retainerCents === null) return [];
    return [{ label: 'Agency fee fixed', amountCents: result.retainerCents, detail: fixedDetail },
      { label: 'Tiered managed-GMV share', amountCents: result.shareCents,
        detail: `${terms.tierCalculation === 'marginal' ? 'Marginal bands' : 'Whole-GMV rate'} on recorded managed GMV; rounded once after applying the tiers.` }];
  }
  return [];
}

function managerPayLines(row: TraceInput): RevenueTraceLine[] {
  const terms = row.managerTerms;
  if (!terms || row.knownManagerCents === null) return [];
  const allocations = managerAllocations(terms);
  if (!row.managerPending) {
    // Verify the canonical recipient rounding before formatting component lines.
    const result = calculateManagerCompensation(terms, row.gmvCents);
    if (result.totalCents !== row.knownManagerCents) return [];
  }
  const fixedDetail = terms.servicePeriod
    ? `Saved pay for ${terms.servicePeriod.start} to ${terms.servicePeriod.end}; no further proration.`
    : 'Saved monthly fixed pay.';
  return allocations.flatMap((allocation, index) => {
    const name = row.managerRecipients?.find(person => person.managerId.toLowerCase() === allocation.managerId.toLowerCase())?.name?.trim()
      || `Pay recipient ${index + 1}`;
    return componentLines(name, allocation.fixedMonthly, allocation.gmvPercent, allocation.compensationModel ?? 'additive', row.gmvCents, row.managerPending, fixedDetail);
  });
}

/** Presentation trace only. Never replaces or mutates amounts, status, or inclusion decisions. */
export function revenueCalculationTrace(row: TraceInput): RevenueCalculationTrace {
  let feeLines: RevenueTraceLine[] = [], managerLines: RevenueTraceLine[] = [];
  try { feeLines = agencyFeeLines(row); } catch { /* Fall back to the source amount. */ }
  try { managerLines = managerPayLines(row); } catch { /* Fall back to the source amount. */ }
  return {
    feeLines: reconcile(feeLines, row.knownFeeCents, 'fee', row.feePending),
    managerLines: reconcile(managerLines, row.knownManagerCents, 'manager', row.managerPending),
  };
}
