import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';

const require = createRequire(import.meta.url);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tenant = id(1), foreign = id(2);
const owner = { userId: id(3), tenantId: tenant, role: 'owner', canViewFinance: true, brandScope: { kind: 'all' }, permissions: new Set(['reporting:read', 'earnings:read']) };
let scope = owner, calls = [], failure = '', wrongCount = '', truncatePerformance = false, truncateRange = false, now = '2026-10-29T12:00:00Z';
const makeClient = (n, extra = {}) => ({ id: id(n), revision: 1, name: `Client ${n}`, brandIds: [id(n + 100)], serviceStart: '2026-01-01', serviceEnd: null, historical: false, exitReason: null, updatedAt: null,
  terms: [{ effectiveMonth: '2026-01', feeModel: 'additive', monthlyRetainer: 1000, revSharePercent: 4 }], ...extra });
const clients = [makeClient(10), makeClient(11), makeClient(12), makeClient(13, { historical: true, serviceStart: null })];
const manager = { effectiveMonth: '2026-10', managerId: id(80), fixedMonthly: 500, gmvPercent: 1, payoutDays: 7, allocations: [
  { managerId: id(80), fixedMonthly: 300, gmvPercent: 0.5 }, { managerId: id(81), fixedMonthly: 200, gmvPercent: 0.5 },
] };
const tables = {
  brands_v2: [...clients.map(client => ({ id: client.brandIds[0], tenant_id: tenant, name: client.name, display_name: null, parent_brand_id: null })), { id: id(999), tenant_id: foreign, name: 'PRIVATE FOREIGN', parent_brand_id: null }],
  agency_finance_settings: clients.map(client => ({ tenant_id: tenant, client_id: client.id, revision: 1, manager_terms: [manager], terms_review_required: client.id === id(12), billingEmail: 'PRIVATE', paymentInstructions: 'PRIVATE' })),
  user_profiles: [
    { tenant_id: tenant, user_id: id(80), role: 'owner', name: 'Manager A', email: 'PRIVATE' },
    { tenant_id: tenant, user_id: id(81), role: 'manager', name: 'Manager B', email: 'PRIVATE' },
    { tenant_id: foreign, user_id: id(80), role: 'manager', name: 'PRIVATE FOREIGN' },
    { tenant_id: tenant, user_id: id(82), role: 'creator', name: 'PRIVATE INELIGIBLE' },
  ],
  agency_client_invoices: [
    { tenant_id: tenant, month: '2026-09', status: 'paid', collected_on: '2026-10-01', manager_paid_on: '2026-10-12', fee_cents: '30000', manager_cents: '10000' },
    { tenant_id: tenant, month: '2026-08', status: 'paid', collected_on: '2026-09-30', manager_paid_on: '2026-10-15', fee_cents: '60000', manager_cents: '12000' },
    { tenant_id: tenant, month: '2026-10', status: 'paid', collected_on: '2026-10-29', manager_paid_on: '2026-10-29', fee_cents: '80000', manager_cents: '40000' },
    { tenant_id: tenant, status: 'draft', collected_on: '2026-10-01', manager_paid_on: null, fee_cents: '999999', manager_cents: '0' },
    { tenant_id: foreign, status: 'paid', collected_on: '2026-10-01', manager_paid_on: '2026-10-02', fee_cents: '99999999', manager_cents: '999999' },
  ],
};
let performance = clients.map((client, i) => ({ brand_id: client.brandIds[0], managed_gmv: i === 1 ? null : '100000', recorded_days: i === 1 ? 0 : 27,
  source_recorded_days: i === 1 ? 0 : 27, expected_days: 28, recorded_through: i === 1 ? null : '2026-10-27', latest_recorded_through: i === 1 ? null : '2026-10-27', complete: false }));
const db = {
  from(table) {
    assert.ok(table in tables, `Unexpected table ${table}`);
    const trace = { table, filters: [] }; const filters = [];
    const q = {
      select(columns, options) { trace.columns = columns; trace.options = options; return q; },
      eq(key, value) { trace.filters.push(['eq', key, value]); filters.push(row => row[key] === value); return q; },
      is(key, value) { trace.filters.push(['is', key, value]); filters.push(row => row[key] === value); return q; },
      in(key, values) { trace.filters.push(['in', key, values]); filters.push(row => values.includes(row[key])); return q; },
      or(value) { trace.or = value; return q; }, order: () => q, limit: () => q,
      then(resolve, reject) {
        calls.push(trace); const data = tables[table].filter(row => filters.every(filter => filter(row)));
        return Promise.resolve({ data, count: wrongCount === table ? data.length + 1 : data.length, error: failure === table ? { message: 'PRIVATE DATABASE ERROR' } : null }).then(resolve, reject);
      },
    }; return q;
  },
  async rpc(name, args) {
    calls.push({ name, args });
    assert.ok(['agency_business_list_clients', 'agency_business_period_performance', 'agency_business_range_performance'].includes(name), 'Only read-only RPCs are allowed');
    assert.equal(args.p_tenant_id, tenant);
    if (name === 'agency_business_range_performance') {
      const expected = Number(args.p_through.slice(8)) - Number(args.p_from.slice(8)) + 1;
      const rows = performance.map(row => ({ ...row, managed_gmv: '10000', recorded_days: expected, source_recorded_days: expected, expected_days: expected,
        recorded_through: args.p_through, latest_recorded_through: args.p_through, complete: true }));
      return { data: truncateRange ? rows.slice(0, -1) : rows, error: failure === name ? { message: 'PRIVATE DATABASE ERROR' } : null };
    }
    return { data: name === 'agency_business_list_clients' ? clients : truncatePerformance ? performance.slice(0, -1) : performance, error: failure === name ? { message: 'PRIVATE DATABASE ERROR' } : null };
  },
};
class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
const modules = new Map();
function load(path) {
  if (modules.has(path)) return modules.get(path);
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Date: ClockDate, Intl, console, require: name => {
      if (name === 'next/server') return { NextRequest, NextResponse };
      if (name === '@/lib/auth/workspace-scope') return { getWorkspaceScope: async () => scope };
      if (name === '@/lib/supabase/server') return { createAdminClient: async () => { calls.push({ admin: true }); return db; } };
      if (name === '@/lib/auth/permissions') return { can: (s, screen, level) => s.permissions.has(`${screen}:${level}`) };
      const aliases = { '@/lib/agency/access': 'src/lib/agency/access.ts', '@/lib/agency/model': 'src/lib/agency/model.ts', './model': 'src/lib/agency/model.ts',
        '@/lib/agency/finance-model': 'src/lib/agency/finance-model.ts', './finance-model': 'src/lib/agency/finance-model.ts', './creator-billing': 'src/lib/agency/creator-billing.ts',
        '@/lib/agency/revenue-model': 'src/lib/agency/revenue-model.ts', '@/lib/data/agency-revenue': 'src/lib/data/agency-revenue.ts' };
      return name in aliases ? load(aliases[name]) : require(name);
    },
  }); modules.set(path, exports); return exports;
}
const dataModule = load('src/lib/data/agency-revenue.ts');
const route = load('src/app/api/agency/revenue/route.ts');
const get = (query = '') => route.GET(new NextRequest(`https://fixture.invalid/api/agency/revenue${query ? `?${query}` : ''}`));
for (const denied of [null, { ...owner, role: 'manager' }, { ...owner, role: 'brand' }, { ...owner, role: 'creator' }, { ...owner, canViewFinance: false },
  { ...owner, impersonating: true }, { ...owner, tenantId: null }, { ...owner, brandScope: { kind: 'scoped' } }, { ...owner, permissions: new Set(['reporting:read']) }]) {
  scope = denied; calls = [];
  assert.ok([401, 403].includes((await get()).status)); assert.equal(calls.length, 0, 'Unauthorized users never reach privileged data');
}
scope = owner;
for (const month of ['2026-11', '2026-00', '2026-13', '1999-12', '2026-10-01', 'garbage']) {
  calls = []; assert.equal((await get(`month=${month}`)).status, 400); assert.equal(calls.length, 0);
}
calls = [];
const response = await get('tenant_id=foreign&through=2099-12-31');
assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
const body = await response.json();
assert.equal(body.month, '2026-10'); assert.equal(body.throughDate, '2026-10-28'); assert.equal(body.asOfDate, '2026-10-29');
assert.equal(body.rows[0].gmvCents, 10000000); assert.equal(body.rows[0].recordedThrough, '2026-10-27'); assert.equal(body.rows[0].status, 'provisional');
assert.equal(body.rows[0].feeCents, 500000); assert.equal(body.rows[0].managerCents, 150000); assert.equal(body.rows[0].retainedCents, 350000);
assert.deepEqual(body.rows[0].managerRecipients, [{ managerId: id(80), name: 'Manager A' }, { managerId: id(81), name: 'Manager B' }]);
assert.equal(body.rows[1].gmvCents, null); assert.equal(body.rows[1].feeCents, null);
assert.equal(body.rows[2].status, 'partial_estimate'); assert.equal(body.rows[2].feeCents, null);
assert.equal(body.rows[2].knownFeeCents,100000); assert.equal(body.rows[2].knownManagerCents,50000); assert.equal(body.rows[2].billingReviewRequired,true);
assert.equal(body.rows[3].status, 'outside_service'); assert.equal(body.totals.includedCount, 1);
assert.equal(body.totals.feeCents - body.totals.managerCents, body.totals.retainedCents);
assert.deepEqual(body.cash, { collectedCents: 30000, managerPaidCents: 22000, retainedCashCents: 8000, collectedCount: 1, managerPaidCount: 2, complete: true }, 'Cash-date totals include older service invoices and exclude open-day, draft and foreign rows');
assert.ok(calls.filter(call => call.table).every(call => call.filters.some(([operation, key, value]) => operation === 'eq' && key === 'tenant_id' && value === tenant)));
const performanceCall = calls.find(call => call.name === 'agency_business_period_performance');
assert.equal(performanceCall.args.p_month, '2026-10-01'); assert.equal(performanceCall.args.p_through, '2026-10-28');
const financeCall = calls.find(call => call.table === 'agency_finance_settings');
assert.equal(financeCall.columns, 'client_id,revision,manager_terms:settings->managerTerms,terms_review_required:settings->termsReviewRequired,creator_billing_periods:settings->creatorBillingPeriods');
assert.equal(calls.find(call => call.table === 'user_profiles').columns, 'user_id,name', 'Manager names use only the minimal tenant-scoped profile projection');
assert.ok(!JSON.stringify(body).includes('PRIVATE'), 'Billing addresses, payment instructions and provider internals never reach the response');
assert.ok(calls.every(call => !call.insert && !call.update && !call.delete), 'The endpoint never creates or changes financial records');
for (const table of ['brands_v2', 'agency_finance_settings', 'agency_client_invoices', 'user_profiles']) {
  wrongCount = table; assert.equal((await get()).status, 503, 'Truncated direct reads fail closed'); wrongCount = '';
}
truncatePerformance = true; assert.equal((await get()).status, 503); truncatePerformance = false;
for (const source of ['agency_business_list_clients', 'agency_business_period_performance', 'agency_finance_settings', 'agency_client_invoices', 'user_profiles']) {
  failure = source; const failed = await get(); assert.equal(failed.status, 503); assert.ok(!JSON.stringify(await failed.json()).includes('PRIVATE')); failure = '';
}
const priorAmount = tables.agency_client_invoices[0].fee_cents;
for (const missing of [null, false, '   ']) {
  tables.agency_client_invoices[0].fee_cents = missing;
  assert.equal((await (await get()).json()).cash.collectedCents, null, 'A missing or malformed recorded cash amount is unavailable, never a fabricated zero');
}
tables.agency_client_invoices[0].fee_cents = priorAmount;
tables.user_profiles[1].role = 'creator';
assert.equal((await (await get()).json()).rows[0].managerRecipients[1].name, null, 'Ineligible or missing manager profile names remain unknown');
tables.user_profiles[1].role = 'manager';

const originalClient = clients[0], originalFinance = tables.agency_finance_settings[0];
const servicePeriod = { start: '2026-10-15', end: '2026-10-31' };
clients[0] = { ...originalClient, serviceStart: servicePeriod.start, terms: [{ effectiveMonth: '2026-10', feeModel: 'components', monthlyRetainer: 3838.71, revSharePercent: 3,
  managerComponent: { monthlyRetainer: 1645.16, revSharePercent: 2, feeModel: 'additive' }, servicePeriod }] };
tables.agency_finance_settings[0] = { ...originalFinance, manager_terms: [{ effectiveMonth: '2026-10', managerId: id(80), fixedMonthly: 1645.16, gmvPercent: 2, payoutDays: 7, servicePeriod }] };
calls = [];
const partialBody = await (await get()).json();
const rangeCall = calls.find(call => call.name === 'agency_business_range_performance');
assert.equal(rangeCall.args.p_from, '2026-10-15'); assert.equal(rangeCall.args.p_through, '2026-10-28');
assert.equal(partialBody.rows[0].gmvCents, 1000000, 'The approved partial row uses range GMV, never the much larger prestart-inclusive month amount');
assert.equal(partialBody.rows[0].brandCoverage[0].expectedDays, 14);
assert.equal(partialBody.rows[0].feeCents, 598387); assert.equal(partialBody.rows[0].managerCents, 184516); assert.equal(partialBody.rows[0].retainedCents, 413871);
assert.deepEqual(partialBody.cash, body.cash, 'Approved service ranges never change the separate calendar cash window');
truncateRange = true; assert.equal((await get()).status, 503); truncateRange = false;
failure = 'agency_business_range_performance'; assert.equal((await get()).status, 503); failure = '';
clients[0] = { ...clients[0], brandIds: [] }; calls = [];
assert.equal((await get()).status, 200); assert.ok(!calls.some(call => call.name === 'agency_business_range_performance'), 'An unlinked partial client makes no extra GMV query');
clients[0] = { ...originalClient, serviceStart: '2026-10-15', terms: [{ effectiveMonth: '2026-10', feeModel: 'per_creator', monthlyRetainer: 0, revSharePercent: 0, creatorRate: { monthlyFee: 500, maxCreators: 50, monthlyBudgetCap: 100000 } }] };
tables.agency_finance_settings[0] = { ...originalFinance, manager_terms: [{ effectiveMonth: '2026-10', managerId: id(80), fixedMonthly: 0, gmvPercent: 2, payoutDays: 7, servicePeriod }],
  creator_billing_periods: [{ month: '2026-10', rosterConfirmed: true, headcountApproval: '', budgetApproval: '', creators: [{ id: id(90), handle: 'example.creator', activeFrom: '2026-10-15', activeThrough: null, approved: true, onboarded: true, tapAuthorized: true, tier: 'L2' }] }] };
calls = [];
const creatorBody = await (await get()).json();
assert.equal(calls.find(call => call.name === 'agency_business_range_performance').args.p_from, '2026-10-15');
assert.equal(creatorBody.rows[0].knownFeeCents, 22581, 'Agency sourcing uses 14/31 creator days, not GMV');
assert.equal(creatorBody.rows[0].knownManagerCents, 20000, 'Manager share uses only the service range, excluding prestart GMV');
assert.equal(creatorBody.rows[0].knownRetainedCents, 2581);
assert.deepEqual(creatorBody.cash, body.cash, 'Creator billing never changes calendar cash facts');
tables.agency_finance_settings[0].creator_billing_periods = [{ ...tables.agency_finance_settings[0].creator_billing_periods[0], rosterConfirmed: false }];
assert.equal((await (await get()).json()).rows[0].knownFeeCents, null, 'A saved but unreviewed creator ledger does not fabricate zero fees');
tables.agency_finance_settings[0].creator_billing_periods = 'malformed';
assert.equal((await get()).status, 503, 'Malformed private ledgers fail closed before returning financial output');
clients[0] = originalClient; tables.agency_finance_settings[0] = originalFinance;

const savedPerformance = performance;
performance = performance.map(row => ({ ...row, expected_days: 30, recorded_days: 30, source_recorded_days: 30, recorded_through: '2026-09-30', latest_recorded_through: '2026-09-30', complete: true }));
assert.equal((await (await get('month=2026-09')).json()).throughDate, '2026-09-30');
performance = savedPerformance;
now = '2026-11-01T17:00:00Z'; calls = [];
const firstDay = await (await get()).json();
assert.equal(firstDay.month, '2026-11'); assert.equal(firstDay.throughDate, '2026-10-31');
assert.ok(firstDay.rows.every(row => row.gmvCents === null)); assert.equal(firstDay.cash.collectedCents, null);
assert.ok(!calls.some(call => call.name === 'agency_business_period_performance' || call.table === 'agency_client_invoices'), 'First of month reads neither an open source day nor a cash period outside this month');
assert.ok(firstDay.warnings.some(value => value.includes('No completed source dates')));
assert.equal(dataModule.revenuePeriod(null, new Date('2026-11-01T02:00:00Z')).month, '2026-10', 'Current month follows Chicago rather than UTC');
assert.equal(dataModule.revenuePeriod(null, new Date('2026-11-02T02:00:00Z')).throughDate, '2026-10-31', 'Yesterday uses Chicago calendar arithmetic across DST');
console.log('PASS actual agency revenue route + model: leadership gate, tenant scope, server-owned closed-day cutoff, matched estimates and separate recorded cash');
console.log('PASS unavailable/truncated reads, missing GMV/cash, agreement review, no invoice/payment writes, no billing leakage and first-day/DST boundaries');
console.log('PASS approved partial service rows use exact date-bounded GMV, preserve cash scope, and fail closed on incomplete range reads');
