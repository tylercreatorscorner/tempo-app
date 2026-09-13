import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { NextRequest, NextResponse } from 'next/server.js';
import ts from 'typescript';

const original = { userId: 'actor', tenantId: 'a', role: 'owner' };
let scope = original;
let denied = false;
let failure = '';
let adminCalls = 0;
let queries = [];
let writes = [];
const rows = {
  roles: [{ id: 'local', tenant_id: 'a', name: 'Local', is_default: false }, { id: 'foreign', tenant_id: 'b', name: 'Foreign', is_default: false }],
  role_permissions: [{ role_id: 'local', screen: 'earnings', level: 'read' }, { role_id: 'foreign', screen: 'payments', level: 'write' }],
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
  '@/lib/supabase/server': { createAdminClient: async () => { adminCalls++; return { from }; } },
  '@/lib/auth/require-screen': { guardScreen: async () => denied ? NextResponse.json({ error: 'Forbidden' }, { status: 403 }) : scope },
  '@/lib/auth/permissions': { SCREENS: ['earnings', 'payments', 'team'] },
};
const exports = {};
runInNewContext(ts.transpileModule(readFileSync('src/app/api/roles/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports, console, Date, require: name => { assert.ok(name in deps); return deps[name]; },
});
const request = (method, id = 'local') => new NextRequest(`https://fixture.invalid/api/roles?id=${id}`, { method, ...(method === 'DELETE' ? {} : { body: JSON.stringify({ name: 'Renamed', from: id }), headers: { 'content-type': 'application/json' } }) });
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
  assert.equal((await exports.PATCH(request('PATCH', 'foreign'))).status, 404);
}
queries = []; writes = [];
const response = await exports.GET();
assert.equal(response.status, 200);
assert.equal((await response.json()).roles.length, 1);
assert.deepEqual(queries.find(q => q.table === 'role_permissions').filters, [['role_id', ['local']]]);
for (const table of ['roles', 'role_permissions', 'user_profiles']) {
  failure = table;
  assert.equal((await exports.GET()).status, 500);
}
failure = 'user_profiles'; writes = [];
assert.equal((await exports.DELETE(request('DELETE'))).status, 500);
assert.equal(writes.length, 0, 'A failed membership count must not permit deletion');
failure = ''; rows.user_profiles.push({ user_id: 'member', role_id: 'local' });
assert.equal((await exports.DELETE(request('DELETE'))).status, 409);
rows.user_profiles.length = 0;
assert.equal((await exports.DELETE(request('DELETE'))).status, 200);
console.log('PASS non-admin configure escalation, missing tenant, view-as and capability denials before DB access');
console.log('PASS legitimate admin edits, foreign role denial, tenant-filtered permission reads and failed membership checks');
