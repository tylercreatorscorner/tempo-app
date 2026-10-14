import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const origin = 'https://fixture.invalid';
const endpoint = `${origin}/api/agency/business`;
const owner = {
  userId: id(1), tenantId: id(2), role: 'owner', canViewFinance: true,
  brandScope: { kind: 'all' }, permissions: new Set(['reporting:read', 'earnings:read', 'earnings:configure']),
};
const draft = {
  expectedRevision: 0, name: ' Client A ', brandIds: [id(10)],
  serviceStart: '2026-01-15', serviceEnd: null, exitReason: null,
  terms: [{ effectiveMonth: '2026-01', monthlyRetainer: 0, revSharePercent: 0, feeModel: 'fixed' }],
};
const saved = { ...draft, name: 'Client A', id: id(90), revision: 1, updatedAt: '2026-10-04T12:00:00Z' };
const registry = [
  { id: id(10), tenant_id: id(2), slug: 'shared', name: 'Raw name', display_name: 'Client brand', logo_url: null, is_archived: false, parent_brand_id: null },
  { id: id(11), tenant_id: id(2), slug: 'archived', name: 'Archived brand', display_name: null, logo_url: null, is_archived: true, parent_brand_id: null },
  { id: id(12), tenant_id: id(2), slug: 'child', name: 'Child store', parent_brand_id: id(10) },
  { id: id(13), tenant_id: id(3), slug: 'shared', name: 'Foreign brand', parent_brand_id: null },
];
const defaultPerformance = [
  { brand_id: id(10), managed_gmv: null, prior_managed_gmv: '0', complete: true, prior_complete: true, recorded_through: '2026-09-30' },
  { brand_id: id(11), managed_gmv: '-12.25', prior_managed_gmv: null, complete: false, prior_complete: false, recorded_through: '2026-09-02' },
  { brand_id: id(12), managed_gmv: '999', prior_managed_gmv: '999', complete: true, prior_complete: true },
  { brand_id: id(13), managed_gmv: '999', prior_managed_gmv: '999', complete: true, prior_complete: true },
];
let scope, events, results, directoryError, directoryCount, serviceError;
function reset(nextScope = owner) {
  scope = nextScope;
  events = [];
  directoryError = null;
  directoryCount = undefined;
  serviceError = null;
  results = {
    agency_business_list_clients: { data: [saved], error: null },
    agency_business_month_performance: { data: defaultPerformance, error: null },
    agency_business_save_client: { data: saved, error: null },
  };
}
const admin = {
  from(table) {
    assert.equal(table, 'brands_v2', 'The route may only read the root brand directory directly');
    const trace = { type: 'directory', table, predicates: [] };
    const filters = [];
    const query = {
      select(columns, options) { trace.columns = columns; trace.options = options; return query; },
      eq(key, value) { trace.predicates.push(['eq', key, value]); filters.push(row => row[key] === value); return query; },
      is(key, value) { trace.predicates.push(['is', key, value]); filters.push(row => row[key] === value); return query; },
      order(key) { trace.order = key; return query; },
      limit(value) { trace.limit = value; return query; },
      then(yes, no) {
        events.push(trace);
        const data = registry.filter(row => filters.every(filter => filter(row)));
        return Promise.resolve({ data, error: directoryError, count: directoryCount === undefined ? data.length : directoryCount }).then(yes, no);
      },
    };
    return query;
  },
  async rpc(name, args) {
    events.push({ type: 'rpc', name, args: JSON.parse(JSON.stringify(args)) });
    assert.ok(name in results, `Unexpected privileged RPC: ${name}`);
    const result = results[name];
    if (result instanceof Error) throw result;
    return result;
  },
};
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-10-04T12:00:00Z'])); }
  static now() { return new Date('2026-10-04T12:00:00Z').getTime(); }
}
const dependencies = {
  'next/server': { NextRequest, NextResponse },
  '@/lib/auth/workspace-scope': { getWorkspaceScope: async () => scope },
  '@/lib/supabase/server': { createAdminClient: async () => {
    events.push({ type: 'admin-client' });
    if (serviceError) throw serviceError;
    return admin;
  } },
};
function load(file) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, console, Set, Map, Date: FixedDate, Intl,
    require(name) { assert.ok(name in dependencies, `Unstubbed import: ${name}`); return dependencies[name]; },
  });
  return exports;
}
dependencies['@/lib/auth/permissions'] = load('src/lib/auth/permissions.ts');
dependencies['@/lib/agency/model'] = load('src/lib/agency/model.ts');
dependencies['@/lib/agency/access'] = load('src/lib/agency/access.ts');
const { canAccessAgency } = dependencies['@/lib/agency/access'];
const route = load('src/app/api/agency/business/route.ts');
const get = (query = 'month=2026-09') => route.GET(new NextRequest(`${endpoint}?${query}`));
const post = (payload = draft, options = {}) => route.POST(new NextRequest(endpoint, {
  method: 'POST', headers: { origin, 'content-type': 'application/json', ...options.headers },
  body: options.raw ?? JSON.stringify(payload),
}));
async function expectStatus(pending, status) {
  const response = await pending;
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'private, no-store', 'Agreement/financial responses must never be cached publicly');
  return response.json();
}

// Exercise the actual access helper and permission implementation; privileged
// client construction itself must remain unreachable for every denied scope.
const deniedScopes = [
  null,
  ...['admin', 'manager', 'viewer', 'coach', 'brand', 'creator'].map(role => ({ ...owner, role })),
  { ...owner, brandScope: { kind: 'scoped', brandIds: [id(10)] } },
  { ...owner, impersonating: { userId: id(9) } },
  { ...owner, tenantId: '' },
  { ...owner, userId: '' },
  { ...owner, canViewFinance: false },
  { ...owner, permissions: undefined },
  { ...owner, permissions: new Set() },
  { ...owner, permissions: new Set(['earnings:read', 'earnings:configure']) },
  { ...owner, permissions: new Set(['reporting:read', 'earnings:configure']) },
];
for (const denied of deniedScopes) {
  reset(denied);
  assert.equal(canAccessAgency(scope), false);
  assert.equal(canAccessAgency(scope, true), false);
  await expectStatus(get(), denied ? 403 : 401);
  await expectStatus(post(), denied ? 403 : 401);
  assert.deepEqual(events, [], 'Denied callers cannot construct or use a service client');
}
reset({ ...owner, permissions: new Set(['reporting:read', 'earnings:read']) });
assert.equal(canAccessAgency(scope), true);
assert.equal(canAccessAgency(scope, true), false);
await expectStatus(post(), 403);
assert.deepEqual(events, []);
assert.equal((await expectStatus(get(), 200)).canEdit, false);
assert.equal(canAccessAgency({ ...owner, role: 'admin', agencyLeadership: 'vp' }, true), true);

for (const query of ['', 'month=2026-13', 'month=2026-9', 'month=1999-12', 'month=2101-01', 'month=2026-09-01', 'month=2026-10', 'month=2026-11']) {
  reset();
  await expectStatus(get(query), 400);
  assert.deepEqual(events, [], `Invalid/future month must be rejected before querying: ${query}`);
}
reset();
const body = await expectStatus(get(`month=2026-09&tenantId=${id(3)}&actorId=${id(9)}`), 200);
assert.equal(body.periodStart, '2026-09-01');
assert.equal(body.periodEnd, '2026-09-30');
assert.equal(body.priorPeriodStart, '2026-08-01');
assert.equal(body.priorPeriodEnd, '2026-08-31');
assert.deepEqual(body.clients, [saved]);
assert.deepEqual(body.brands.map(brand => [brand.id, brand.name, brand.archived]), [
  [id(10), 'Client brand', false], [id(11), 'Archived brand', true],
]);
assert.deepEqual(body.performance, [
  { brandId: id(10), managedGmv: null, priorManagedGmv: 0, complete: true, priorComplete: true, recordedThrough: '2026-09-30' },
  { brandId: id(11), managedGmv: -12.25, priorManagedGmv: null, complete: false, priorComplete: false, recordedThrough: '2026-09-02' },
], 'Missing money, source presence, recorded zero and refunds remain distinct; child/foreign facts are excluded');
assert.equal(body.storageReady, true);
assert.equal(body.canEdit, true);
assert.deepEqual(events.filter(event => event.type === 'rpc'), [
  { type: 'rpc', name: 'agency_business_list_clients', args: { p_tenant_id: owner.tenantId } },
  { type: 'rpc', name: 'agency_business_month_performance', args: { p_tenant_id: owner.tenantId, p_month: '2026-09-01' } },
]);
const directory = events.find(event => event.type === 'directory');
assert.deepEqual(directory.predicates, [['eq', 'tenant_id', owner.tenantId], ['is', 'parent_brand_id', null]]);
assert.equal(directory.options.count, 'exact');

reset();
assert.equal((await expectStatus(get('month=2000-01'), 200)).priorPeriodStart, '1999-12-01');
for (const value of [undefined, '', 'not-numeric', 'Infinity']) {
  reset();
  results.agency_business_month_performance.data = [{ ...defaultPerformance[0], managed_gmv: value }];
  assert.equal((await expectStatus(get(), 200)).performance[0].managedGmv, null);
}
for (const rpc of ['agency_business_list_clients', 'agency_business_month_performance']) {
  for (const code of ['PGRST202', '42883', '42P01']) {
    reset();
    results[rpc] = { data: null, error: { code, message: 'private schema detail' } };
    const unavailable = await expectStatus(get(), 200);
    assert.equal(unavailable.storageReady, false);
    assert.deepEqual(unavailable[rpc.endsWith('list_clients') ? 'clients' : 'performance'], []);
    assert.ok(!JSON.stringify(unavailable).includes('private schema detail'));
  }
}
for (const count of [null, 1, 3]) {
  reset();
  directoryCount = count;
  assert.match((await expectStatus(get(), 503)).error, /complete agency brand directory/);
}
reset();
directoryError = { code: '42501', message: 'private schema detail' };
assert.ok(!JSON.stringify(await expectStatus(get(), 503)).includes('private schema detail'));
for (const rpc of ['agency_business_list_clients', 'agency_business_month_performance']) {
  reset();
  results[rpc] = { data: null, error: { code: 'XX000', message: 'private schema detail' } };
  assert.ok(!JSON.stringify(await expectStatus(get(), 503)).includes('private schema detail'));
}
reset();
serviceError = new Error('private service credential detail');
assert.ok(!JSON.stringify(await expectStatus(get(), 503)).includes('private service credential detail'));

const invalidPosts = [
  [draft, { headers: { origin: 'https://attacker.invalid' } }, 403],
  [draft, { headers: { origin: '' } }, 403],
  [draft, { headers: { 'content-type': 'text/plain' } }, 415],
  [draft, { headers: { 'content-type': '' } }, 415],
  [draft, { raw: '{not JSON' }, 400],
  [draft, { raw: 'x'.repeat(100001) }, 413],
  [null, {}, 400],
  [{ ...draft, tenantId: id(3) }, {}, 400],
  [{ ...draft, actorId: id(9) }, {}, 400],
  [{ ...draft, serviceStart: '2026-02-30' }, {}, 400],
  [{ ...draft, terms: [{ effectiveMonth: '2026-09', feeModel: 'fixed' }] }, {}, 400],
  [{ ...draft, expectedRevision: 0.5 }, {}, 400],
  [{ ...draft, brandIds: [id(10), id(10)] }, {}, 400],
];
for (const [payload, options, status] of invalidPosts) {
  reset();
  await expectStatus(post(payload, options), status);
  assert.deepEqual(events, [], 'Invalid writes cannot construct or use a service client');
}
reset({ ...owner, role: 'admin', agencyLeadership: 'owner', userId: id(8), tenantId: id(7) });
assert.deepEqual(await expectStatus(post(), 200), saved);
assert.deepEqual(events, [
  { type: 'admin-client' },
  { type: 'rpc', name: 'agency_business_save_client', args: {
    p_tenant_id: id(7), p_actor_id: id(8), p_payload: { ...draft, name: 'Client A' },
  } },
], 'The only saved actor and tenant come from the trusted server scope, with validated normalized input');

for (const [error, status, publicText] of [
  [{ code: 'PGRST202', message: 'private schema detail' }, 503, 'not available'],
  [{ code: 'P0001', message: 'Agency client changed. secret internal context' }, 409, 'updated by someone else'],
  [{ code: 'P0001', message: 'Agency brand already belongs to another client: secret identity' }, 409, 'already linked'],
  [{ code: 'P0001', message: 'Invalid agency brands: secret tenant id' }, 400, 'Check its brands'],
  [{ code: 'XX000', message: 'private schema detail' }, 503, 'Please try again'],
]) {
  reset();
  results.agency_business_save_client = { data: null, error };
  const failed = await expectStatus(post(), status);
  assert.ok(failed.error.includes(publicText));
  assert.ok(!failed.error.includes(error.message), 'SQL error text must be masked');
  assert.equal(events.filter(event => event.type === 'rpc').length, 1);
}
reset();
results.agency_business_save_client = new Error('private service credential detail');
assert.ok(!JSON.stringify(await expectStatus(post(), 503)).includes('private service credential detail'));

console.log('PASS agency access: real permissions, leadership/finance/reach gates, impersonation denial and no privileged calls on rejection');
console.log('PASS agency GET: trusted tenant, bounded months, null/zero/refund semantics, root-only directory, readiness and complete-directory failure');
console.log('PASS agency POST: origin/type/size/validation, trusted actor, normalized save, stale/grouping conflicts and masked SQL failures');

for (const role of ['manager','coach','viewer']) {
  assert.equal(canAccessAgency({...owner,role,agencyLeadership:'vp'}),false);
}
assert.equal(canAccessAgency({...owner,role:'admin',agencyLeadership:null}),false);
