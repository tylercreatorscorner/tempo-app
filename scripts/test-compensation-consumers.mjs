import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { NextRequest, NextResponse } from 'next/server.js';
import ts from 'typescript';

class FixtureDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-10-29T12:00:00Z'])); }
}
function load(path, deps) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, Date: FixtureDate, console, Buffer, require: name => {
      assert.ok(name in deps, `Unexpected dependency: ${name}`); return deps[name];
    } });
  return exports;
}
const core = load('src/lib/data/brand-registry-core.ts', {});
const brand = (slug, extra = {}) => ({ id: slug, slug, name: slug, display_name: null, color: null, is_archived: false, is_umbrella: false, parent_brand_id: null, store_order: null, ...extra });
const registry = core.buildRegistry([brand('alpha'), brand('closed'), brand('leefar', { is_umbrella: true }), ...['lee1', 'lee2', 'lee3', 'lee4'].map((slug, i) => brand(slug, { parent_brand_id: 'leefar', store_order: i }))]);
const empty = { retainer: null, commission_rate: null, revenue_share_rate: null, marketing_commission_rate: null, launch_fee: null, launch_fee_name: null, launch_fee_ends: null, product_retainer_amount: null, product_retainer_name: null, compensation_model: null };
const terms = (slug, values = {}) => ({ ...empty, brand: slug, active: true, revision: 2, snapshot_revision: 1, effective_month: null, ...values });
const baseline = terms('alpha', { retainer: 1000, commission_rate: 2, compensation_model: 'revshare_max' });
const october = terms('alpha', { retainer: 2000, commission_rate: 4, compensation_model: 'standard', snapshot_revision: 2, effective_month: '2026-10' });
const issued = { id: 'issued', brand: 'alpha', period_month: '2026-09', team_member_id: 'old', total_amount: 1000, status: 'sent', commission: 0, retainer: 1000, product_retainer: 0, launch_fee: 0 };
const tables = {
  team_members: [{ id: 'old', tenant_id: 'tenant', name: 'Existing payee', is_archived: false }, { id: 'new', tenant_id: 'tenant', name: 'October payee', is_archived: false }],
  brand_settings: [], creator_commission_rates: [{ brand: 'alpha', creator_name: 'override', rate: 8 }, { brand: 'closed', creator_name: 'override', rate: 99 }],
  marketing_gmv: [{ brand: 'alpha', month: '2026-09', amount: 500 }, { brand: 'alpha', month: '2026-10', amount: 500 }],
  invoices: [issued], brand_compensation: [{ id: 'physical', tenant_id: 'tenant', brand: 'alpha', team_member_id: 'old' }], brands_v2: [],
};
let rpcFailure = false;
let incomplete = false;
const writes = [];
const reads = [];
function from(table) {
  assert.ok(table in tables, `Unexpected table: ${table}`);
  const filters = []; let operation = 'read'; let payload;
  const q = {
    select: () => q, eq: (key, value) => { filters.push(row => row[key] === value); return q; },
    in: (key, values) => { filters.push(row => values.includes(row[key])); return q; },
    like: (key, value) => { filters.push(row => typeof row[key] === 'string' && row[key].startsWith(value.replace(/%$/, ''))); return q; },
    order: () => q, limit: () => q,
    or: expression => { const payee = /team_member_id.eq.([^,]+)/.exec(expression)?.[1]; filters.push(row => row.team_member_id == null || row.team_member_id === payee); return q; },
    insert: value => { operation = 'insert'; payload = value; return q; },
    upsert: value => { operation = 'upsert'; payload = value; return q; },
    update: value => { operation = 'update'; payload = value; return q; },
    maybeSingle: () => Promise.resolve(result(true)), single: () => Promise.resolve(result(true)),
    then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
  };
  function result(single = false) {
    const found = tables[table].filter(row => filters.every(filter => filter(row)));
    if (operation !== 'read') {
      writes.push({ table, operation, payload });
      return { data: { id: 'generated', ...payload }, error: null };
    }
    return { data: single ? found[0] ?? null : found, error: null };
  }
  return q;
}
const client = { from, rpc: async (name, args) => {
  if (rpcFailure) return { data: null, error: { message: 'RPC unavailable' } };
  if (name === 'finance_compensation_for_month') {
    reads.push(args);
    const data = args.p_brands.map(slug => {
      if (slug === 'closed') return terms(slug, { active: false });
      if (slug.startsWith('lee')) return terms(slug, { retainer: slug === 'lee3' ? 1500 : 0, commission_rate: 2 });
      if (args.p_team_member_id === 'new') return terms(slug, args.p_month < '2026-10'
        ? { active: false } : { effective_month: '2026-10', retainer: 50, commission_rate: 1 });
      return { ...(args.p_month < '2026-10' ? baseline : october), brand: slug };
    });
    return { data: incomplete ? data.slice(0, -1) : data, error: null };
  }
  if (name === 'finance_compensation_write') {
    writes.push({ name, args });
    return { data: terms(args.p_brand, { ...args.p_patch, effective_month: args.p_effective_month, team_member_id: args.p_team_member_id, revision: 3 }), error: null };
  }
  assert.equal(name, 'finance_compensation_write_batch');
  writes.push({ name, args });
  return { data: args.p_changes.map(row => terms(row.brand, { ...row.patch, active: row.active, effective_month: args.p_effective_month, team_member_id: row.team_member_id, revision: 3 })), error: null };
} };
const history = load('src/lib/finance/compensation-history.ts', {});
const math = load('src/lib/finance/invoice-math.ts', { '@/lib/data/brand-registry-core': core, '@/lib/finance/compensation-history': history });
const save = load('src/lib/finance/save-compensation.ts', { '@/lib/data/brand-registry-core': core, '@/lib/finance/compensation-history': history });
const editorPatch = load('src/lib/finance/arrangement-patch.ts', {});
const earnings = load('src/lib/data/earnings.ts', {
  '@/lib/supabase/server': { createAdminClient: async () => client },
  '@/lib/data/brand-registry': { ...core, getBrandRegistry: async () => registry },
  '@/lib/finance/compensation-history': history, '@/lib/finance/invoice-math': math,
  '@/lib/data/managed-gmv': { computeManagedGmv: async (_start, _end, slugs) => ({
    storeSlugs: slugs, labelByStore: new Map(slugs.map(slug => [slug, slug])), byStore: new Map(slugs.map(slug => [slug, 10000])),
    byStoreCreator: new Map(slugs.map(slug => [slug, new Map([
      ['override', { handleNorm: 'override', rawName: '@override', gmv: 5000 }], ['default', { handleNorm: 'default', rawName: '@default', gmv: 5000 }],
    ])])),
  }) },
});
const september = await earnings.getEarnings('2026-09', 'old', ['alpha', 'closed'], 'tenant');
const octoberEarnings = await earnings.getEarnings('2026-10', 'old', ['alpha', 'closed'], 'tenant');
assert.equal(september.totals.earnings, 1000, 'September estimate retains its legacy MAX model');
assert.equal(octoberEarnings.totals.earnings, 2610, 'October combines its updated retainer and rates with the creator override');
assert.deepEqual(Array.from(octoberEarnings.brands, row => row.brand), ['alpha'], 'Inactive pairs cannot earn global creator override commission');
assert.equal((await earnings.getEarnings('2026-09', 'new', ['alpha', 'closed'], 'tenant')).totals.earnings, 0, 'New October payee has no phantom September defaults or overrides');
assert.equal((await earnings.getEarnings('2026-10', 'new', ['alpha', 'closed'], 'tenant')).totals.earnings, 510);
assert.equal(await math.resolveCompensationModel(client, registry, 'alpha', 'old', 'tenant', ['alpha'], '2026-09'), 'revshare_max');
assert.equal(await math.resolveCompensationModel(client, registry, 'alpha', 'old', 'tenant', ['alpha'], '2026-10'), 'standard');
await assert.rejects(math.resolveCompensationModel(client, registry, 'alpha', 'new', 'tenant', ['alpha'], '2026-09'), /No active compensation/);

const scope = { tenantId: 'tenant', userId: 'actor', canViewFinance: true, brandScope: { kind: 'all' } };
const deps = {
  'next/server': { NextRequest, NextResponse }, '@/lib/finance/access': { getFinanceAccess: async () => ({ scope, admin: client, brandSlugs: ['alpha', 'closed'] }) },
  '@/lib/auth/workspace-scope': { getWorkspaceScope: async () => scope }, '@/lib/data/earnings': earnings,
  '@/lib/utils/format': { currentMonth: () => '2026-10' },
  '@/lib/supabase/server': { createAdminClient: async () => client },
  '@/lib/data/brand-registry': { ...core, getBrandRegistry: async () => registry },
  '@/lib/finance/invoice-math': math, '@/lib/finance/compensation-history': history, '@/lib/finance/save-compensation': save,
  '@/lib/auth/require-admin': { requireAdmin: async () => ({ user_id: 'actor', tenant_id: 'tenant' }) },
};
const request = url => new NextRequest(`https://fixture.invalid${url}`);
const ytd = load('src/app/api/earnings/ytd/route.ts', deps);
const ytdBody = await (await ytd.GET(request('/api/earnings/ytd?year=2026'))).json();
assert.equal(ytdBody.months[8].earnings, 1000); assert.equal(ytdBody.months[9].earnings, 2610);
assert.equal(ytdBody.totals.earnings, 11610, 'YTD keeps nine months of old terms and one October period');
const newYtd = await (await ytd.GET(request('/api/earnings/ytd?year=2026&team_member_id=new'))).json();
assert.equal(newYtd.totals.earnings, 510, 'YTD uses the selected payee and excludes pre-effective defaults');
const series = load('src/app/api/earnings/series/route.ts', deps);
const seriesBody = await (await series.GET(request('/api/earnings/series?endMonth=2026-10&months=2'))).json();
assert.deepEqual(seriesBody.series.map(row => row.earnings), [1000, 2610]);
const newSeries = await (await series.GET(request('/api/earnings/series?endMonth=2026-10&months=2&team_member_id=new'))).json();
assert.deepEqual(newSeries.series.map(row => row.earnings), [0, 510]);

const writeRequest = (method, body) => new NextRequest('https://fixture.invalid/api/fixture', { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const invoiceRoute = load('src/app/api/invoices/[id]/route.ts', deps);
const invoiceEdit = await invoiceRoute.PATCH(writeRequest('PATCH', { commission: 1100, retainer: 1000 }), { params: Promise.resolve({ id: 'issued' }) });
assert.equal(invoiceEdit.status, 200);
assert.equal((await invoiceEdit.json()).invoice.total_amount, 1100, 'Actual invoice PATCH uses its September period, preserving MAX rather than October additive math');

const generation = load('src/lib/finance/create-invoice.ts', {
  '@/lib/data/earnings': earnings, '@/lib/finance/invoice-math': math,
  '@/lib/finance/earnings-ledger': { upsertEarningsLedger: async () => null },
  '@/lib/invoices/defaults': { DEFAULT_PAYMENT_INSTRUCTIONS: 'Fixture only' },
});
const before = JSON.stringify(issued);
const outcome = await generation.createInvoiceForBrand({ tenantId: 'tenant', brand: 'alpha', month: '2026-10', teamMemberId: 'old', scopedSlugs: ['alpha', 'closed'], adminClient: client });
assert.equal(outcome.ok, true); assert.equal(outcome.invoice.total_amount, 2610); assert.equal(outcome.invoice.period_month, '2026-10');
assert.equal(JSON.stringify(issued), before, 'Reading or generating October never mutates an issued September invoice');
const historicalDuplicate = await generation.createInvoiceForBrand({ tenantId: 'tenant', brand: 'alpha', month: '2026-09', teamMemberId: 'old', scopedSlugs: ['alpha', 'closed'], adminClient: client });
assert.equal(historicalDuplicate.status, 409);

writes.length = 0;
await save.saveCompensation(client, { tenantId: 'tenant', actorId: 'actor', teamMemberId: 'old', brand: 'leefar', effectiveMonth: '2026-10',
  patch: { retainer: 2200, commission_rate: 3, launch_fee: 100, launch_fee_name: 'Launch' }, registry, permittedSlugs: ['leefar', 'lee1', 'lee2', 'lee3', 'lee4'], source: { test: true } });
assert.equal(writes.length, 1, 'All four LeeFar stores are written in one audited transaction');
const changes = writes[0].args.p_changes;
assert.equal(changes.length, 4); assert.equal(changes.reduce((sum, row) => sum + row.patch.retainer, 0), 2200);
assert.equal(changes.find(row => row.brand === 'lee3').patch.retainer, 2200, 'Existing fixed-fee carrier is preserved');
assert.equal(changes.reduce((sum, row) => sum + row.patch.launch_fee, 0), 100);
assert.ok(changes.every(row => row.patch.commission_rate === 3 && row.expected_revision === 2));

const arrangements = load('src/app/api/brand-compensation/route.ts', deps);
writes.length = 0;
assert.equal((await arrangements.POST(writeRequest('POST', { brand: 'alpha', team_member_id: 'old', retainer: 3000 }))).status, 400);
assert.equal(writes.length, 0, 'Unversioned compensation edits cannot bypass history');
assert.equal((await arrangements.POST(writeRequest('POST', { brand: 'alpha', team_member_id: 'old', effectiveMonth: '2026-10', retainer: 3000 }))).status, 201);
assert.equal(writes[0].name, 'finance_compensation_write_batch');
assert.deepEqual(Object.keys(writes[0].args.p_changes[0].patch), ['retainer'], 'Unspecified financials remain unknown rather than becoming fabricated zero terms');
const historicalListing = await (await arrangements.GET(request('/api/brand-compensation?month=2026-09&team_member_id=old'))).json();
assert.equal(historicalListing.arrangements[0].retainer, 1000);
const arrangementId = load('src/app/api/brand-compensation/[id]/route.ts', deps);
assert.equal((await arrangementId.DELETE(writeRequest('DELETE', { effectiveMonth: '2026-10' }), { params: Promise.resolve({ id: 'physical' }) })).status, 200);
assert.equal(writes.at(-1).args.p_changes[0].active, false, 'DELETE records an effective deactivation instead of deleting September terms');
const earningsEditor = load('src/app/api/earnings/brand-settings/route.ts', deps);
const staleSettings = { retainer: 999, commission_rate: 9, compensation_model: 'standard', bill_to_name: 'Old billing' };
const billingPatch = editorPatch.buildArrangementPatch({ ...staleSettings, retainer: 888, bill_to_name: 'Updated billing' }, staleSettings, true);
assert.deepEqual(Object.keys(billingPatch), ['bill_to_name'], 'Context-free brand billing editor never sends stale or unidentified payee terms');
writes.length = 0;
assert.equal((await earningsEditor.PATCH(writeRequest('PATCH', { brand: 'alpha', patch: billingPatch }))).status, 200);
assert.ok(writes.every(write => write.table === 'brand_settings'), 'Billing-only edits do not write compensation history or reactivate inactive pairs');
assert.equal((await earningsEditor.PATCH(writeRequest('PATCH', { brand: 'alpha', team_member_id: 'old', effectiveMonth: '2026-10', patch: { commission_rate: 3 } }))).status, 200);
assert.equal(writes.at(-1).name, 'finance_compensation_write_batch');
const clients = load('src/app/api/clients/route.ts', { ...deps,
  '@/lib/auth/platform-admin': { assertNotImpersonating: async () => {} },
  '@/lib/auth/invite-workspace-member': { inviteWorkspaceMember: async () => { throw new Error('Unexpected invitation'); } },
});
const unauthorizedClients = load('src/app/api/clients/route.ts', { ...deps,
  '@/lib/finance/access': { getFinanceAccess: async () => NextResponse.json({ error: 'Forbidden' }, { status: 403 }) },
  '@/lib/auth/platform-admin': { assertNotImpersonating: async () => {} },
  '@/lib/auth/invite-workspace-member': { inviteWorkspaceMember: async () => { throw new Error('Unexpected invitation'); } },
});
writes.length = 0;
assert.equal((await unauthorizedClients.POST(writeRequest('POST', { identity: { slug: 'unauthorized', name: 'Unauthorized' }, compensation: { effectiveMonth: '2026-10', retainer: 500 } }))).status, 403);
assert.equal(writes.length, 0, 'Admin without finance configure cannot create a brand or compensation while onboarding with terms');
const initialized = await clients.POST(writeRequest('POST', { identity: { slug: 'new_client', name: 'New Client' }, compensation: { team_member_id: 'old', effectiveMonth: '2026-10', retainer: 500 } }));
assert.equal(initialized.status, 201); assert.deepEqual((await initialized.json()).warnings, []);
assert.equal(writes.at(-1).name, 'finance_compensation_write', 'Client initialization writes audited month history too');

rpcFailure = true;
await assert.rejects(earnings.getEarnings('2026-10', 'old', ['alpha'], 'tenant'), /RPC unavailable/);
await assert.rejects(math.resolveCompensationModel(client, registry, 'alpha', 'old', 'tenant', ['alpha'], '2026-10'), /RPC unavailable/);
rpcFailure = false; incomplete = true;
await assert.rejects(earnings.getEarnings('2026-10', 'old', ['alpha'], 'tenant'), /incomplete response/);
assert.ok(reads.some(args => args.p_month === '2026-09') && reads.some(args => args.p_month === '2026-10'));
console.log('PASS actual monthly earnings, inactive overrides, new-payee baseline, YTD, series, historical invoice models and invoice generation');
console.log('PASS atomic LeeFar single-carrier edits and fail-closed missing/incomplete history RPCs');
console.log('PASS actual month-aware arrangement GET/POST/DELETE, earnings editor, invoice PATCH and client initialization routes');
