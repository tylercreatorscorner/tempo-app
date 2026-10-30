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
console.log('PASS automatic agency true-up: MTD/full fees, missing/partial coverage, effective months, lifecycle/review blocks, exact OR/tier/split cents, matched totals and no billing/manual forecast requirements');
