import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';

const require = createRequire(import.meta.url), origin = 'https://fixture.invalid';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tenant = id(1), foreign = id(2), brand = id(3), foreignBrand = id(4), creator = id(5);
const owner = { userId: id(10), tenantId: tenant, email: 'owner@fixture.invalid', role: 'owner', brandScope: { kind: 'all' }, permissions: new Set(['roster:read', 'roster:write']) };
let calls, tables, failure, rpcResult, user, role, scope;
function reset() {
  calls = []; failure = ''; user = null; role = 'owner'; scope = owner;
  rpcResult = { data: creator, error: null };
  tables = {
    invites: [{ id: id(6), tenant_id: tenant, brand: 'shared', code: 'validcode', active: true, expires_at: '2999-01-01T00:00:00Z', current_uses: 0, max_uses: 100 }],
    brands_v2: [
      { id: foreignBrand, tenant_id: foreign, slug: 'shared', name: 'PRIVATE FOREIGN', display_name: 'PRIVATE FOREIGN', is_archived: false },
      { id: brand, tenant_id: tenant, slug: 'shared', name: 'Own Brand', display_name: 'Own Display', is_archived: false },
    ],
    user_profiles: [{ user_id: id(10), role: 'owner' }],
  };
}
const db = {
  rpc: async (name, args) => { calls.push({ rpc: name, args }); return rpcResult; },
  from(table) {
    assert.ok(table in tables, `Unexpected table ${table}`);
    const trace = { table, filters: [] }; const filters = []; let mutation;
    const query = {
      select(columns) { trace.columns = columns; return query; },
      eq(key, value) { trace.filters.push([key, value]); filters.push(row => row[key] === value); return query; },
      maybeSingle() { return query; }, single() { return query; },
      insert(value) { mutation = value; trace.insert = value; return query; },
      then(resolve, reject) {
        calls.push(trace);
        let data = tables[table].find(row => filters.every(filter => filter(row))) ?? null;
        if (mutation) data = { ...mutation, id: id(20) };
        if (table === 'user_profiles') data = { ...data, role };
        return Promise.resolve({ data: failure === table ? null : data, error: failure === table ? { message: 'PRIVATE DATABASE DETAIL' } : null }).then(resolve, reject);
      },
    };
    return query;
  },
};
const dependencies = {
  'next/server': { NextRequest, NextResponse },
  '@/lib/supabase/server': { createAdminClient: async () => { calls.push({ admin: true }); return db; } },
  '@/lib/auth/workspace-scope': { getWorkspaceScope: async () => scope },
  '@/lib/messages/access': { messageReply: (body, status = 200) => NextResponse.json(body, { status }) },
  '@supabase/ssr': { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user } }) }, from: db.from }) },
};
function load(path) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, console, Date, URL, Set, process: { env: { NODE_ENV: 'production' } },
    require: name => name in dependencies ? dependencies[name] : require(name),
  });
  return exports;
}
dependencies['@/lib/auth/public-invite'] = load('src/lib/auth/public-invite.ts');
dependencies['@/lib/auth/permissions'] = load('src/lib/auth/permissions.ts');
const lookup = load('src/app/api/invites/[code]/route.ts');
const join = load('src/app/api/join/route.ts');
const generate = load('src/app/api/invites/generate/route.ts');
const middleware = load('src/lib/supabase/middleware.ts');
const input = { code: 'validcode', name: ' New Name ', email: ' NEW@fixture.invalid ', tiktok_usernames: ['@New.Handle'] };
const request = (path = '/api/join', body = input, extra = {}) => new NextRequest(`${origin}${path}`, {
  method: 'POST', headers: { origin, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body),
});
const get = (code = 'validcode') => lookup.GET(new NextRequest(`${origin}/api/invites/${code}`), { params: Promise.resolve({ code }) });
async function response(pending, status) {
  const result = await pending; assert.equal(result.status, status);
  const body = await result.json(); assert.ok(!JSON.stringify(body).includes('PRIVATE'));
  return body;
}

reset(); const visible = await response(get(), 200);
assert.deepEqual(visible, { brand: 'shared', brand_display_name: 'Own Display' });
assert.ok(calls.find(call => call.table === 'brands_v2').filters.some(([key, value]) => key === 'tenant_id' && value === tenant));
reset(); await response(get('../generate'), 404); assert.equal(calls.length, 0);
for (const setup of [
  () => { tables.invites[0].active = false; },
  () => { tables.invites[0].expires_at = '2000-01-01'; },
  () => { tables.invites[0].expires_at = 'invalid'; },
  () => { tables.invites[0].current_uses = 100; },
  () => { tables.invites[0].current_uses = null; },
  () => { tables.brands_v2[1].is_archived = true; },
  () => { tables.brands_v2 = tables.brands_v2.slice(0, 1); },
]) { reset(); setup(); const result = await get(); assert.ok(result.status >= 400); }
for (const table of ['invites', 'brands_v2']) { reset(); failure = table; await response(get(), 503); }

for (const body of [null, [], {}, { ...input, code: 'bad/code' }, { ...input, name: '\u0000' },
  { ...input, email: 'bad' }, { ...input, tiktok_usernames: ['same', '@SAME'] },
  { ...input, tiktok_usernames: [null] }, { ...input, tiktok_usernames: ['trailing.'] },
  { ...input, tiktok_usernames: Array.from({ length: 11 }, (_, i) => `name${i}`) },
]) { reset(); await response(join.POST(request('/api/join', body)), 400); assert.equal(calls.length, 0); }
reset(); await response(join.POST(request('/api/join', input, { origin: 'https://foreign.invalid' })), 403); assert.equal(calls.length, 0);
reset(); await response(join.POST(request('/api/join', input, { 'content-type': 'text/plain' })), 415); assert.equal(calls.length, 0);
reset(); await response(join.POST(request('/api/join', { ...input, name: 'x'.repeat(10001) })), 413); assert.equal(calls.length, 0);
reset(); await response(join.POST(new NextRequest(`${origin}/api/join`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{' })), 400);

reset(); const saved = await response(join.POST(request('/api/join', { ...input, tenant_id: foreign, brand_id: foreignBrand, creator_id: id(999), verified: true })), 200);
assert.deepEqual(saved, { success: true, creator_id: creator, verified: false, verified_usernames: [] });
assert.equal(calls.length, 2);
assert.equal(calls[1].rpc, 'register_creator_invite');
assert.deepEqual(JSON.parse(JSON.stringify(calls[1].args)), { p_code: 'validcode', p_name: 'New Name', p_email: 'new@fixture.invalid', p_tiktok_usernames: ['new.handle'] });
for (const [code, message, status] of [
  ['P0001', 'Invite unavailable', 410], ['P0001', 'Creator identity requires review', 409],
  ['23505', 'PRIVATE', 409], ['22023', 'PRIVATE', 400], ['PGRST202', 'PRIVATE', 503], ['XX000', 'PRIVATE', 503],
]) { reset(); rpcResult = { error: { code, message } }; await response(join.POST(request()), status); }
reset(); rpcResult = { data: null, error: null }; await response(join.POST(request()), 503);

// Generation remains owner/admin-only, including cases where a scoped role is
// accidentally granted every roster permission by the capability matrix.
for (const denied of [null, { ...owner, tenantId: '' }, { ...owner, role: 'manager' }, { ...owner, role: 'coach' },
  { ...owner, role: 'viewer' }, { ...owner, role: 'brand' }, { ...owner, role: 'admin', brandScope: { kind: 'scoped', brandIds: [brand], brandSlugs: ['shared'] } },
  { ...owner, impersonating: true }, { ...owner, permissions: new Set(['roster:read']) },
]) {
  reset(); scope = denied; await response(generate.POST(request('/api/invites/generate', { brand: 'shared' })), denied ? 403 : 401);
  assert.equal(calls.length, 0);
}
reset(); tables.brands_v2 = tables.brands_v2.slice(0, 1);
await response(generate.POST(request('/api/invites/generate', { brand: 'shared' })), 404); assert.ok(!calls.some(call => call.insert));

// Exercise actual middleware, not a source-text assertion. Recipient APIs work
// before sign-in, and no adjacent admin path is made public by prefix matching.
for (const [path, method, status] of [
  ['/api/invites/validcode', 'GET', 200], ['/api/join', 'POST', 200],
  ['/api/invites/generate', 'GET', 307], ['/api/invites/generate', 'POST', 307],
  ['/api/invites/validcode', 'POST', 307], ['/api/invites/validcode/extra', 'GET', 307],
  ['/api/join', 'GET', 307], ['/api/join/extra', 'POST', 307], ['/api/admin/creator-invites', 'GET', 307],
]) {
  reset(); const result = await middleware.updateSession(new NextRequest(`${origin}${path}`, { method }));
  assert.equal(result.status, status, `${method} ${path}`);
}
reset(); user = { id: id(10) };
const preview = await middleware.updateSession(new NextRequest(`${origin}/api/join`, { method: 'POST', headers: { cookie: 'platform_active_manager=fixture' } }));
assert.equal(preview.status, 403);
console.log('PASS public invite routes: scoped brand display, private errors, validated transaction input, admin generation, exact recipient middleware access');
