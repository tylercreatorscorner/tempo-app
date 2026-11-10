import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server.js';
import ts from 'typescript';

const original = { tenantId: 'tenant-a', role: 'owner', canViewFinance: true, permissions: new Set(['settings:read', 'settings:write', 'earnings:read', 'earnings:configure', 'invoicing:read', 'payments:read']), brandScope: { kind: 'all' } };
let scope = original;
let failure = '';
let truncated = false;
let calls = 0;
let financeCalls = 0;
let financeDenied = false;
let reads = [];
let writes = [];
let storageWrites = [];
const tables = {
  brands_v2: [
    { id: 'local', tenant_id: 'tenant-a', slug: 'alpha', name: 'Alpha', logo_url: 'https://fixture.invalid/storage/v1/object/public/brand-logos/local/old.png' },
    { id: 'second', tenant_id: 'tenant-a', slug: 'beta', name: 'Beta' },
    { id: 'foreign', tenant_id: 'tenant-b', slug: 'other', name: 'Foreign' },
  ],
  brand_settings: [{ brand: 'alpha', retainer: 1200, payment_instructions: 'Fixture bank instructions' }, { brand: 'other', retainer: 99000 }],
  team_members: [{ id: 'payee', tenant_id: 'tenant-a', name: 'Fixture Payee', is_archived: false }, { id: 'foreign-payee', tenant_id: 'tenant-b', name: 'Foreign Payee', is_archived: false }],
};
const client = {
  from(table) {
    reads.push(table);
    assert.ok(table in tables, table);
    let op = 'read', patch, columns = '*'; const filters = [];
    const q = {
      select: (value = '*') => { columns = value; return q; },
      eq: (key, value) => { filters.push(row => row[key] === value); return q; },
      is: (key, value) => { filters.push(row => row[key] === value); return q; },
      gte: (key, value) => { filters.push(row => row[key] >= value); return q; },
      lt: (key, value) => { filters.push(row => row[key] < value); return q; },
      in: (key, values) => { filters.push(row => values.includes(row[key])); return q; },
      order: () => q,
      insert: value => { op = 'insert'; patch = value; return q; },
      update: value => { op = 'update'; patch = value; return q; },
      single: async () => result(true), maybeSingle: async () => result(true),
      then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
    };
    function result(single = false) {
      const rows = op === 'insert' ? [{ id: 'created', ...patch }] : tables[table].filter(row => filters.every(filter => filter(row)));
      if (op !== 'read' && rows.length) writes.push({ table, op, ids: rows.map(row => row.id), patch });
      const selected = rows.map(row => columns === '*' ? { ...row, ...(patch ?? {}) } : Object.fromEntries(columns.split(',').map(c => c.trim()).map(c => [c, row[c]])));
      return { data: single ? selected[0] ?? null : truncated ? selected.slice(0, 1) : selected, count: rows.length, error: failure === table ? { message: 'Fixture read failed' } : null };
    }
    return q;
  },
  storage: { from: () => ({
    remove: async keys => { storageWrites.push(keys); return { error: null }; },
    upload: async key => { storageWrites.push(key); return { error: null }; },
    getPublicUrl: key => ({ data: { publicUrl: `https://fixture.invalid/storage/v1/object/public/brand-logos/${key}` } }),
  }) },
};
function load(path, deps) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, console, Date, Buffer, URL, File, FormData,
    require: name => { assert.ok(name in deps, `${path}: ${name}`); return deps[name]; },
  });
  return exports;
}
const workspace = { getWorkspaceScope: async () => scope, isBrandInScope: (s, b) => s.brandScope.kind === 'all' || s.brandScope.brandIds.includes(b.id) };
const permissions = load('src/lib/auth/permissions.ts', {});
const base = { 'next/server': { NextRequest, NextResponse }, 'node:crypto': { randomBytes }, '@/lib/auth/workspace-scope': workspace, '@/lib/auth/permissions': permissions, '@/lib/supabase/server': { createAdminClient: async () => { calls++; return client; } } };
const guards = { ...base, './workspace-scope': workspace, './permissions': permissions };
const brandAccess = load('src/lib/auth/brand-settings-access.ts', guards);
const billingAccess = load('src/lib/auth/billing-identity-access.ts', guards);
const financeAccess = load('src/lib/finance/access.ts', base);
const deps = { ...base, '@/lib/auth/brand-settings-access': brandAccess, '@/lib/auth/billing-identity-access': billingAccess, '@/lib/finance/access': { ...financeAccess, getFinanceAccess: (...args) => { financeCalls++; return financeDenied ? NextResponse.json({ error: 'Finance unavailable' }, { status: 403 }) : financeAccess.getFinanceAccess(...args); } } };
const brands = load('src/app/api/brands/route.ts', deps);
const brand = load('src/app/api/brands/[id]/route.ts', deps);
const logo = load('src/app/api/brands/[id]/logo/route.ts', deps);
const payees = load('src/app/api/team-members/route.ts', deps);
const payee = load('src/app/api/team-members/[id]/route.ts', deps);
const req = (method, body) => new NextRequest('https://fixture.invalid/api/brands', { method, ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) });
const ctx = id => ({ params: Promise.resolve({ id }) });
const metadataRequest = () => new NextRequest('https://fixture.invalid/api/brands?metadata=1');

// Metadata mode keeps the same workspace/brand/completeness boundary, while
// remaining independent of optional finance eligibility and billing reads.
for (const invalid of [null, { ...original, tenantId: null }]) {
  scope = invalid; calls = 0;
  assert.equal((await brands.GET(metadataRequest())).status, 403);
  assert.equal(calls, 0);
}
scope = original; failure = 'brand_settings'; financeCalls = 0; reads = [];
let metadata = await (await brands.GET(metadataRequest())).json();
assert.deepEqual(metadata.brands.map(row => row.id), ['local', 'second']);
assert.ok(metadata.brands.every(row => row.settings === null));
assert.equal(metadata.financeAvailable, false);
assert.equal(financeCalls, 0); assert.deepEqual(reads, ['brands_v2']);
assert.equal((await brands.GET()).status, 503, 'Default billing read still reports failed settings');
failure = ''; financeDenied = true; financeCalls = 0;
assert.equal((await brands.GET(metadataRequest())).status, 200);
assert.equal(financeCalls, 0);
assert.equal((await brands.GET()).status, 403, 'Metadata opt-in cannot weaken default finance access');
financeDenied = false;
tables.brands_v2.push({ id: 'metadata-ambiguous', tenant_id: 'tenant-b', slug: 'alpha' });
metadata = await (await brands.GET(metadataRequest())).json();
assert.deepEqual(metadata.brands.map(row => row.id), ['local', 'second'], 'Other tenant legacy slug cannot block authorized metadata');
assert.equal((await brands.GET()).status, 503, 'Ambiguous finance slug remains protected in default mode');
tables.brands_v2.pop();
scope = { ...original, role: 'manager', brandScope: { kind: 'scoped', brandIds: ['local'], brandSlugs: ['alpha'] } };
metadata = await (await brands.GET(metadataRequest())).json();
assert.deepEqual(metadata.brands.map(row => row.id), ['local']); assert.equal(metadata.scoped, true);
scope = { ...original, brandScope: { kind: 'scoped', brandIds: [], brandSlugs: [] } };
metadata = await (await brands.GET(metadataRequest())).json(); assert.equal(metadata.brands.length, 0);
scope = original; truncated = true;
assert.equal((await brands.GET(metadataRequest())).status, 503, 'Metadata cannot silently return a truncated brand list');
truncated = false; failure = 'brands_v2';
assert.equal((await brands.GET(metadataRequest())).status, 500);
failure = '';

for (const invalid of [null, { ...original, tenantId: null }, { ...original, permissions: new Set() }, { ...original, role: 'manager' }, { ...original, impersonating: { userId: 'view-as' } }]) {
  scope = invalid; calls = 0; writes = []; storageWrites = [];
  for (const [route, method] of [[brands, 'POST'], [brand, 'PATCH'], [logo, 'POST'], [logo, 'DELETE'], [payees, 'POST'], [payee, 'PATCH'], [payee, 'DELETE']]) {
    assert.equal((await route[method](req(method, { name: 'Fixture', slug: 'fixture' }), ctx('local'))).status, 403);
  }
  assert.equal(calls, 0); assert.equal(writes.length, 0); assert.equal(storageWrites.length, 0);
}
scope = { ...original, permissions: new Set(['settings:read']), canViewFinance: false };
let result = await (await brands.GET()).json();
assert.deepEqual(result.brands.map(b => b.id), ['local', 'second']);
assert.ok(result.brands.every(b => b.settings === null)); assert.equal(result.financeAvailable, false);
assert.equal((await payees.GET(req('GET'))).status, 403);
scope = { ...original, role: 'manager', brandScope: { kind: 'scoped', brandIds: ['local'], brandSlugs: ['alpha'] } };
result = await (await brands.GET()).json();
assert.deepEqual(result.brands.map(b => b.id), ['local']); assert.equal(result.brands[0].settings, null);
scope = original;
result = await (await brands.GET()).json();
assert.equal(result.brands[0].settings.retainer, 1200); assert.equal(result.financeAvailable, true);
assert.equal(result.brands.some(b => b.id === 'foreign'), false);
failure = 'brand_settings'; assert.equal((await brands.GET()).status, 503); failure = '';
truncated = true; assert.equal((await brands.GET()).status, 503); truncated = false;
tables.brands_v2.push({ id: 'ambiguous', tenant_id: 'tenant-b', slug: 'alpha' });
assert.equal((await brands.GET()).status, 503); tables.brands_v2.pop();
writes = []; storageWrites = [];
assert.equal((await brand.PATCH(req('PATCH', { name: 'Denied' }), ctx('foreign'))).status, 404);
assert.equal((await logo.DELETE(req('DELETE'), ctx('foreign'))).status, 404);
const form = new FormData(); form.append('file', new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'fixture.png', { type: 'image/png' }));
assert.equal((await logo.POST(new NextRequest('https://fixture.invalid/logo', { method: 'POST', body: form }), ctx('foreign'))).status, 404);
assert.equal(writes.length, 0); assert.equal(storageWrites.length, 0);
assert.equal((await brand.PATCH(req('PATCH', { name: 'Allowed' }), ctx('local'))).status, 200);
assert.deepEqual(writes.at(-1).ids, ['local']);
assert.equal((await brands.POST(req('POST', { slug: 'new', name: 'New fixture', tenant_id: 'tenant-b' }))).status, 201);
assert.equal(writes.at(-1).patch.tenant_id, 'tenant-a');
assert.equal((await logo.DELETE(req('DELETE'), ctx('local'))).status, 200);
assert.deepEqual(Array.from(storageWrites.at(-1)), ['local/old.png']);
result = await (await payees.GET(req('GET'))).json(); assert.deepEqual(result.teamMembers.map(p => p.id), ['payee']);
for (const method of ['PATCH', 'DELETE']) {
  assert.equal((await payee[method](req(method, { name: 'Changed' }), ctx('foreign-payee'))).status, 404);
  assert.equal((await payee[method](req(method, { name: 'Changed' }), ctx('payee'))).status, 200);
}
scope = { ...original, permissions: new Set(['earnings:read']) };
assert.equal((await payees.GET(req('GET'))).status, 200);
assert.equal((await payees.POST(req('POST', { name: 'Denied' }))).status, 403);
scope = { ...original, canViewFinance: false };
assert.equal((await payees.POST(req('POST', { name: 'Denied' }))).status, 403);
scope = original;
tables.managed_creators = [];
tables.invoices = [800, 0, null].map((amount, index) => ({ id: `receipt-${index}`, brand: 'alpha', status: 'paid', total_amount: 1000, amount_received: amount, paid_at: new Date().toISOString() }));
const paymentOverview = load('src/app/api/payments/overview/route.ts', {
  ...deps,
  '@/lib/finance/received-amount': load('src/lib/finance/received-amount.ts', {}),
  '@/lib/finance/overdue': { isOverdue: () => false },
  '@/lib/data/fetch-all-rows': { fetchAllRows: async factory => (await factory()).data },
  '@/lib/data/brand-registry': { getBrandRegistry: async () => ({}), activeBrandSlugs: () => ['alpha', 'beta'] },
});
result = await (await paymentOverview.GET()).json();
assert.equal(result.collectedAmount, 1800, 'Payments route selects and sums recorded receipts, preserving explicit zero and legacy fallback');
assert.equal(result.collectedCount, 3);
console.log('PASS brand metadata scope, protected billing, tenant writes/storage, failed/truncated reads, and view-as/capability denials');
