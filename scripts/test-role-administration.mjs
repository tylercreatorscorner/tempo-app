import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { NextRequest, NextResponse } from 'next/server.js';
import ts from 'typescript';

const localId = '00000000-0000-4000-8000-000000000001';
const foreignId = '00000000-0000-4000-8000-000000000002';
const original = { userId: 'actor', tenantId: 'a', role: 'owner' };
let scope = original;
let denied = false;
let failure = '';
let adminCalls = 0;
let queries = [];
let writes = [];
const rows = {
  roles: [{ id: localId, tenant_id: 'a', name: 'Local', is_default: false }, { id: foreignId, tenant_id: 'b', name: 'Foreign', is_default: false }],
  role_permissions: [{ role_id: localId, screen: 'earnings', level: 'read' }, { role_id: foreignId, screen: 'payments', level: 'write' }],
  user_profiles: [],
};
function from(table) {
  let op = 'read';
  let payload;
  const filters = [];
  const q = {
    select: () => q, order: () => q,
    eq: (column, value) => { filters.push([column, [value]]); return q; },
    neq: () => q,
    in: (column, values) => { filters.push([column, Array.from(values)]); return q; },
    update: value => { op = 'update'; payload = value; return q; },
    insert: value => { op = 'insert'; payload = value; return q; },
    delete: () => { op = 'delete'; return q; },
    maybeSingle: async () => run(true), single: async () => run(true),
    then: (resolve, reject) => Promise.resolve(run(false)).then(resolve, reject),
  };
  function run(single) {
    queries.push({ table, op, filters });
    if (op !== 'read') writes.push({ table, op, payload });
    const data = rows[table].filter(row => filters.every(([key, values]) => values.includes(row[key])));
    return { data: single ? data[0] ?? null : data, count: failure === table ? null : data.length, error: failure === table ? { message: 'fixture error' } : null };
  }
  return q;
}
const deps = {
  'next/server': { NextRequest, NextResponse },
  '@/lib/supabase/server': { createAdminClient: async () => { adminCalls++; return { from, rpc: async (name, args) => {
    assert.equal(name, 'manage_workspace_role');
    assert.equal(args.p_actor_id, scope.userId);
    if (args.p_role_id === foreignId) return { error: { code:'P0002', message:'Role not found' } };
    if (failure) return { error: { code:'XX000', message:'fixture error' } };
    if (args.p_operation === 'delete' && rows.user_profiles.length) return { error: { code:'23514',message:'Members still hold this role' } };
    writes.push({ rpc:name, args }); return { data:localId, error:null };
  } }; } },
  '@/lib/auth/require-screen': { guardScreen: async () => denied ? NextResponse.json({ error: 'Forbidden' }, { status: 403 }) : scope },
  '@/lib/auth/permissions': { SCREENS: ['earnings', 'payments', 'team'] },
};
const exports = {};
runInNewContext(ts.transpileModule(readFileSync('src/app/api/roles/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports, console, Date, require: name => { assert.ok(name in deps); return deps[name]; },
});
const request = (method, id = localId) => new NextRequest(`https://fixture.invalid/api/roles?id=${id}`, { method, ...(method === 'DELETE' ? {} : { body: JSON.stringify({ name: 'Renamed', from: id }), headers: { 'content-type': 'application/json' } }) });
for (const role of ['manager', 'coach', 'viewer', 'brand', 'brand_contact', 'creator', 'custom_finance', '']) {
  scope = { ...original, role };
  for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal((await exports[method](request(method))).status, 403);
}
for (const invalid of [{ ...original, tenantId: null }, { ...original, impersonating: { userId: 'another' } }]) {
  scope = invalid;
  for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal((await exports[method](request(method))).status, 403);
}
assert.equal(adminCalls, 0, 'Denied mutations must not open an administrative DB client');
scope = original; denied = true;
assert.equal((await exports.PATCH(request('PATCH'))).status, 403);
denied = false;
for (const role of ['owner', 'admin']) {
  scope = { ...original, role };
  assert.equal((await exports.PATCH(request('PATCH'))).status, 200);
  assert.equal((await exports.PATCH(request('PATCH', foreignId))).status, 404);
}
queries = []; writes = [];
const response = await exports.GET();
assert.equal(response.status, 200);
assert.equal((await response.json()).roles.length, 1);
assert.deepEqual(queries.find(q => q.table === 'role_permissions').filters, [['role_id', [localId]]]);
for (const table of ['roles', 'role_permissions', 'user_profiles']) {
  failure = table;
  assert.equal((await exports.GET()).status, 500);
}
failure = 'user_profiles'; writes = [];
assert.equal((await exports.DELETE(request('DELETE'))).status, 500);
assert.equal(writes.length, 0, 'A failed membership count must not permit deletion');
failure = ''; rows.user_profiles.push({ user_id: 'member', role_id: localId });
assert.equal((await exports.DELETE(request('DELETE'))).status, 409);
rows.user_profiles.length = 0;
assert.equal((await exports.DELETE(request('DELETE'))).status, 200);
console.log('PASS non-admin configure escalation, missing tenant, view-as and capability denials before DB access');
console.log('PASS legitimate admin edits, foreign role denial, tenant-filtered permission reads and failed membership checks');

const scopeExports = {};
const scopeDeps = {
  react: { cache: fn => fn },
  '@/lib/auth/platform-admin': { getActiveManagerId: async () => null },
  '@/lib/supabase/server': { createAdminClient: async () => ({ from }) },
};
runInNewContext(ts.transpileModule(readFileSync('src/lib/auth/workspace-scope.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: scopeExports, console, Set, require: name => {
  assert.ok(name in scopeDeps); return scopeDeps[name];
} });
const profile = { user_id:'member',tenant_id:'a',role:'owner',role_id:localId };
rows.user_profiles.push(profile);
assert.ok((await scopeExports.getWorkspaceScopeForUser('member')).permissions.has('earnings:read'));
profile.role_id = foreignId;
queries = [];
assert.equal((await scopeExports.getWorkspaceScopeForUser('member')).permissions, undefined);
assert.ok(!queries.some(q => q.table === 'role_permissions'));
profile.role_id = null; rows.roles[0].key = 'owner';
assert.ok((await scopeExports.getWorkspaceScopeForUser('member')).permissions.has('earnings:read'));
failure = 'roles';
assert.equal((await scopeExports.getWorkspaceScopeForUser('member')).permissions, undefined);
console.log('PASS explicit and fallback role ownership and fail-closed permission resolution');
