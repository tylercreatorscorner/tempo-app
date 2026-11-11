import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the real route with an isolated, predicate-aware database. No live
// credentials or requests are used, including on the successful archive path.
let scope, rows, writes, beforeWrite, readError, writeError, adminCalls;
const history = Object.freeze([{ creator_id: 30, gmv: 1234, message: 'Kept' }]);
function reset() {
  scope = { tenantId: 'ours', email: 'operator@example.invalid', role: 'manager',
    brandScope: { kind: 'scoped', brandSlugs: ['alpha'] }, permissions: new Set(['roster:read', 'roster:write']) };
  rows = [
    { id: 30, tenant_id: 'ours', brand: 'alpha', real_name: 'Creator', archived_at: null },
    { id: 31, tenant_id: 'ours', brand: 'beta', real_name: 'Same creator, another brand', archived_at: null },
    { id: 32, tenant_id: 'other', brand: 'alpha', real_name: 'Foreign tenant', archived_at: null },
  ];
  writes = []; beforeWrite = null; readError = false; writeError = false; adminCalls = 0;
}
class Response {
  constructor(body, status = 200) { this.body = body; this.status = status; }
  static json(body, init) { return new Response(body, init?.status); }
}
function query(table) {
  assert.equal(table, 'managed_creators', 'Removal never deletes accounts, messages, or performance');
  let update;
  const filters = [];
  const q = {
    select() { return q; },
    eq(key, value) { filters.push({ key, value }); return q; },
    is(key, value) { filters.push({ key, value }); return q; },
    update(value) { update = value; return q; },
    async maybeSingle() {
      if (update && beforeWrite) beforeWrite();
      const matches = rows.filter(row => filters.every(({ key, value }) => key === 'id' ? String(row[key]) === String(value) : row[key] === value));
      if (readError || (update && writeError)) return { data: null, error: { message: 'private database detail' } };
      if (update) {
        writes.push({ update, filters, ids: matches.map(row => row.id) });
        for (const row of matches) Object.assign(row, update);
      }
      return { data: matches[0] ? { ...matches[0] } : null, error: null };
    },
  };
  return q;
}
function load(path, dependencies) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, { exports, require: name => {
    assert.ok(name in dependencies, `Unmocked dependency: ${name}`); return dependencies[name];
  }, Date, Number, Set });
  return exports;
}
const permissions = load('src/lib/auth/permissions.ts', {});
const route = load('src/app/api/roster/[id]/route.ts', {
  'next/server': { NextResponse: Response },
  '@/lib/auth/workspace-scope': { getWorkspaceScope: async () => scope },
  '@/lib/auth/permissions': permissions,
  '@/lib/supabase/server': { createAdminClient: async () => { adminCalls++; return { from: query }; } },
});
const remove = (id = '30', brand) => route.DELETE({ nextUrl: new URL(`https://tempo.invalid/api/roster/${id}${brand === undefined ? '' : `?brand=${encodeURIComponent(brand)}`}`) }, { params: Promise.resolve({ id }) });

for (const change of [
  () => { scope = null; },
  () => { scope.permissions = new Set(['roster:read']); },
  () => { scope.permissions = undefined; },
  () => { scope.impersonating = { userId: 'someone' }; },
  () => { scope.role = 'viewer'; scope.brandScope = { kind: 'all' }; scope.permissions = new Set(['roster:read']); },
]) {
  reset(); change(); const result = await remove();
  assert.equal(result.status, scope ? 403 : 401); assert.equal(adminCalls, 0); assert.equal(writes.length, 0);
}
for (const id of ['0', '-1', '1.5', 'creator-uuid', '30 OR 1=1', '9007199254740993', '']) {
  reset(); assert.equal((await remove(id)).status, 400); assert.equal(adminCalls, 0);
}
for (const [id, expected] of [['31', 403], ['32', 404], ['99', 404]]) {
  reset(); assert.equal((await remove(id)).status, expected); assert.equal(writes.length, 0);
}
reset(); scope.brandScope.brandSlugs = []; assert.equal((await remove()).status, 403); assert.equal(writes.length, 0);
reset(); rows[0].brand = null; assert.equal((await remove()).status, 403); assert.equal(writes.length, 0);
reset(); readError = true; assert.equal((await remove()).status, 404); assert.equal(writes.length, 0);
for (const brand of ['', ' ', 'all']) {
  reset(); assert.equal((await remove('30', brand)).status, 400); assert.equal(adminCalls, 0);
}
reset(); scope.role = 'owner'; scope.brandScope = { kind: 'all' };
assert.equal((await remove('30', 'beta')).status, 409); assert.equal(writes.length, 0, 'Stale UI cannot remove a membership moved to another brand');

reset();
let result = await remove('30', 'alpha');
assert.equal(result.status, 200); assert.equal(result.body.ok, true); assert.equal(result.body.archived.id, 30);
assert.equal(writes.length, 1); assert.deepEqual(writes[0].ids, [30]);
assert.ok(Date.parse(rows[0].archived_at)); assert.equal(rows[0].updated_by, scope.email);
assert.equal(rows[1].archived_at, null, 'Another brand membership stays active');
assert.equal(rows[2].archived_at, null, 'Another tenant stays untouched');
assert.equal(history[0].gmv, 1234);
const firstArchivedAt = rows[0].archived_at;
result = await remove();
assert.equal(result.status, 200); assert.equal(result.body.alreadyArchived, true);
assert.equal(writes.length, 1); assert.equal(rows[0].archived_at, firstArchivedAt, 'Retries keep the original archive boundary');

for (const role of ['owner', 'admin']) {
  reset(); scope.role = role; scope.brandScope = { kind: 'all' }; rows[0].brand = null;
  assert.equal((await remove()).status, 200); assert.deepEqual(writes[0].ids, [30]);
  assert.ok(writes[0].filters.some(filter => filter.key === 'brand' && filter.value === null));
}
for (const mutate of [
  () => { rows[0].brand = 'beta'; },
  () => { rows[0].tenant_id = 'other'; },
  () => { rows[0].archived_at = '2026-10-01T00:00:00.000Z'; },
]) {
  reset(); beforeWrite = mutate; assert.equal((await remove()).status, 409);
  assert.deepEqual(writes[0].ids, [], 'A changed target is not archived from stale authority');
  assert.equal(rows[0].updated_by, undefined);
}
reset(); writeError = true; result = await remove();
assert.equal(result.status, 500); assert.equal(writes.length, 0);
assert.ok(!result.body.error.includes('private database detail'));
assert.equal(rows[0].archived_at, null);
console.log('PASS creator removal: write permission, impersonation, valid IDs, tenant and brand boundaries, preserved memberships and history');
console.log('PASS creator removal: idempotent retries, stale brand/tenant/archive conflicts, actor stamping and safe failure responses');
