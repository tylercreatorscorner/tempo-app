import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { NextRequest, NextResponse } from 'next/server.js';
import ts from 'typescript';

const original = { userId: 'actor', tenantId: 'a', role: 'owner', email: 'fixture@example.invalid', canViewFinance: true, permissions: new Set(['invoicing:read', 'invoicing:write', 'earnings:read', 'earnings:configure', 'payments:read']), brandScope: { kind: 'all' } };
let scope = original;
let failure = '';
let truncated = false;
let writes = [];
let dbCalls = 0;
const tables = {
  brands_v2: [{ id: 'a1', slug: 'alpha', tenant_id: 'a' }, { id: 'a2', slug: 'beta', tenant_id: 'a' }, { id: 'b1', slug: 'foreign', tenant_id: 'b' }],
  invoices: [{ id: 'local', brand: 'alpha', status: 'pending', public_token: 'valid-token', invoice_number: 'FIXTURE', notes: 'Public note', payment_received_notes: 'PRIVATE', created_by: 'PRIVATE' }, { id: 'unassigned', brand: 'beta', status: 'pending' }, { id: 'foreign', brand: 'foreign', status: 'pending' }],
  payment_audit_log: [{ id: 'log-a', brand: 'alpha' }, { id: 'log-b', brand: 'foreign' }],
};
function from(table) {
  assert.ok(table in tables, `Unexpected table ${table}`);
  let op = 'read'; let patch; let columns = '*'; const filters = [];
  const q = {
    select: (value = '*') => { columns = value; return q; },
    eq: (key, value) => { filters.push(row => row[key] === value); return q; },
    is: (key, value) => { filters.push(row => row[key] === value); return q; },
    gte: () => q, lt: () => q,
    in: (key, values) => { filters.push(row => values.includes(row[key])); return q; },
    order: () => q, limit: () => q, or: () => q, like: () => q,
    insert: value => { op = 'insert'; patch = value; return q; },
    update: value => { op = 'update'; patch = value; return q; },
    delete: () => { op = 'delete'; return q; },
    maybeSingle: async () => result(true), single: async () => result(true),
    then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
  };
  function result(single = false) {
    const found = op === 'insert' ? [{ id: 'new-invoice', ...patch }] : tables[table].filter(row => filters.every(filter => filter(row)));
    if (op !== 'read') writes.push({ table, op, ids: found.map(row => row.id), patch });
    const data = found.map(row => columns === '*' ? { ...row } : Object.fromEntries(columns.split(',').map(c => c.trim()).map(c => [c, row[c]])));
    return { data: single ? data[0] ?? null : truncated ? data.slice(0, 1) : data, count: data.length, error: failure === table ? { message: 'fixture read failed' } : null };
  }
  return q;
}
const client = { from };
const workspace = { getWorkspaceScope: async () => scope, isBrandInScope: (s, b) => s.brandScope.kind === 'all' || s.brandScope.brandIds.includes(b.id) };
function load(path, deps, source = readFileSync(path, 'utf8')) {
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, console, Date, Buffer, URL,
    process: { env: { RESEND_API_KEY: 'fixture', INVOICE_FROM_EMAIL: 'fixture@example.invalid' } },
    fetch: () => { throw new Error('Unexpected external delivery'); },
    require: name => {
      if (name in deps) return deps[name];
      return new Proxy({}, { get: (_target, key) => { if (key === '__esModule') return true; return () => { throw new Error(`Unexpected dependency call ${name}.${String(key)}`); }; } });
    },
  });
  return exports;
}
const base = {
  'next/server': { NextRequest, NextResponse }, 'node:crypto': { randomBytes },
  '@/lib/supabase/server': { createAdminClient: async () => { dbCalls++; return client; } },
  '@/lib/auth/workspace-scope': workspace,
  '@/lib/auth/require-admin': { requireAdmin: async () => ({ tenant_id: scope.tenantId, role: scope.role, email: scope.email }) },
};
const permissions = load('src/lib/auth/permissions.ts', {});
const access = load('src/lib/finance/access.ts', { ...base, '@/lib/auth/permissions': permissions });
const invoiceGuard = load('src/lib/finance/invoice-guard.ts', { ...base, './access': access });
const deps = { ...base, '@/lib/finance/access': access, '@/lib/finance/invoice-guard': invoiceGuard };
const readOnly = { ...original, permissions: new Set(['invoicing:read', 'payments:read', 'earnings:read']) };
for (const invalid of [null, { ...original, tenantId: null }, { ...original, permissions: new Set() }, { ...original, canViewFinance: false }, { ...original, role: 'coach' }]) {
  scope = invalid; assert.equal((await access.getFinanceAccess('invoicing', 'read')).status, 403);
}
assert.equal(dbCalls, 0);
scope = original;
assert.deepEqual(Array.from((await access.getFinanceAccess('invoicing')).brandSlugs), ['alpha', 'beta']);
scope = { ...original, role: 'manager', brandScope: { kind: 'scoped', brandIds: ['a1'], brandSlugs: ['alpha'] } };
assert.deepEqual(Array.from((await access.getFinanceAccess('invoicing')).brandSlugs), ['alpha']);
assert.equal((await invoiceGuard.guardInvoiceAction('unassigned')).ok, false);
assert.equal((await invoiceGuard.guardInvoiceAction('foreign')).ok, false);
assert.equal((await invoiceGuard.guardInvoiceAction('local')).ok, true);
tables.brands_v2.push({ id: 'duplicate', slug: 'alpha', tenant_id: 'b' });
assert.equal((await access.getFinanceAccess('invoicing')).status, 503);
tables.brands_v2.pop(); scope = original; truncated = true;
assert.equal((await access.getFinanceAccess('invoicing')).status, 503);
truncated = false; failure = 'brands_v2';
assert.equal((await access.getFinanceAccess('invoicing')).status, 503); failure = '';

const routeFiles = ['invoices/route.ts', 'invoices/run/route.ts', 'invoices/bulk/route.ts', ...['route.ts', 'pdf/route.ts', 'share/route.ts', 'refresh/route.ts', 'email/route.ts', 'send/route.ts', 'nudge/route.ts'].map(path => `invoices/[id]/${path}`), 'payments/history/route.ts', 'payments/overview/route.ts', 'payments/retainers/route.ts', 'earnings/route.ts', 'earnings/series/route.ts', 'earnings/ytd/route.ts', 'earnings/brand-settings/route.ts', 'earnings/marketing-gmv/route.ts'];
const routes = Object.fromEntries(routeFiles.map(path => [path, load(`src/app/api/${path}`, deps)]));
const req = (method, body = {}) => new NextRequest('https://fixture.invalid/api/invoices', { method, ...(method === 'GET' ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) });
for (const [path, route] of Object.entries(routes)) {
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE'].filter(method => route[method])) {
    scope = { ...original, permissions: new Set() }; dbCalls = 0; writes = [];
    assert.equal((await route[method](req(method), { params: Promise.resolve({ id: 'local' }) })).status, 403, `${path} ${method} must enforce action permission`);
    assert.equal(dbCalls, 0); assert.equal(writes.length, 0);
    if (method !== 'GET') {
      scope = readOnly;
      assert.equal((await route[method](req(method), { params: Promise.resolve({ id: 'local' }) })).status, 403, `${path} ${method} read-only denial`);
      scope = { ...original, impersonating: { userId: 'other' } };
      assert.equal((await route[method](req(method), { params: Promise.resolve({ id: 'local' }) })).status, 403);
    }
  }
}
scope = original;
const detail = routes['invoices/[id]/route.ts'];
assert.equal((await detail.GET(req('GET'), { params: Promise.resolve({ id: 'foreign' }) })).status, 404);
assert.equal((await detail.GET(req('GET'), { params: Promise.resolve({ id: 'local' }) })).status, 200);
assert.equal((await detail.PATCH(req('PATCH', { notes: 'Updated' }), { params: Promise.resolve({ id: 'local' }) })).status, 200);
writes = [];
assert.equal((await routes['invoices/bulk/route.ts'].POST(req('POST', { ids: ['local', 'foreign'], status: 'paid' }))).status, 403);
assert.equal(writes.length, 0);
assert.equal((await routes['invoices/bulk/route.ts'].POST(req('POST', { ids: ['local'], status: 'paid' }))).status, 200);
const listing = await routes['invoices/route.ts'].GET(req('GET'));
assert.equal((await listing.json()).invoices.some(row => row.id === 'foreign'), false);
const history = await routes['payments/history/route.ts'].GET(req('GET'));
assert.deepEqual((await history.json()).logs.map(row => row.id), ['log-a']);
const publicRoute = load('src/app/api/invoices/share/[token]/route.ts', deps);
scope = null;
const shared = await publicRoute.GET(req('GET'), { params: Promise.resolve({ token: 'valid-token' }) });
const publicData = await shared.json();
assert.equal(shared.status, 200); assert.equal('notes' in publicData.invoice, false);
assert.equal('payment_received_notes' in publicData.invoice, false); assert.equal('created_by' in publicData.invoice, false);
assert.equal((await publicRoute.GET(req('GET'), { params: Promise.resolve({ token: 'revoked-token' }) })).status, 404);
console.log('PASS financial capability, tenant, assigned brands, duplicate slugs, failed/truncated reads, and view-as boundaries');
console.log('PASS actual finance route denials, authorized detail edits, mixed bulk rejection, scoped lists/history, public projection and revoked tokens');

tables.team_members = [{ id: 'foreign-payee', tenant_id: 'b', is_archived: false }, { id: 'own-payee', tenant_id: 'a', is_archived: false, name: 'Local Payee' }];
tables.brand_compensation = [{ brand: 'alpha', tenant_id: 'a', team_member_id: 'own-payee', retainer: 100 }];
tables.brand_settings = []; tables.creator_commission_rates = []; tables.marketing_gmv = [];
let managedCalls = 0;
const math = load('src/lib/finance/invoice-math.ts', { '@/lib/data/brand-registry-core': { expandSlugs: (_reg, brand) => [brand] } });
const earnings = load('src/lib/data/earnings.ts', {
  ...base,
  '@/lib/data/brand-registry': { getBrandRegistry: async () => ({ rows: [{ id: 'umbrella-id', slug: 'umbrella', is_umbrella: true }], childrenByParentId: new Map([['umbrella-id', [{ slug: 'alpha' }, { slug: 'beta' }]]]) }) },
  '@/lib/finance/invoice-math': math,
  '@/lib/data/managed-gmv': { computeManagedGmv: async (_start, _end, slugs) => {
    managedCalls++; assert.deepEqual(Array.from(slugs), ['alpha']);
    return { storeSlugs: ['alpha'], labelByStore: new Map([['alpha', 'Alpha']]), byStoreCreator: new Map(), byStore: new Map() };
  } },
});
await assert.rejects(earnings.getEarnings('2026-09', 'foreign-payee', ['alpha'], 'a'), /Payee is unavailable/);
assert.equal(managedCalls, 0, 'Foreign payee is rejected before earnings computation');
const ownEarnings = await earnings.getEarnings('2026-09', undefined, ['alpha'], 'a');
assert.equal(ownEarnings.teamMember.id, 'own-payee');
assert.equal(ownEarnings.totals.retainers, 100);
assert.deepEqual(Array.from(ownEarnings.brands, row => row.brand), ['alpha'], 'Child-only access must not generate an umbrella enrichment key');
await assert.rejects(math.resolveCompensationModel(client, {}, 'alpha', 'foreign-payee', 'a', ['alpha']), /Payee unavailable/);
let ledgerWrites = 0;
const creation = load('src/lib/finance/create-invoice.ts', {
  '@/lib/data/earnings': earnings,
  '@/lib/finance/invoice-math': math,
  '@/lib/finance/earnings-ledger': { upsertEarningsLedger: async (_client, value) => { assert.equal(value.brandSlug, 'alpha'); assert.equal(value.teamMemberId, 'own-payee'); ledgerWrites++; return null; } },
  '@/lib/invoices/defaults': { DEFAULT_PAYMENT_INSTRUCTIONS: 'Fixture instructions' },
});
writes = [];
const badGeneration = await creation.createInvoiceForBrand({ tenantId: 'a', brand: 'foreign', month: '2026-09', scopedSlugs: ['alpha'], adminClient: client });
assert.equal(badGeneration.ok, false); assert.equal(writes.length, 0);
const generated = await creation.createInvoiceForBrand({ tenantId: 'a', brand: 'alpha', month: '2026-09', scopedSlugs: ['alpha'], adminClient: client, earnings: ownEarnings });
assert.equal(generated.ok, true); assert.equal(generated.invoice.team_member_id, 'own-payee'); assert.equal(generated.invoice.total_amount, 100); assert.equal(ledgerWrites, 1);
console.log('PASS actual earnings payee ownership, own-tenant default payee, compensation lookup and invoice/ledger generation');
scope = original;
tables.brands_v2.push({ id: 'archived', slug: 'archived', tenant_id: 'a', is_archived: true });
tables.managed_creators = [{ id: 'active-retainer', brand: 'alpha', retainer: 100, archived_at: null }, { id: 'archived-brand-retainer', brand: 'archived', retainer: 900, archived_at: null }];
const overview = load('src/app/api/payments/overview/route.ts', {
  ...deps,
  '@/lib/data/brand-registry': { getBrandRegistry: async () => ({}), activeBrandSlugs: () => ['alpha'] },
  '@/lib/data/fetch-all-rows': { fetchAllRows: async build => (await build()).data },
  '@/lib/finance/overdue': { isOverdue: () => false },
});
const overviewResult = await overview.GET();
assert.equal(overviewResult.status, 200);
assert.equal((await overviewResult.json()).retainerBook, 100, 'Archived brands remain outside the active retainer book');
tables.brands_v2.pop();
if (process.argv.includes('--reproduce')) {
  const path = 'src/lib/finance/invoice-guard.ts';
  const old = execFileSync('git', ['show', `6c92df088d9149dfe53b04dee0d13a2c05bfe96a:${path}`], { encoding: 'utf8' });
  const vulnerable = load(path, base, old);
  scope = readOnly;
  assert.equal((await vulnerable.guardInvoiceAction('foreign')).ok, true);
  assert.equal((await invoiceGuard.guardInvoiceAction('foreign')).ok, false);
  console.log('REPRODUCED baseline foreign-invoice write authorization for a read-only finance user; candidate rejects it');
}
