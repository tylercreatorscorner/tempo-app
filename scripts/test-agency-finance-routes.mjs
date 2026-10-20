import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';
const require = createRequire(import.meta.url), id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const origin = 'https://fixture.invalid';
const owner = { userId: id(1), tenantId: id(2), role: 'owner', canViewFinance: true, brandScope: { kind: 'all' }, permissions: new Set(['reporting:read', 'earnings:read', 'earnings:configure']) };
let scope = owner, calls = [], rows = {}, rpcRows = {}, wrongCount = false;
const db = {
  from(table) {
    const filters = [], query = {
      select() { return query; }, eq(k, v) { filters.push([k, v]); return query; }, in() { return query; }, limit() { return query; }, order() { return query; },
      maybeSingle() { query.single = true; return query; },
      then(resolve, reject) { calls.push({ table, filters }); const data = rows[table] ?? []; return Promise.resolve({ data: query.single ? data[0] ?? null : data, error: null, count: wrongCount ? 1001 : data.length }).then(resolve, reject); },
    }; return query;
  },
  rpc(name, args) { calls.push({ name, args }); const promise = Promise.resolve(rpcRows[name] ?? { data: [], error: null }); promise.abortSignal = () => promise; return promise; },
  storage: { from(bucket) { assert.equal(bucket, 'agency-contracts'); return { createSignedUrl: async (path, seconds) => { calls.push({ path, seconds }); return { data: { signedUrl: 'https://fixture.invalid/private-download' }, error: null }; } }; } },
};
const modules = new Map();
function load(path) {
  if (modules.has(path)) return modules.get(path);
  const exports = {}, code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  runInNewContext(code, { exports, process: { env: {} }, Date, Intl, Buffer, File, AbortSignal, console, require: name => {
    if (name === 'next/server') return { NextRequest, NextResponse };
    if (name === '@/lib/auth/workspace-scope') return { getWorkspaceScope: async () => scope };
    if (name === '@/lib/supabase/server') return { createAdminClient: async () => { calls.push({ admin: true }); return db; } };
    if (name === '@/lib/agency/access') return load('src/lib/agency/access.ts');
    if (name === '@/lib/auth/workspace-scope-types') return {};
    if (name === '@/lib/auth/can') return { can: (s, screen, level) => s.permissions.has(`${screen}:${level}`) };
    if (name === '@/lib/agency/finance-model') return load('src/lib/agency/finance-model.ts');
    if (name === '@/lib/agency/model' || name === './model') return load('src/lib/agency/model.ts');
    if (name.includes('permissions')) return { can: (s, screen, level) => s.permissions.has(`${screen}:${level}`) };
    return require(name);
  } }); modules.set(path, exports); return exports;
}
const finance = load('src/app/api/agency/finance/route.ts'), contracts = load('src/app/api/agency/contracts/route.ts');
const post = (body, requestOrigin = origin) => finance.POST(new NextRequest(`${origin}/api/agency/finance`, { method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
for (const rejected of [null, { ...owner, role: 'manager' }, { ...owner, canViewFinance: false }, { ...owner, impersonating: true }, { ...owner, brandScope: { kind: 'assigned', brandIds: [] } }]) {
  scope = rejected; calls = []; assert.ok([401, 403].includes((await finance.GET()).status)); assert.ok([401, 403].includes((await post({})).status)); assert.ok([401, 403].includes((await contracts.GET(new NextRequest(`${origin}/api/agency/contracts?id=${id(9)}`))).status)); assert.equal(calls.length, 0);
}
scope = owner; calls = [];
assert.equal((await post({}, 'https://foreign.invalid')).status, 403); assert.equal(calls.length, 0);
assert.equal((await post({ action: 'draft', clientId: id(3), month: '2026-09', snapshot: { feeCents: 1 } })).status, 400, 'caller cannot provide invoice amounts');
assert.equal((await finance.GET()).status, 200);
assert.ok(calls.filter(c => c.table).every(c => c.filters.some(([k, v]) => k === 'tenant_id' && v === owner.tenantId)));
wrongCount = true; assert.equal((await finance.GET()).status, 503); wrongCount = false;
const model = load('src/lib/agency/finance-model.ts');
const settings = model.emptyFinanceSettings();
rpcRows.agency_finance_write = { data: { revision: 1 }, error: null };
assert.equal((await post({ action: 'settings', clientId: id(3), expectedRevision: 0, settings })).status, 200);
const write = calls.findLast(c => c.name === 'agency_finance_write'); assert.equal(write.args.p_tenant_id, owner.tenantId); assert.equal(write.args.p_actor_id, owner.userId);
rows.agency_contracts = [{ storage_path: 'tenant/client/file.pdf', name: 'signed.pdf' }]; calls = [];
assert.equal((await contracts.GET(new NextRequest(`${origin}/api/agency/contracts?id=${id(9)}`))).status, 200);
assert.equal(calls.find(c => c.seconds).seconds, 60); assert.ok(calls.find(c => c.table).filters.some(([k, v]) => k === 'tenant_id' && v === owner.tenantId));
rows.agency_contracts = []; calls = [];
assert.equal((await contracts.GET(new NextRequest(`${origin}/api/agency/contracts?id=${id(9)}`))).status, 404); assert.ok(!calls.some(c => c.path));
console.log('PASS agency finance routes: leadership guards, denied requests avoid service credentials, origin, strict command schema, tenant predicates, incomplete reads fail closed, trusted actor, private scoped downloads');
