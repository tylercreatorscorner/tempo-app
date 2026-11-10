import assert from 'node:assert/strict';
import { calculateRevenueTrueUp, type RevenueTrueUpInput, type RevenueTrueUpRow } from '../src/lib/agency/revenue-model';
import { revenueCalculationTrace, type RevenueTraceLine } from '../src/lib/agency/revenue-trace';
import type { AgencyTerms, ClientRecord } from '../src/lib/agency/model';
import type { ManagerTerms } from '../src/lib/agency/finance-model';

const client: ClientRecord = { id: 'client', revision: 1, name: 'Example', brandIds: ['brand'], serviceStart: '2026-01-01',
  serviceEnd: null, exitReason: null, updatedAt: null, terms: [] };
const fee: AgencyTerms = { effectiveMonth: '2026-10', monthlyRetainer: 2000, revSharePercent: 2, feeModel: 'components',
  managerComponent: { monthlyRetainer: 3000, revSharePercent: 3, feeModel: 'additive' } };
const manager: ManagerTerms = { effectiveMonth: '2026-10', managerId: 'manager', fixedMonthly: 3000, gmvPercent: 3, payoutDays: 7 };
const input = (terms: AgencyTerms = fee, pay: ManagerTerms | null = manager, amountCents: number | null = 10000000): RevenueTrueUpInput => ({
  client: { ...client, terms: [terms] }, month: '2026-10', throughDate: '2026-10-28',
  finance: pay ? { client_id: client.id, revision: 1, settings: { termsReviewRequired: false, managerTerms: [pay] } } : null,
  gmv: { amountCents, complete: amountCents !== null, recordedThrough: amountCents === null ? null : '2026-10-28' },
});
const knownSum = (lines: RevenueTraceLine[]) => lines.filter(line => line.amountCents !== null).reduce((sum, line) => sum + line.amountCents!, 0);
function check(row: RevenueTrueUpRow) {
  const before = JSON.stringify(row);
  const trace = revenueCalculationTrace(row);
  for (const [lines, target] of [[trace.feeLines, row.knownFeeCents], [trace.managerLines, row.knownManagerCents]] as const) {
    if (target === null) assert.ok(lines.every(line => line.amountCents === null), 'Unknown source totals do not gain guessed numeric components');
    else assert.equal(knownSum(lines), target, 'Each trace sums exactly to its authoritative known source amount');
  }
  assert.equal(JSON.stringify(row), before, 'The presentation trace cannot mutate source rows');
  return trace;
}

let row = calculateRevenueTrueUp(input());
let trace = check(row);
assert.deepEqual(trace.feeLines.map(line => line.amountCents), [200000, 200000, 300000, 300000]);
assert.deepEqual(trace.managerLines.map(line => line.amountCents), [300000, 300000]);
trace = revenueCalculationTrace({ ...row, managerRecipients: [{ managerId: 'manager', name: 'Hunter' }] });
assert.ok(trace.managerLines.every(line => line.label.startsWith('Hunter')));
assert.ok(trace.feeLines[1].detail?.includes('$100,000.00'), 'Trace uses cents, not rounded headline GMV');

for (const model of ['fixed', 'share', 'additive', 'minimum'] as const) {
  for (const amount of [0, 1, 9999999, 10000000, 50000000, null]) {
    row = calculateRevenueTrueUp(input({ ...fee, feeModel: model }, { ...manager, compensationModel: 'minimum' }, amount));
    check(row);
  }
}

row = calculateRevenueTrueUp(input({ ...fee, managerComponent: { monthlyRetainer: 6000, revSharePercent: 3, feeModel: 'minimum' } },
  { ...manager, fixedMonthly: 6000, compensationModel: 'minimum' }));
trace = check(row);
assert.ok(trace.feeLines.some(line => line.label.includes('higher-of') && line.amountCents === 600000));
assert.equal(trace.managerLines.length, 1, 'Higher-of alternatives are not added together');
assert.equal(trace.managerLines[0].amountCents, 600000);

const split: ManagerTerms = { ...manager, fixedMonthly: 0, gmvPercent: 100, allocations: [
  { managerId: 'one', fixedMonthly: 0, gmvPercent: 50 }, { managerId: 'two', fixedMonthly: 0, gmvPercent: 50 },
] };
row = calculateRevenueTrueUp(input({ ...fee, monthlyRetainer: 0, revSharePercent: 100, feeModel: 'share' }, split, 1));
trace = check(row);
assert.deepEqual(trace.managerLines.map(line => line.amountCents), [1, 1], 'Each recipient uses canonical half-up rounding before summing');
assert.equal(knownSum(trace.managerLines), 2);

row = calculateRevenueTrueUp(input(undefined, undefined, null));
trace = check(row);
assert.deepEqual(trace.feeLines.map(line => line.amountCents), [200000, null, 300000, null]);
assert.deepEqual(trace.managerLines.map(line => line.amountCents), [300000, null]);
assert.ok(trace.feeLines.filter(line => line.amountCents === null).every(line => line.label.includes('pending')));

const reviewed = input();
reviewed.finance!.settings.termsReviewRequired = true;
row = calculateRevenueTrueUp(reviewed);
trace = check(row);
assert.equal(row.gmvCents, 10000000);
assert.deepEqual(trace.feeLines.map(line => line.amountCents), [200000, null, 300000, null], 'Known GMV does not bypass a variable fee hold');
assert.deepEqual(trace.managerLines.map(line => line.amountCents), [300000, null]);

for (const tierCalculation of ['whole', 'marginal'] as const) {
  const tiered: AgencyTerms = { ...fee, feeModel: 'tiered', monthlyRetainer: 10000, gmvBasis: 'managed', tierCalculation,
    revShareTiers: [{ upToGmv: 100000, percent: 10 }, { upToGmv: 250000, percent: 7.5 }, { upToGmv: null, percent: 5 }] };
  for (const amount of [1, 10000000, 20000000, 30000001, null]) {
    row = calculateRevenueTrueUp(input(tiered, manager, amount));
    trace = check(row);
    assert.equal(trace.feeLines[0].amountCents, 1000000);
    if (amount !== null) assert.equal(trace.feeLines[1].amountCents, row.knownFeeCents! - 1000000);
    else assert.equal(trace.feeLines[1].amountCents, null);
  }
}
const alternateBasis: AgencyTerms = { ...fee, feeModel: 'tiered', gmvBasis: 'agency_supported_affiliate', tierCalculation: 'marginal',
  revShareTiers: [{ upToGmv: null, percent: 5 }] };
check(calculateRevenueTrueUp(input(alternateBasis)));
trace = check({ ...calculateRevenueTrueUp(input()), agencyTerms: alternateBasis });
assert.equal(trace.feeLines.length, 1);
assert.equal(trace.feeLines[0].amountCents, 1000000);
assert.ok(trace.feeLines[0].detail?.includes('agency-supported affiliate GMV'));
assert.ok(trace.feeLines[0].detail?.includes('not substituted'));
assert.ok(!trace.feeLines.some(line => line.label === 'Tiered managed-GMV share'));

const period = { start: '2026-10-15', end: '2026-10-31' };
const partial = input({ ...fee, feeModel: 'additive', monthlyRetainer: 5483.87, revSharePercent: 0, servicePeriod: period },
  { ...manager, fixedMonthly: 1645.16, gmvPercent: 0, servicePeriod: period }, 0);
partial.client.serviceStart = period.start;
partial.gmv.periodStart = period.start;
partial.gmv.periodEnd = '2026-10-28';
row = calculateRevenueTrueUp(partial);
trace = check(row);
assert.equal(trace.feeLines[0].amountCents, 548387, 'Approved period amount is never prorated a second time');
assert.equal(trace.managerLines[0].amountCents, 164516);
assert.ok(trace.feeLines[0].detail?.includes('no further proration'));

const creatorInput = input({ ...fee, feeModel: 'per_creator', monthlyRetainer: 0, revSharePercent: 0,
  creatorRate: { monthlyFee: 500, maxCreators: 50, monthlyBudgetCap: 100000 } }, { ...manager, fixedMonthly: 0, gmvPercent: 0 });
row = calculateRevenueTrueUp(creatorInput);
trace = check(row);
assert.equal(trace.feeLines[0].amountCents, null, 'Unconfirmed per-creator roster never becomes zero sourcing fees');
creatorInput.finance!.settings.creatorBillingPeriods = [{ month: '2026-10', rosterConfirmed: true, headcountApproval: '', budgetApproval: '',
  creators: [{ id: '00000000-0000-4000-8000-000000000001', handle: 'creator', activeFrom: '2026-10-01', activeThrough: null, approved: true, onboarded: true, tapAuthorized: true, tier: 'L2' }] }];
row = calculateRevenueTrueUp(creatorInput);
trace = check(row);
assert.equal(trace.feeLines.length, 1);
assert.equal(trace.feeLines[0].amountCents, row.creatorBilling!.feeCents, 'Per-creator trace uses canonical eligible-day amount');
assert.ok(trace.feeLines[0].detail?.includes('Creator stipends are separate'));

const normal = calculateRevenueTrueUp(input());
trace = check({ ...normal, knownFeeCents: normal.knownFeeCents! + 1, knownManagerCents: normal.knownManagerCents! + 1 });
assert.equal(trace.feeLines.length, 1);
assert.equal(trace.managerLines.length, 1);
assert.ok(trace.feeLines[0].label.includes('Known'), 'A mismatching presentation breakdown falls back to the authoritative amount');
trace = check({ ...normal, gmvCents: -1 });
assert.equal(trace.feeLines.length, 1);
assert.equal(trace.managerLines.length, 1);
trace = check({ ...normal, knownFeeCents: null, knownManagerCents: null });
assert.ok([...trace.feeLines, ...trace.managerLines].every(line => line.amountCents === null));
console.log('PASS revenue trace: exact component and recipient rounding, all fee models, pending variable holds, authoritative fallback, approved partial periods, no unknown zero, no double proration and no mutation');
