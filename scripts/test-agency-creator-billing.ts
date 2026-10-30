import assert from 'node:assert/strict';
import { calculateCreatorBilling, creatorBillingPeriodSchema, creatorBillingPeriodsSchema, DEFAULT_CREATOR_RATE, type CreatorBillingCreator, type CreatorBillingPeriod } from '../src/lib/agency/creator-billing';
import { buildInvoice, emptyFinanceSettings, financeSettingsSchema, forecast, type AgencyInvoice } from '../src/lib/agency/finance-model';
import { calculateServiceRevenue, validateClientSaveInput, type ClientRecord } from '../src/lib/agency/model';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const creator = (n: number, extra: Partial<CreatorBillingCreator> = {}): CreatorBillingCreator => ({ id: id(n), handle: `creator${n}`, activeFrom: '2026-10-01', activeThrough: null, approved: true, onboarded: true, tapAuthorized: true, tier: 'L2', ...extra });
const period = (creators: CreatorBillingCreator[], extra: Partial<CreatorBillingPeriod> = {}): CreatorBillingPeriod => ({ month: '2026-10', rosterConfirmed: true, headcountApproval: '', budgetApproval: '', creators, ...extra });
const client = { serviceStart: '2026-10-15', serviceEnd: null };
const calc = (ledger: CreatorBillingPeriod | null, throughDate = '2026-10-31') => calculateCreatorBilling({ client, month: '2026-10', throughDate, rate: DEFAULT_CREATOR_RATE, period: ledger });
assert.equal(calc(null).feeCents, null);
assert.equal(calc(period([], { rosterConfirmed: false })).feeCents, null, 'Unconfirmed empty roster is unknown');
assert.equal(calc(period([])).feeCents, 0, 'A confirmed empty actual roster is a known zero');
assert.equal(calc(period([])).eligibleCount, 0);
assert.equal(calc(period([creator(1)])).feeCents, 27419, 'October 15-31 sourcing uses 17/31 days and half-up cents');
assert.equal(calc(period([creator(1)])).stipendCents, 27419);
const actual = calc(period([creator(1, { tier: 'L3', activeFrom: '2026-10-10' }), creator(2, { tier: 'L4', activeFrom: '2026-10-21', activeThrough: '2026-10-23' })]), '2026-10-22');
assert.deepEqual(actual.creators.map(row => row.activeDays), [8, 2]);
assert.deepEqual(actual.creators.map(row => row.sourceFeeCents), [12903, 3226]);
assert.deepEqual(actual.creators.map(row => row.stipendCents), [38710, 22581]);
assert.equal(actual.feeCents, 16129); assert.equal(actual.stipendCents, 61291);
assert.equal(actual.combinedCents, 77420, 'Stipends and sourcing are separately rounded per creator');
for (const field of ['approved', 'onboarded', 'tapAuthorized'] as const) {
  const blockedCreator = calc(period([creator(1, { [field]: false })]));
  assert.equal(blockedCreator.feeCents, 0); assert.equal(blockedCreator.eligibleCount, 0);
  assert.deepEqual(blockedCreator.creators[0].missingRequirements, [field]);
}
const unconfirmed = calc(period([creator(1)], { rosterConfirmed: false }));
assert.equal(unconfirmed.eligibleCount, null); assert.equal(unconfirmed.fullMonthCombinedCents, null); assert.equal(unconfirmed.creators[0].activeDays, 0);
const future = calculateCreatorBilling({ client: { serviceStart: '2026-11-01', serviceEnd: null }, month: '2026-11', throughDate: '2026-10-31', rate: DEFAULT_CREATOR_RATE, period: period([creator(1, { activeFrom: '2026-11-01' })], { month: '2026-11' }) });
assert.equal(future.feeCents, 0); assert.equal(future.fullMonthCombinedCents, 100000, 'First-day actual zero still checks the full saved-month exposure');
const leap = calculateCreatorBilling({ client: { serviceStart: '2024-02-15', serviceEnd: null }, month: '2024-02', throughDate: '2024-02-29', rate: DEFAULT_CREATOR_RATE, period: period([creator(1, { activeFrom: '2024-02-15' })], { month: '2024-02' }) });
assert.equal(leap.daysInMonth, 29); assert.equal(leap.feeCents, 25862);
const cents = calculateCreatorBilling({ client: { serviceStart: '2023-02-01', serviceEnd: null }, month: '2023-02', throughDate: '2023-02-28', rate: { ...DEFAULT_CREATOR_RATE, monthlyFee: 0.01 }, period: period([creator(1, { activeFrom: '2023-02-15' }), creator(2, { activeFrom: '2023-02-15' })], { month: '2023-02' }) });
assert.equal(cents.feeCents, 2, 'Two independent half-cent sourcing fees round to two cents');
assert.equal(calculateCreatorBilling({ client: { serviceStart: null, serviceEnd: null }, month: '2026-10', throughDate: '2026-10-31', rate: DEFAULT_CREATOR_RATE, period: period([creator(1)]) }).feeCents, null);
const fiftyOne = period(Array.from({ length: 51 }, (_, i) => creator(i + 1)));
assert.equal(calc(fiftyOne).blocked, true); assert.equal(calc(fiftyOne).feeCents, null);
assert.match(calc(fiftyOne).reasons.join(' '), /headcount approval/);
assert.equal(calc({ ...fiftyOne, headcountApproval: 'Written approval REF-1' }).blocked, false);
const budgetLedger = period(Array.from({ length: 26 }, (_, i) => creator(i + 1, { tier: 'L4' })));
const budgetResult = calculateCreatorBilling({ client: { serviceStart: '2026-10-01', serviceEnd: null }, month: '2026-10', throughDate: '2026-10-01', rate: DEFAULT_CREATOR_RATE, period: budgetLedger });
assert.equal(budgetResult.fullMonthCombinedCents, 10400000); assert.equal(budgetResult.feeCents, null, 'Budget checks full approved-month exposure, not just the tiny accrued first-day fee');
assert.match(budgetResult.reasons.join(' '), /budget approval/);
assert.equal(calculateCreatorBilling({ client: { serviceStart: '2026-10-01', serviceEnd: null }, month: '2026-10', throughDate: '2026-10-01', rate: DEFAULT_CREATOR_RATE, period: { ...budgetLedger, budgetApproval: 'Written budget increase REF-2' } }).blocked, false);
assert.equal(creatorBillingPeriodSchema.parse(period([creator(1, { handle: '  @@CREATOR_1  ' })])).creators[0].handle, 'creator_1');
for (const invalid of [period([creator(1), creator(2, { handle: ' @CREATOR1 ' })]), period([creator(1), creator(1, { handle: 'different' })]),
  period([creator(1, { activeThrough: '2026-09-30' })]), period([creator(1, { activeFrom: '2026-02-30' })]), period([creator(1, { handle: 'not a handle' })]),
  { ...period([]), invented: true }, { ...period([]), rosterConfirmed: 'yes' }]) assert.equal(creatorBillingPeriodsSchema.safeParse([invalid]).success, false);
assert.equal(creatorBillingPeriodsSchema.safeParse([period([]), period([])]).success, false);
const boundaryRows = Array.from({ length: 6000 }, (_, index) => creator(index + 1));
assert.equal(creatorBillingPeriodsSchema.safeParse([period(boundaryRows), period(boundaryRows, { month: '2026-11' })]).success, true);
assert.equal(creatorBillingPeriodsSchema.safeParse([period(boundaryRows), period([...boundaryRows, creator(6001)], { month: '2026-11' })]).success, false, 'The complete settings document permits at most 12000 actual creator rows');
assert.equal(financeSettingsSchema.parse(emptyFinanceSettings()).creatorBillingPeriods.length, 0);

const billingClient: ClientRecord = { id: id(100), revision: 3, name: 'Per-creator fixture', brandIds: [], serviceStart: '2026-09-15', serviceEnd: null, exitReason: null, updatedAt: null,
  terms: [{ effectiveMonth: '2026-09', feeModel: 'per_creator', monthlyRetainer: 0, revSharePercent: 0, creatorRate: DEFAULT_CREATOR_RATE }] };
const saved = validateClientSaveInput({ expectedRevision: 0, name: billingClient.name, brandIds: [], serviceStart: billingClient.serviceStart, serviceEnd: null, exitReason: null, terms: billingClient.terms });
assert.equal(saved.terms[0].feeModel, 'per_creator');
for (const term of [{ ...billingClient.terms[0], monthlyRetainer: 500 }, { ...billingClient.terms[0], revSharePercent: 22 }, { ...billingClient.terms[0], creatorRate: null }, { ...billingClient.terms[0], creatorRate: { ...DEFAULT_CREATOR_RATE, unknown: true } }, { ...billingClient.terms[0], feeModel: 'fixed' }]) {
  assert.throws(() => validateClientSaveInput({ expectedRevision: 0, name: 'Fixture', brandIds: [], serviceStart: billingClient.serviceStart, serviceEnd: null, exitReason: null, terms: [term] }));
}
assert.equal(calculateServiceRevenue({ client: billingClient, month: '2026-09', periodStart: '2026-09-01', periodEnd: '2026-09-30', gmvCents: 999999999, gmvComplete: true }).revenueCents, null, 'Existing GMV-only fee callers cannot invent per-creator income or a 22% TAP fee');
const settings = { ...emptyFinanceSettings(), agencyName: 'Fixture Agency', agencyAddress: 'Fixture', paymentInstructions: 'Fixture only', legalName: 'Fixture Client', billingEmail: 'fixture@example.invalid', billingAddress: 'Fixture',
  managerTerms: [{ effectiveMonth: '2026-09', managerId: id(200), fixedMonthly: 100, gmvPercent: 0, payoutDays: 7 as const, servicePeriod: { start: '2026-09-15', end: '2026-09-30' } }],
  creatorBillingPeriods: [period([creator(1, { activeFrom: '2026-09-01', tier: 'L3' })], { month: '2026-09' })] };
const record = { client_id: billingClient.id, revision: 4, settings };
const invoice = buildInvoice(billingClient, record, '2026-09', null, '2026-10-01');
assert.equal(invoice.feeCents, 26667); assert.equal(invoice.creatorBilling?.result.stipendCents, 80000); assert.equal(invoice.managerCents, 10000);
assert.equal(invoice.gmvCents, null); assert.equal(invoice.creatorBilling?.settingsRevision, 4); assert.deepEqual(invoice.creatorBilling?.period, settings.creatorBillingPeriods[0]);
assert.equal(invoice.feeCents, invoice.creatorBilling?.result.feeCents, 'Agency receivable contains only sourcing; separate creator funding never enters the invoice amount');
assert.throws(() => buildInvoice(billingClient, { ...record, settings: { ...settings, creatorBillingPeriods: [] } }, '2026-09', null, '2026-10-01'), /roster/);
assert.throws(() => buildInvoice(billingClient, { ...record, settings: { ...settings, managerTerms: [] } }, '2026-09', null, '2026-10-01'), /manager/);
assert.throws(() => buildInvoice(billingClient, { ...record, settings: { ...settings, managerTerms: [{ ...settings.managerTerms[0], servicePeriod: undefined }] } }, '2026-09', null, '2026-10-01'), /manager pay period/, 'Daily sourcing proration never silently prorates or approves manager compensation');
assert.throws(() => buildInvoice(billingClient, { ...record, settings: { ...settings, managerTerms: [{ ...settings.managerTerms[0], gmvPercent: 1 }] } }, '2026-09', null, '2026-10-01'), /managed GMV/);
assert.throws(() => buildInvoice(billingClient, { ...record, settings: { ...settings, termsReviewRequired: true } }, '2026-09', null, '2026-10-01'), /contract differences/);
assert.throws(() => buildInvoice(billingClient, { ...record, settings: { ...settings, billingEmail: '' } }, '2026-09', null, '2026-10-01'), /billing email/);
const sourcedForecast = forecast([billingClient], [record], [], '2026-10-01');
const sourcedSeptember = sourcedForecast.events.filter(event => event.month === '2026-09');
assert.equal(sourcedSeptember.length, 1); assert.equal(sourcedSeptember[0].receiptCents, 26667); assert.equal(sourcedSeptember[0].payoutCents, 10000);
assert.equal(record.settings.forecastGmv.length, 0, 'Confirmed sourcing forecasts do not require or add a fictitious zero GMV estimate');
assert.ok(sourcedForecast.missing.some(message => message.includes('2026-10') && message.includes('creator roster')));
assert.ok(!sourcedForecast.missing.some(message => message.includes('GMV estimate')), 'Unconfirmed future rosters ask for roster confirmation rather than unrelated GMV');
const unknownRosterForecast = forecast([billingClient], [{ ...record, settings: { ...settings, creatorBillingPeriods: [] } }], [], '2026-10-01');
assert.ok(!unknownRosterForecast.events.some(event => event.month === '2026-09'));
assert.ok(unknownRosterForecast.missing.some(message => message.includes('2026-09') && message.includes('creator roster')));
const variableRecord = { ...record, settings: { ...settings, managerTerms: [{ ...settings.managerTerms[0], gmvPercent: 1 }] } };
const variableForecast = forecast([billingClient], [variableRecord], [], '2026-10-01');
assert.ok(!variableForecast.events.some(event => event.month === '2026-09'));
assert.ok(variableForecast.missing.some(message => message.includes('2026-09') && message.includes('GMV estimate for manager pay')));
const variableKnown = forecast([billingClient], [{ ...variableRecord, settings: { ...variableRecord.settings, forecastGmv: [{ month: '2026-09', amount: 1000 }] } }], [], '2026-10-01');
assert.equal(variableKnown.events.find(event => event.month === '2026-09')?.receiptCents, 26667, 'A manager GMV estimate never changes the sourcing fee');
assert.equal(variableKnown.events.find(event => event.month === '2026-09')?.payoutCents, 11000);
const issuedCreatorInvoice: AgencyInvoice = { id: 'issued-fixture', client_id: billingClient.id, month: '2026-09', revision: 1, status: 'issued', snapshot: invoice, collected_on: null, manager_paid_on: null };
const invoiceForecast = forecast([billingClient], [{ ...record, settings: { ...settings, creatorBillingPeriods: [] } }], [issuedCreatorInvoice], '2026-10-01');
assert.deepEqual(invoiceForecast.events.filter(event => event.month === '2026-09').map(event => event.source), ['Invoice'], 'Issued snapshots replace current roster estimates even after the ledger changes');
assert.ok(!invoiceForecast.missing.some(message => message.includes('2026-09')));
console.log('PASS creator billing: confirmed actual rosters, eligibility gates, lifecycle/cutoff dates, leap and half-up per-row cents, normalized uniqueness and written cap approvals');
console.log('PASS per-creator invoice: source income separate from stipends/TAP, immutable ledger input/breakdown, no GMV prerequisite for fixed pay and preserved manager/billing/review blockers');
console.log('PASS per-creator forecast: confirmed ledger with no fake GMV, roster-specific missing inputs, variable-manager estimates and issued-snapshot priority');
