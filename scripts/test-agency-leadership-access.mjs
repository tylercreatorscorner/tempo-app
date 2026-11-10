import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Entirely local fixtures: the real resolver, guards and page functions run
// against a filtering in-memory client, never a live account or database.
const require = createRequire(import.meta.url);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tenant = id(1), foreign = id(2);
const profiles = ['Tyler', 'Jimmy', 'CC Ops', 'CJoe', 'Jen', 'Leon', 'Sadie', 'Sein', 'Alternate Tyler', 'Unnamed admin']
  .map((name, index) => ({ user_id: id(10 + index), tenant_id: tenant, name, email: `${index}@fixture.invalid`, role: index ? 'admin' : 'owner' }));
profiles.push({ user_id: id(30), tenant_id: foreign, name: 'Other owner', role: 'owner' },
  { user_id: id(31), tenant_id: foreign, name: 'Other admin', role: 'admin' },
  { user_id: id(32), tenant_id: tenant, name: 'Logan fixture', role: 'manager' });
const roles = ['owner', 'admin', 'manager'].flatMap((key, index) => [tenant, foreign].map((tenant_id, t) => ({ id: id(100 + index * 2 + t), tenant_id, key })));
const permissions = roles.flatMap(role => ['reporting:read', 'earnings:read', 'earnings:configure'].map(value => {
  const [screen, level] = value.split(':'); return { role_id: role.id, screen, level };
}));
let leadership = [{ tenant_id: tenant, user_id: id(11), designation: 'owner' }];
let scope = null, calls = [], failLeadership = false, throwLeadership = false, invoiceError = false;
const ownInvoice = { id: id(200), tenant_id: tenant, month: '2026-09', status: 'issued', snapshot: { feeCents: 10000 } };
const foreignInvoice = { id: id(201), tenant_id: foreign, month: '2026-09', status: 'paid', snapshot: { private: 'foreign' } };
const tables = { user_profiles: profiles, roles, role_permissions: permissions, user_brand_access: [], agency_client_invoices: [ownInvoice, foreignInvoice] };
const db = {
  from(table) {
    assert.ok(table in tables || table === 'agency_leadership_access', `Unexpected privileged table: ${table}`);
    if (table === 'agency_leadership_access' && throwLeadership) throw new Error('fixture unavailable');
    const filters = [], trace = { table, filters: [] };
    const query = {
      select(columns) { trace.columns = columns; return query; },
      eq(key, value) { filters.push(row => row[key] === value); trace.filters.push([key, value]); return query; },
      maybeSingle() { return Promise.resolve(result(true)); },
      then(resolve, reject) { return Promise.resolve(result(false)).then(resolve, reject); },
    };
    function result(single) {
      calls.push(trace);
      const values = (table === 'agency_leadership_access' ? leadership : tables[table]).filter(row => filters.every(filter => filter(row)));
      const error = (table === 'agency_leadership_access' && failLeadership) || (table === 'agency_client_invoices' && invoiceError);
      return { data: single ? values[0] ?? null : values, error: error ? { message: 'fixture unavailable' } : null };
    }
    return query;
  },
};
const deps = {
  react: { ...require('react'), cache: fn => fn },
  'react/jsx-runtime': require('react/jsx-runtime'),
  'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error('not-found'); } },
  'next/headers': { cookies: async () => ({ get: () => undefined }) },
  '@/lib/supabase/server': { createAdminClient: async () => db },
  '@/lib/auth/platform-admin': { getActiveManagerId: async () => null },
  '@/lib/auth/workspace-scope': { getWorkspaceScope: async () => scope },
  '@/components/layout/admin-shell': { AdminShell: 'fixture-admin-shell' },
  '@/components/layout/tenant-switcher-server': { TenantSwitcherServer: 'fixture-tenant-switcher' },
  '@/components/layout/view-as-banner-server': { ViewAsBannerServer: 'fixture-view-as-banner' },
  './document': { AgencyInvoiceDocument: 'fixture-invoice-document' },
  zod: require('zod'),
};
function load(file) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, console, require: name => { assert.ok(name in deps, `Unstubbed import: ${name}`); return deps[name]; } });
  return exports;
}
deps['@/lib/auth/permissions'] = load('src/lib/auth/permissions.ts');
deps['@/lib/agency/access'] = load('src/lib/agency/access.ts');
const { canAccessAgency } = deps['@/lib/agency/access'];
const resolver = load('src/lib/auth/workspace-scope.ts');
const adminLayout = load('src/app/(admin)/layout.tsx').default;
const agencyLayout = load('src/app/(admin)/agency/layout.tsx').default;
const invoicePage = load('src/app/(admin)/agency/finance/invoice/[id]/page.tsx').default;
const print = invoiceId => invoicePage({ params: Promise.resolve({ id: invoiceId }) });

// Existing CC account shapes: only the owner and designated Jimmy admin pass.
for (const [index, profile] of profiles.entries()) {
  calls = [];
  scope = await resolver.getWorkspaceScopeForUser(profile.user_id);
  const allowed = index === 0 || index === 1 || profile.user_id === id(30);
  assert.equal(canAccessAgency(scope), allowed, profile.name);
  assert.equal(canAccessAgency(scope, true), allowed, `${profile.name} writes`);
  assert.equal((await adminLayout({ children: 'fixture' })).props.navPerms.agency, allowed, `${profile.name} navigation`);
  if (profile.role === 'admin') {
    const query = calls.find(call => call.table === 'agency_leadership_access');
    assert.deepEqual(query.filters, [['tenant_id', profile.tenant_id], ['user_id', profile.user_id]], 'designation lookup is bound to trusted tenant and identity');
  }
  if (allowed) assert.equal((await agencyLayout({ children: 'fixture' })).props.children, 'fixture');
  else {
    await assert.rejects(() => agencyLayout({ children: 'private' }), /redirect:\/dashboard/);
    calls = [];
    await assert.rejects(() => print(ownInvoice.id), /not-found/);
    assert.equal(calls.length, 0, 'denied direct print cannot query invoice data');
  }
}

// A designation in another tenant, malformed designation, read failure or
// revocation never grants access; failure leaves the normal admin scope usable.
for (const rows of [[], [{ tenant_id: foreign, user_id: id(11), designation: 'owner' }], [{ tenant_id: tenant, user_id: id(11), designation: 'admin' }]]) {
  leadership = rows;
  const denied = await resolver.getWorkspaceScopeForUser(id(11));
  assert.equal(denied.role, 'admin'); assert.equal(canAccessAgency(denied), false);
}
leadership = [{ tenant_id: tenant, user_id: id(11), designation: 'owner' }];
for (const failure of ['query', 'throw']) {
  failLeadership = failure === 'query'; throwLeadership = failure === 'throw';
  const denied = await resolver.getWorkspaceScopeForUser(id(11));
  assert.equal(denied.role, 'admin'); assert.equal(canAccessAgency(denied), false);
}
failLeadership = false; throwLeadership = false;
for (const designation of ['owner', 'vp']) {
  leadership.push({ tenant_id: foreign, user_id: id(31), designation });
  assert.equal(canAccessAgency(await resolver.getWorkspaceScopeForUser(id(31))), true, 'other tenants retain designated leadership support');
  leadership.pop();
}
leadership.push({ tenant_id: tenant, user_id: id(32), designation: 'vp' });
assert.equal(canAccessAgency(await resolver.getWorkspaceScopeForUser(id(32))), false, 'a stray manager designation cannot admit Logan or another manager');

scope = await resolver.getWorkspaceScopeForUser(id(11));
for (const override of [{ impersonating: { userId: id(99) } }, { brandScope: { kind: 'scoped', brandIds: [] } }, { canViewFinance: false }, { permissions: undefined }, { permissions: new Set(['earnings:read']) }]) {
  const denied = { ...scope, ...override };
  assert.equal(canAccessAgency(denied), false); assert.equal(canAccessAgency(denied, true), false);
}
const readOnly = { ...scope, permissions: new Set(['reporting:read', 'earnings:read']) };
assert.equal(canAccessAgency(readOnly), true); assert.equal(canAccessAgency(readOnly, true), false);
scope = null;
await assert.rejects(() => agencyLayout({ children: 'private' }), /redirect:\/login/);
assert.equal((await adminLayout({ children: 'fixture' })).props.navPerms.agency, false);

scope = readOnly;
calls = [];
await assert.rejects(() => print('malformed'), /not-found/);
assert.equal(calls.length, 0, 'malformed IDs do not query invoice data');
await assert.rejects(() => print(foreignInvoice.id), /not-found/);
assert.deepEqual(calls[0].filters, [['tenant_id', tenant], ['id', foreignInvoice.id]]);
calls = [];
const document = await print(ownInvoice.id);
assert.equal(document.type, 'fixture-invoice-document');
assert.deepEqual(JSON.parse(JSON.stringify(document.props.invoice)), { id: ownInvoice.id, month: ownInvoice.month, status: ownInvoice.status, snapshot: ownInvoice.snapshot });
assert.deepEqual(calls[0].filters, [['tenant_id', tenant], ['id', ownInvoice.id]]);
invoiceError = true;
await assert.rejects(() => print(ownInvoice.id), /not-found/);

console.log('PASS Agency leadership: real resolver, 10 CC account shapes, manager exclusion, designation revocation/failure, tenant isolation and other-tenant leadership');
console.log('PASS Agency navigation/page/print: shared capability gate, login/denial, impersonation, read-only print, trusted tenant and unavailable/foreign invoice denial');
