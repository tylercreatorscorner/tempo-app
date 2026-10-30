import assert from 'node:assert/strict';
import { calculateRevenueTrueUp, sumRevenueTrueUps, type RevenueTrueUpInput } from '../src/lib/agency/revenue-model';
import { emptyFinanceSettings, type FinanceRecord } from '../src/lib/agency/finance-model';
import type { ClientRecord } from '../src/lib/agency/model';

const client: ClientRecord = { id: 'client', revision: 1, name: 'Example', brandIds: ['brand'], serviceStart: '2026-01-01', serviceEnd: null, exitReason: null, updatedAt: null,
  terms: [{ effectiveMonth: '2026-09', monthlyRetainer: 1000, revSharePercent: 1, feeModel: 'additive' },
    { effectiveMonth: '2026-10', monthlyRetainer: 2000, revSharePercent: 2, feeModel: 'components', managerComponent: { monthlyRetainer: 3000, revSharePercent: 3, feeModel: 'additive' } }] };
const finance: FinanceRecord = { client_id: client.id, revision: 1, settings: { ...emptyFinanceSettings(), managerTerms: [
  { effectiveMonth: '2026-09', managerId: 'manager', fixedMonthly: 100, gmvPercent: 0.5, payoutDays: 7 },
  { effectiveMonth: '2026-10', managerId: 'manager', fixedMonthly: 3000, gmvPercent: 3, compensationModel: 'additive', payoutDays: 7 },
] } };
const input: RevenueTrueUpInput = { client, finance, month: '2026-10', throughDate: '2026-10-28', gmv: { amountCents: 10000000, complete: true, recordedThrough: '2026-10-28' } };
const unchanged = JSON.stringify(input);
const row = calculateRevenueTrueUp(input);
assert.equal(row.feeCents, 1000000, 'Gross includes full monthly CC + manager fixed fees and recorded GMV shares');
assert.equal(row.managerCents, 600000);
assert.equal(row.retainedCents, 400000);
assert.equal(row.status, 'provisional', 'Current partial month is an estimate even with complete MTD coverage');
assert.equal(row.excludedFromTotals, false);
assert.equal(row.gmvCents, 10000000, 'Recorded GMV is not extrapolated to month-end');
assert.equal(JSON.stringify(input), unchanged, 'Calculation never mutates sources');
assert.equal(row.gmvComplete, true);
assert.equal(row.coverage, 'complete');

const partial = calculateRevenueTrueUp({ ...input, gmv: { ...input.gmv, complete: false, recordedThrough: '2026-10-12' } });
assert.equal(partial.feeCents, row.feeCents, 'Known partial coverage remains a provisional supported scenario');
assert.equal(partial.status, 'provisional');
assert.equal(partial.coverage, 'partial');
assert.equal(partial.gmvComplete, false);
assert.ok(partial.reasons.some(reason => /coverage is partial/.test(reason)));
const missing = calculateRevenueTrueUp({ ...input, gmv: { amountCents: null, complete: false, recordedThrough: null } });
assert.equal(missing.feeCents, null);
assert.equal(missing.managerCents, null);
assert.equal(missing.retainedCents, null);
assert.equal(missing.gmvCents, null, 'Missing GMV never becomes zero');
assert.equal(missing.excludedFromTotals, true);
const firstDay = calculateRevenueTrueUp({ ...input, month: '2026-11', throughDate: '2026-10-31', gmv: { amountCents: null, complete: false, recordedThrough: null } });
assert.equal(firstDay.feeCents, null);
assert.ok(firstDay.reasons.some(reason => /No completed source dates/.test(reason)));
const zero = calculateRevenueTrueUp({ ...input, gmv: { ...input.gmv, amountCents: 0 } });
assert.equal(zero.feeCents, 500000, 'Recorded explicit zero still carries the full monthly retainers');
assert.equal(zero.managerCents, 300000);
assert.equal(zero.retainedCents, 200000);

const september = calculateRevenueTrueUp({ ...input, month: '2026-09', throughDate: '2026-09-30', gmv: { amountCents: 10000000, complete: true, recordedThrough: '2026-09-30' } });
assert.equal(september.feeCents, 200000);
assert.equal(september.managerCents, 60000);
assert.equal(september.retainedCents, 140000);
assert.equal(september.status, 'ready');
const noManager = calculateRevenueTrueUp({ ...input, finance: null });
assert.equal(noManager.feeCents, 1000000, 'Gross may be known without manager pay');
assert.equal(noManager.managerCents, null);
assert.equal(noManager.retainedCents, null);
assert.equal(noManager.excludedFromTotals, true);
assert.equal(calculateRevenueTrueUp({ ...input, finance: { ...finance, settings: { ...finance.settings, termsReviewRequired: true } } }).feeCents, null);
for (const changed of [{ ...client, serviceStart: null }, { ...client, terms: [] }]) assert.equal(calculateRevenueTrueUp({ ...input, client: changed }).status, 'needs_setup');
for (const changed of [{ ...client, serviceStart: '2026-10-02' }, { ...client, serviceEnd: '2026-10-20', exitReason: 'Ended' }]) {
  const review = calculateRevenueTrueUp({ ...input, client: changed });
  assert.equal(review.status, 'review_required');
  assert.equal(review.feeCents, null, 'Partial service months are not prorated or charged a guessed fee');
}
assert.equal(calculateRevenueTrueUp({ ...input, client: { ...client, historical: true, serviceStart: null } }).status, 'outside_service');
assert.equal(calculateRevenueTrueUp({ ...input, client: { ...client, serviceEnd: '2026-09-30', exitReason: 'Ended' } }).status, 'outside_service');
assert.equal(calculateRevenueTrueUp({ ...input, client: { ...client, serviceStart: '2026-11-01' } }).status, 'outside_service');
assert.equal(calculateRevenueTrueUp({ ...input, gmv: { ...input.gmv, amountCents: -1 } }).status, 'review_required');
assert.equal(calculateRevenueTrueUp({ ...input, gmv: { ...input.gmv, recordedThrough: '2026-10-29' } }).status, 'review_required');
assert.throws(() => calculateRevenueTrueUp({ ...input, throughDate: '2026-09-29' }), /through date/);
assert.throws(() => calculateRevenueTrueUp({ ...input, finance: { ...finance, client_id: 'another' } }), /belong/);

const minimumClient: ClientRecord = { ...client, terms: [{ effectiveMonth: '2026-10', monthlyRetainer: 4000, revSharePercent: 2, feeModel: 'components', managerComponent: { monthlyRetainer: 6000, revSharePercent: 3, feeModel: 'minimum' } }] };
const minimumFinance: FinanceRecord = { ...finance, settings: { ...finance.settings, managerTerms: [{ effectiveMonth: '2026-10', managerId: 'manager', fixedMonthly: 6000, gmvPercent: 3, compensationModel: 'minimum', payoutDays: 7 }] } };
for (const [gmvCents, expectedFee, expectedPay] of [[10000000, 1200000, 600000], [20000000, 1400000, 600000], [30000000, 1900000, 900000]]) {
  const result = calculateRevenueTrueUp({ ...input, client: minimumClient, finance: minimumFinance, gmv: { ...input.gmv, amountCents: gmvCents } });
  assert.equal(result.feeCents, expectedFee);
  assert.equal(result.managerCents, expectedPay);
  assert.equal(result.retainedCents, expectedFee - expectedPay);
}
const splitFinance: FinanceRecord = { ...finance, settings: { ...finance.settings, managerTerms: [{ effectiveMonth: '2026-10', managerId: 'one', fixedMonthly: 3000, gmvPercent: 3, compensationModel: 'additive', payoutDays: 7,
  allocations: [{ managerId: 'one', fixedMonthly: 3000, gmvPercent: 2 }, { managerId: 'two', fixedMonthly: 0, gmvPercent: 1 }] }] } };
assert.equal(calculateRevenueTrueUp({ ...input, finance: splitFinance }).managerCents, 600000, 'Split recipients add once without duplicating the pool');
const tieredClient: ClientRecord = { ...client, terms: [{ effectiveMonth: '2026-10', monthlyRetainer: 10000, revSharePercent: 0, feeModel: 'tiered', gmvBasis: 'managed', tierCalculation: 'marginal', revShareTiers: [{ upToGmv: 500000, percent: 10 }, { upToGmv: 1500000, percent: 7.5 }, { upToGmv: 3500000, percent: 6.5 }, { upToGmv: null, percent: 5.5 }] }] };
assert.equal(calculateRevenueTrueUp({ ...input, client: tieredClient, gmv: { ...input.gmv, amountCents: 400000000 } }).feeCents, 29250000, 'Reviewed marginal tiers stay exact');
assert.equal(calculateRevenueTrueUp({ ...input, client: { ...tieredClient, terms: [{ ...tieredClient.terms[0], tierCalculation: 'unconfirmed' }] } }).status, 'review_required');
assert.equal(calculateRevenueTrueUp({ ...input, client: { ...tieredClient, terms: [{ ...tieredClient.terms[0], gmvBasis: 'agency_supported_affiliate' }] } }).feeCents, null, 'Managed GMV never substitutes for unverified contract attribution');
const cents = calculateRevenueTrueUp({ ...input, client: { ...client, terms: [{ effectiveMonth: '2026-10', monthlyRetainer: 0, revSharePercent: 50, feeModel: 'share' }] }, gmv: { ...input.gmv, amountCents: 1 } });
assert.equal(cents.feeCents, 1, 'Half-up cent rounding uses the same fee math as invoices');

const fixedOnly = calculateRevenueTrueUp({ ...input, client: { ...client, terms: [{ effectiveMonth: '2026-10', monthlyRetainer: 1000, revSharePercent: 0, feeModel: 'fixed' }] }, finance: { ...finance, settings: { ...finance.settings, managerTerms: [{ effectiveMonth: '2026-10', managerId: 'one', fixedMonthly: 100, gmvPercent: 0, payoutDays: 7 }] } }, gmv: { amountCents: null, complete: false, recordedThrough: null } });
assert.equal(fixedOnly.gmvCents, null);
assert.equal(fixedOnly.feeCents, 100000);
assert.equal(fixedOnly.managerCents, 10000);
assert.equal(fixedOnly.retainedCents, 90000, 'GMV-independent amounts remain known without inventing GMV');
const noFeeClient: ClientRecord = { ...client, terms: [...client.terms.filter(term => term.effectiveMonth < '2026-10'), { effectiveMonth: '2026-10', monthlyRetainer: 0, revSharePercent: 0, feeModel: 'fixed' }] };
const noFee = calculateRevenueTrueUp({ ...input, client: noFeeClient, finance: null, gmv: { amountCents: null, complete: false, recordedThrough: null } });
assert.equal(noFee.status, 'no_agency_fee');
assert.equal(noFee.feeCents, 0);
assert.equal(noFee.managerCents, null, 'No agency fee does not invent zero manager pay');
assert.equal(noFee.retainedCents, null);
assert.equal(noFee.excludedFromTotals, true);
assert.equal(noFee.gmvCents, null);
assert.ok(!noFee.reasons.some(reason => /Add a manager/.test(reason)));
const priorNoFee = calculateRevenueTrueUp({ ...input, client: noFeeClient, finance: null, month: '2026-09', throughDate: '2026-09-30', gmv: { amountCents: 10000000, complete: true, recordedThrough: '2026-09-30' } });
assert.equal(priorNoFee.status, 'partial_estimate', 'The prior month keeps its known agency fee with manager pay unresolved');
assert.equal(priorNoFee.feeCents, 200000);
const zeroGrossWithPay = calculateRevenueTrueUp({ ...input, client: noFeeClient });
assert.equal(zeroGrossWithPay.status, 'provisional');
assert.equal(zeroGrossWithPay.managerCents, 600000);
assert.equal(zeroGrossWithPay.retainedCents, -600000, 'Real manager obligations remain visible as negative retained even when gross is zero');
assert.equal(zeroGrossWithPay.excludedFromTotals, false);
for (const terms of [
  { effectiveMonth: '2026-10', monthlyRetainer: 0, revSharePercent: 0, feeModel: 'share' as const },
  { effectiveMonth: '2026-10', monthlyRetainer: 0, revSharePercent: 1, feeModel: 'fixed' as const },
]) assert.notEqual(calculateRevenueTrueUp({ ...input, client: { ...client, terms: [terms] }, finance: null }).status, 'no_agency_fee', 'Only fully explicit fixed zero terms permit the exemption');
assert.equal(calculateRevenueTrueUp({ ...input, client: { ...noFeeClient, serviceStart: '2026-10-15' }, finance: null }).status, 'review_required');
assert.equal(calculateRevenueTrueUp({ ...input, client: noFeeClient, finance: { ...finance, settings: { ...finance.settings, managerTerms: [], termsReviewRequired: true } } }).status, 'review_required');
const noFeeSummary = sumRevenueTrueUps([september, noFee]);
assert.equal(noFeeSummary.noAgencyFeeCount, 1);
assert.equal(noFeeSummary.missingCount, 0);
assert.equal(noFeeSummary.partialCount, 0);
assert.equal(noFeeSummary.includedCount, 1);
assert.equal(noFeeSummary.complete, true);
assert.equal(noFeeSummary.feeCents, september.feeCents);
assert.equal(sumRevenueTrueUps([noFee]).feeCents, null, 'An entirely excluded no-fee cohort does not fabricate matched manager/net totals');
const servicePeriod = { start: '2026-10-15', end: '2026-10-31' };
const approvedClient: ClientRecord = { ...client, serviceStart: servicePeriod.start, terms: [{ effectiveMonth: '2026-10', monthlyRetainer: 3838.71, revSharePercent: 3, feeModel: 'components', managerComponent: { monthlyRetainer: 1645.16, revSharePercent: 2, feeModel: 'additive' }, servicePeriod }] };
const approvedFinance: FinanceRecord = { ...finance, settings: { ...finance.settings, managerTerms: [{ effectiveMonth: '2026-10', managerId: 'one', fixedMonthly: 1645.16, gmvPercent: 2, payoutDays: 7, servicePeriod }] } };
const approvedInput: RevenueTrueUpInput = { ...input, client: approvedClient, finance: approvedFinance, gmv: { ...input.gmv, periodStart: '2026-10-15', periodEnd: input.throughDate } };
const approved = calculateRevenueTrueUp(approvedInput);
assert.equal(approved.feeCents, 1048387);
assert.equal(approved.managerCents, 364516);
assert.equal(approved.retainedCents, 683871);
assert.equal(approved.status, 'provisional');
assert.equal(approved.excludedFromTotals, false);
assert.equal(approved.gmvCents, input.gmv.amountCents);
assert.ok(approved.reasons.some(reason => reason.includes('Saved approved fixed amounts')));
const approvedZero = calculateRevenueTrueUp({ ...approvedInput, gmv: { ...approvedInput.gmv, amountCents: 0 } });
assert.equal(approvedZero.feeCents, 548387, '$10,000 approved at 17/31 is stored as $5,483.87, not recomputed');
assert.equal(approvedZero.managerCents, 164516);
assert.equal(approvedZero.retainedCents, 383871);
for (const gmv of [input.gmv, { ...approvedInput.gmv, periodStart: '2026-10-01' }, { ...approvedInput.gmv, periodEnd: '2026-10-27' }]) {
  const blocked = calculateRevenueTrueUp({ ...approvedInput, gmv });
  assert.equal(blocked.status, 'review_required', 'Whole-month or unverified GMV cannot feed a partial-service approval');
  assert.equal(blocked.feeCents, null);
}
const managerWithoutPeriod = { ...approvedFinance, settings: { ...approvedFinance.settings, managerTerms: [{ ...approvedFinance.settings.managerTerms[0], servicePeriod: undefined }] } };
assert.equal(calculateRevenueTrueUp({ ...approvedInput, finance: managerWithoutPeriod }).status, 'review_required');
assert.equal(calculateRevenueTrueUp({ ...approvedInput, finance: { ...approvedFinance, settings: { ...approvedFinance.settings, managerTerms: [{ ...approvedFinance.settings.managerTerms[0], servicePeriod: { start: '2026-10-16', end: '2026-10-31' } }] } } }).status, 'review_required');
assert.equal(calculateRevenueTrueUp({ ...approvedInput, client: { ...approvedClient, serviceStart: '2026-10-16' } }).status, 'review_required');
assert.equal(calculateRevenueTrueUp({ ...approvedInput, finance: { ...approvedFinance, settings: { ...approvedFinance.settings, termsReviewRequired: true } } }).status, 'partial_estimate');
const beforeApprovedStart = calculateRevenueTrueUp({ ...approvedInput, throughDate: '2026-10-14', gmv: { amountCents: null, complete: false, recordedThrough: null, periodStart: '2026-10-15', periodEnd: '2026-10-14' } });
assert.equal(beforeApprovedStart.gmvCents, null);
assert.equal(beforeApprovedStart.feeCents, null);
assert.ok(beforeApprovedStart.reasons.some(reason => reason.includes('No completed source dates')));
const noRestore = calculateRevenueTrueUp({ ...approvedInput, month: '2026-11', throughDate: '2026-11-28', gmv: { amountCents: 10000000, complete: true, recordedThrough: '2026-11-28' } });
assert.equal(noRestore.status, 'needs_setup');
assert.equal(noRestore.agencyTerms, null);
assert.equal(noRestore.managerTerms, null);
const restoredClient: ClientRecord = { ...approvedClient, terms: [...approvedClient.terms, { effectiveMonth: '2026-11', monthlyRetainer: 7000, revSharePercent: 3, feeModel: 'components', managerComponent: { monthlyRetainer: 3000, revSharePercent: 2, feeModel: 'additive' } }] };
const restoredFinance: FinanceRecord = { ...approvedFinance, settings: { ...approvedFinance.settings, managerTerms: [...approvedFinance.settings.managerTerms, { effectiveMonth: '2026-11', managerId: 'one', fixedMonthly: 3000, gmvPercent: 2, payoutDays: 7 }] } };
const restored = calculateRevenueTrueUp({ ...approvedInput, client: restoredClient, finance: restoredFinance, month: '2026-11', throughDate: '2026-11-28', gmv: { amountCents: 10000000, complete: true, recordedThrough: '2026-11-28' } });
assert.equal(restored.feeCents, 1500000);
assert.equal(restored.managerCents, 500000);
assert.equal(restored.retainedCents, 1000000);
const summary = sumRevenueTrueUps([row, noManager, missing, september]);
assert.equal(summary.includedCount, 2);
assert.equal(summary.excludedCount, 2);
assert.equal(summary.feeCents, 1200000, 'Headline gross excludes the same missing-manager cohort as manager/net totals');
assert.equal(summary.managerCents, 660000);
assert.equal(summary.retainedCents, 540000);
assert.equal(summary.feeCents! - summary.managerCents!, summary.retainedCents);
assert.equal(summary.complete, false);
const outside = calculateRevenueTrueUp({ ...input, client: { ...client, serviceStart: '2026-11-01' } });
assert.equal(outside.partialPeriod, true);
assert.equal(sumRevenueTrueUps([row, partial, noManager, outside]).partialCount, 3, 'Partial badge counts the active table population, excluding outside-service rows');
assert.equal(sumRevenueTrueUps([outside]).partialCount, 0, 'A hidden outside-service population cannot inflate the partial badge');
assert.equal(sumRevenueTrueUps([september]).complete, true);
assert.equal(sumRevenueTrueUps([missing]).feeCents, null);
assert.equal(sumRevenueTrueUps([]).retainedCents, null);
assert.throws(() => sumRevenueTrueUps([{ ...row, feeCents: Number.MAX_SAFE_INTEGER }, { ...row, feeCents: 1 }]), /exceed/);
const afil: ClientRecord = { ...client, serviceStart: '2026-10-01', terms: [{ effectiveMonth: '2026-10', monthlyRetainer: 4000, revSharePercent: 3, feeModel: 'components', managerComponent: { monthlyRetainer: 3000, revSharePercent: 2, feeModel: 'additive' } }] };
const afilFinance: FinanceRecord = { ...finance, settings: { ...finance.settings, termsReviewRequired: true, managerTerms: [{ effectiveMonth: '2026-10', managerId: 'manager', fixedMonthly: 3000, gmvPercent: 2, compensationModel: 'additive', payoutDays: 7 }] } };
const afilKnown = calculateRevenueTrueUp({ ...input, client: afil, finance: afilFinance, gmv: { amountCents: null, recordedThrough: null, complete: false } });
assert.equal(afilKnown.feeCents, null, 'Unknown GMV share never becomes an exact total');
assert.equal(afilKnown.gmvCents, null);
assert.equal(afilKnown.knownFeeCents, 700000);
assert.equal(afilKnown.knownManagerCents, 300000);
assert.equal(afilKnown.knownRetainedCents, 400000);
assert.equal(afilKnown.status, 'partial_estimate');
assert.equal(afilKnown.knownIncludedInTotals, true);
assert.equal(afilKnown.feePending, true); assert.equal(afilKnown.managerPending, true);
assert.equal(afilKnown.billingReviewRequired, true, 'Showing the operational estimate does not approve invoicing or signatures');
const knownTotals = sumRevenueTrueUps([row, afilKnown, noManager, outside]);
assert.equal(knownTotals.knownIncludedCount, 2, 'Known amount cards use one matched fee/pay cohort');
assert.equal(knownTotals.knownFeeCents, 1700000);
assert.equal(knownTotals.knownManagerCents, 900000);
assert.equal(knownTotals.knownRetainedCents, 800000);
assert.equal(knownTotals.knownFeeCents! - knownTotals.knownManagerCents!, knownTotals.knownRetainedCents);
assert.equal(knownTotals.feeCents, row.feeCents, 'Existing exact-cohort totals retain their meaning');
assert.throws(() => sumRevenueTrueUps([{ ...afilKnown, knownFeeCents: Number.MAX_SAFE_INTEGER }, afilKnown]), /exceed/);
const creatorClient: ClientRecord = { ...client, serviceStart: '2026-10-15', terms: [{ effectiveMonth: '2026-10', monthlyRetainer: 0, revSharePercent: 0, feeModel: 'per_creator', creatorRate: { monthlyFee: 500, maxCreators: 50, monthlyBudgetCap: 100000 } }] };
const creatorRow = { id: '00000000-0000-4000-8000-000000000020', handle: 'example.creator', activeFrom: '2026-10-15', activeThrough: null, approved: true, onboarded: true, tapAuthorized: true, tier: 'L2' as const };
const creatorFinance: FinanceRecord = { ...finance, settings: { ...emptyFinanceSettings(), creatorBillingPeriods: [{ month: '2026-10', rosterConfirmed: true, headcountApproval: '', budgetApproval: '', creators: [creatorRow] }] } };
const creatorEstimate = calculateRevenueTrueUp({ ...input, client: creatorClient, finance: creatorFinance, throughDate: '2026-10-29', gmv: { amountCents: null, recordedThrough: null, complete: false } });
assert.equal(creatorEstimate.knownFeeCents, 24194, 'One creator billed for 15/31 active days through October 29, rounded per creator');
assert.equal(creatorEstimate.feeCents, 24194, 'GMV is not a prerequisite for per-creator sourcing fees');
assert.equal(creatorEstimate.knownManagerCents, null, 'Unknown manager compensation stays unknown');
assert.equal(creatorEstimate.knownRetainedCents, null);
assert.equal(creatorEstimate.knownIncludedInTotals, false);
assert.equal(creatorEstimate.creatorBilling?.stipendCents, 24194, 'Creator stipends are separate from agency fee income');
const unverifiedRoster = calculateRevenueTrueUp({ ...input, client: creatorClient, finance: { ...creatorFinance, settings: { ...creatorFinance.settings, creatorBillingPeriods: [] } } });
assert.equal(unverifiedRoster.knownFeeCents, null, 'No reviewed roster means unknown, not zero');
const verifiedEmpty = calculateRevenueTrueUp({ ...input, client: creatorClient, finance: { ...creatorFinance, settings: { ...creatorFinance.settings, creatorBillingPeriods: [{ ...creatorFinance.settings.creatorBillingPeriods[0], creators: [] }] } } });
assert.equal(verifiedEmpty.knownFeeCents, 0, 'A deliberately verified empty roster can calculate zero');
assert.notEqual(verifiedEmpty.status, 'no_agency_fee', 'A zero activity month never becomes a no-fee contract');
const variableManagerFinance: FinanceRecord = { ...creatorFinance, settings: { ...creatorFinance.settings, managerTerms: [{ effectiveMonth: '2026-10', managerId: 'manager', fixedMonthly: 0, gmvPercent: 2, payoutDays: 7, servicePeriod }] } };
const incompleteCreatorMonth = calculateRevenueTrueUp({ ...input, client: creatorClient, finance: variableManagerFinance, throughDate: '2026-10-31',
  gmv: { amountCents: 1000000, recordedThrough: '2026-10-28', complete: false, periodStart: '2026-10-15', periodEnd: '2026-10-31' } });
assert.equal(incompleteCreatorMonth.status, 'provisional', 'A completed creator month does not erase incomplete GMV-dependent manager coverage');
assert.equal(sumRevenueTrueUps([incompleteCreatorMonth]).complete, false);
const completeCreatorMonth = calculateRevenueTrueUp({ ...input, client: creatorClient, finance: variableManagerFinance, throughDate: '2026-10-31',
  gmv: { amountCents: 1000000, recordedThrough: '2026-10-31', complete: true, periodStart: '2026-10-15', periodEnd: '2026-10-31' } });
assert.equal(completeCreatorMonth.status, 'ready');
const fixedManagerFinance: FinanceRecord = { ...variableManagerFinance, settings: { ...variableManagerFinance.settings, managerTerms: [{ ...variableManagerFinance.settings.managerTerms[0], fixedMonthly: 100, gmvPercent: 0 }] } };
const independentCreatorMonth = calculateRevenueTrueUp({ ...input, client: creatorClient, finance: fixedManagerFinance, throughDate: '2026-10-31', gmv: { amountCents: null, recordedThrough: null, complete: false } });
assert.equal(independentCreatorMonth.status, 'ready', 'GMV-independent source fees and fixed pay can be ready without fabricated GMV');
console.log('PASS automatic agency true-up: MTD/full fees, missing/partial coverage, effective months, lifecycle/review blocks, exact OR/tier/split cents, matched totals and no billing/manual forecast requirements');
