// Offline authorization/query regression. All signatures, database writes and DMs are fixtures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require('next/server');
const origin = 'https://fixture.invalid';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tenant = id(1), foreign = id(2), ownCreator = id(10), queuedCreator = id(11), foreignCreator = id(12);
const owner = { userId: id(3), tenantId: tenant, role: 'owner', canViewFinance: true, brandScope: { kind: 'all' }, permissions: new Set(['roster:read', 'roster:write']) };
let scope, tables, calls, signs, writes, messages, failure, nullCount;
function reset() {
  scope = owner; calls = []; signs = []; writes = []; messages = []; failure = ''; nullCount = false;
  tables = {
    creators_v2: [
      { id: ownCreator, tenant_id: tenant, real_name: 'Match Own', discord_id: '111111111111111111' },
      { id: queuedCreator, tenant_id: tenant, real_name: 'Queued Own', discord_id: '222222222222222222' },
      { id: foreignCreator, tenant_id: foreign, real_name: 'Match PRIVATE', discord_id: '333333333333333333' },
    ],
    managed_creators: [
      { id: 1, tenant_id: tenant, creator_id: ownCreator, archived_at: null },
      { id: 2, tenant_id: tenant, creator_id: queuedCreator, archived_at: null },
      { id: 3, tenant_id: foreign, creator_id: foreignCreator, archived_at: null },
      { id: 4, tenant_id: tenant, creator_id: foreignCreator, archived_at: null },
    ],
    tiktok_accounts: [
      { creator_id: ownCreator, tenant_id: tenant, tiktok_username: 'match-own' },
      { creator_id: ownCreator, tenant_id: foreign, tiktok_username: 'PRIVATE-foreign-handle' },
      { creator_id: foreignCreator, tenant_id: tenant, tiktok_username: 'match-PRIVATE-corrupt' },
      { creator_id: foreignCreator, tenant_id: foreign, tiktok_username: 'match-PRIVATE' },
    ],
    creator_claim_tokens: [
      { jti: 'owned', creator_id: queuedCreator, token: 'fixture-existing', discord_id: '222222222222222222', created_by: 'bulk-invite', dm_status: 'pending', consumed_at: null, expires_at: '2099-01-01T00:00:00Z' },
      { jti: 'foreign', creator_id: foreignCreator, token: 'PRIVATE', discord_id: '333333333333333333', created_by: 'bulk-invite', dm_status: 'pending', consumed_at: null, expires_at: '2099-01-01T00:00:00Z' },
    ],
  };
}
const field = (row, key) => key.split('.').reduce((value, name) => value?.[name], row);
const db = { from(table) {
  assert.ok(Object.hasOwn(tables, table), `Unexpected table ${table}`);
  const trace = { table, filters: [] }, filters = [], orders = [];
  let columns = '', options, range, limit, single = false, mutation, payload;
  const q = {
    select(value, opts) { columns = value; options = opts; trace.columns = value; return q; },
    eq(key, value) { trace.filters.push(['eq', key, value]); filters.push(row => field(row, key) === value); return q; },
    is(key, value) { trace.filters.push(['is', key, value]); filters.push(row => field(row, key) === value); return q; },
    in(key, values) { trace.filters.push(['in', key, values]); filters.push(row => values.includes(field(row, key))); return q; },
    not(key, op, value) { assert.equal(op, 'is'); trace.filters.push(['not', key, value]); filters.push(row => field(row, key) != value); return q; },
    gt(key, value) { trace.filters.push(['gt', key, value]); filters.push(row => field(row, key) > value); return q; },
    ilike(key, value) { filters.push(row => String(field(row, key)).toLowerCase().includes(value.replaceAll('%', '').toLowerCase())); return q; },
    order(key) { orders.push(key); return q; },
    range(from, to) { range = [from, to]; trace.range = range; return q; },
    limit(value) { limit = value; return q; },
    maybeSingle() { single = true; return q; },
    insert(value) { mutation = 'insert'; payload = value; return q; },
    update(value) { mutation = 'update'; payload = value; return q; },
    then(resolve, reject) {
      calls.push(trace);
      const failed = failure === table;
      let rows = tables[table].map(row => {
        const creator = tables.creators_v2.find(cv => cv.id === row.creator_id);
        return { ...row, creator, creators_v2: creator };
      }).filter(row => (!columns.includes('!inner') || row.creator) && filters.every(filter => filter(row)));
      if (mutation) {
        writes.push({ table, mutation, payload, ids: rows.map(row => row.jti ?? row.id) });
        if (!failed) {
          if (mutation === 'insert') { tables[table].push({ ...payload, consumed_at: null }); rows = [payload]; }
          else for (const row of rows) Object.assign(tables[table].find(original => original.jti === row.jti), payload);
        }
      }
      for (const key of orders.reverse()) rows.sort((a, b) => String(a[key]).localeCompare(String(b[key]), undefined, { numeric: true }));
      const count = nullCount ? null : rows.length;
      rows = range ? rows.slice(range[0], range[1] + 1) : rows.slice(0, 1000);
      if (limit !== undefined) rows = rows.slice(0, limit);
      return Promise.resolve({ data: failed || options?.head ? null : single ? rows[0] ?? null : rows, count, error: failed ? { message: 'PRIVATE database detail' } : null }).then(resolve, reject);
    },
  };
  return q;
} };
const dependencies = {
  'next/server': { NextRequest, NextResponse },
  'react/jsx-runtime': require('react/jsx-runtime'),
  './invites-client': { InvitesClient: () => null },
  '@/components/ui/page-header': { PageHeader: () => null },
  '@/components/ui/navigation-link': { NavigationLink: () => null },
  '@/components/ui/workspace-layout.module.css': { default: {} },
  '@/lib/auth/workspace-scope': { getWorkspaceScope: async () => scope },
  '@/lib/supabase/server': { createAdminClient: async () => { calls.push({ admin: true }); return db; } },
  './creator-auth': { generateClaimToken: async input => {
    signs.push(input); return { token: 'fixture-unsigned', jti: `fixture-${signs.length}`, expiresAt: new Date('2099-01-01') };
  } },
  '@/lib/discord/rest': { sendDirectMessage: async (recipient, payload) => { messages.push({ recipient, payload }); return { status: 'sent' }; } },
};
dependencies['@/lib/auth/creator-auth'] = dependencies['./creator-auth'];
function load(file) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, console, Date, Set, Map, process: { env: {} }, setTimeout: callback => callback(),
    require: name => { assert.ok(Object.hasOwn(dependencies, name), `Unexpected import ${name}`); return dependencies[name]; },
  });
  return exports;
}
dependencies['@/lib/auth/permissions'] = load('src/lib/auth/permissions.ts');
const access = load('src/lib/auth/creator-invite-access.ts');
dependencies['@/lib/auth/creator-invite-access'] = access;
dependencies['./creator-invite-access'] = access;
const claims = load('src/lib/auth/creator-claim.ts');
dependencies['@/lib/auth/creator-claim'] = claims;
const invites = load('src/lib/data/creator-invite.ts');
dependencies['@/lib/data/creator-invite'] = invites;
const route = load('src/app/api/admin/creator-invites/route.ts');
const page = load('src/app/(admin)/creators/invites/page.tsx').default;
const post = (body, headers = {}) => route.POST(new NextRequest(`${origin}/api/admin/creator-invites`, {
  method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
}));
async function response(promise, status) {
  const result = await promise;
  assert.equal(result.status, status);
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  const body = await result.json();
  assert.ok(!JSON.stringify(body).includes('PRIVATE'), 'responses must not expose foreign rows or internal errors');
  return body;
}

for (const denied of [null, { ...owner, tenantId: '' }, { ...owner, userId: '' }, { ...owner, role: 'manager' }, { ...owner, role: 'viewer' },
  { ...owner, permissions: undefined }, { ...owner, permissions: new Set(['roster:read']) }, { ...owner, permissions: new Set(['roster:write']) },
  { ...owner, impersonating: { userId: id(99) } }, { ...owner, brandScope: { kind: 'scoped', brandIds: [], brandSlugs: [] } }]) {
  reset(); scope = denied;
  const deniedPage = await page();
  assert.notEqual(deniedPage.type, dependencies['./invites-client'].InvitesClient);
  assert.match(JSON.stringify(deniedPage), /Portal invitations require full creator access/);
  await response(route.GET(), denied ? 403 : 401);
  for (const action of ['mint_link', 'enqueue', 'send', 'test']) await response(post({ action, creatorId: ownCreator, discordId: '111111111111111111' }), denied ? 403 : 401);
  assert.equal(calls.length, 0); assert.equal(signs.length, 0); assert.equal(messages.length, 0);
  await assert.rejects(invites.enqueueInvites(scope));
  await assert.rejects(invites.searchCreatorsForInvite(scope, 'match'));
  await assert.rejects(invites.getInviteStatus(scope));
  await assert.rejects(invites.sendClaimBatch(scope, { dryRun: false }));
  await assert.rejects(invites.sendTestInvite(scope, '111111111111111111', ownCreator));
  await assert.rejects(claims.mintClaimLink(scope, ownCreator, origin));
  assert.equal(calls.length, 0);
}
reset(); assert.equal((await page()).type, dependencies['./invites-client'].InvitesClient);
reset(); await response(post({ action: 'mint_link', creatorId: foreignCreator }), 404);
await response(post({ action: 'test', creatorId: foreignCreator, discordId: '111111111111111111' }), 404);
assert.equal(signs.length, 0); assert.equal(writes.length, 0); assert.equal(messages.length, 0);
reset(); const found = await response(post({ action: 'mint_link', query: 'match' }), 200);
assert.deepEqual(found.candidates, [{ id: ownCreator, name: 'Match Own', handles: ['match-own'] }]);
assert.equal(signs.length, 0);
reset(); const minted = await response(post({ action: 'mint_link', creatorId: ownCreator }), 200);
assert.equal(minted.minted.creatorId, ownCreator); assert.equal(signs.length, 1); assert.equal(writes[0].payload.creator_id, ownCreator);
reset(); failure = 'creators_v2'; await response(post({ action: 'mint_link', creatorId: ownCreator }), 503); assert.equal(signs.length, 0);
reset(); failure = 'tiktok_accounts'; await response(post({ action: 'mint_link', query: 'match' }), 503);

reset(); const status = await response(route.GET(), 200);
assert.equal(status.pending, 1); assert.equal(status.toEnqueue, 1);
assert.ok(calls.filter(call => call.table === 'creator_claim_tokens').every(call => call.filters.some(([, key, value]) => key === 'creator.tenant_id' && value === tenant)));
reset(); failure = 'creator_claim_tokens'; await response(route.GET(), 503);
reset(); nullCount = true; await response(route.GET(), 503);
reset(); failure = 'managed_creators'; await response(post({ action: 'enqueue' }), 503); assert.equal(signs.length, 0);
reset(); tables.creator_claim_tokens.push(
  { ...tables.creator_claim_tokens[0], jti: 'test-only', creator_id: ownCreator, created_by: 'test-invite' },
  { ...tables.creator_claim_tokens[0], jti: 'expired', creator_id: ownCreator, expires_at: '2000-01-01' },
  { ...tables.creator_claim_tokens[0], jti: 'claimed', creator_id: ownCreator, consumed_at: '2026-01-01' },
);
assert.equal((await response(route.GET(), 200)).toEnqueue, 1, 'test, expired and consumed links do not suppress a real invite');
reset(); await response(post({ action: 'enqueue' }), 200);
assert.deepEqual(signs.map(row => row.creatorId), [ownCreator]); assert.equal(messages.length, 0);
assert.ok(writes.every(row => row.payload.creator_id === ownCreator));

reset(); await response(post({ action: 'send' }), 200);
assert.equal(messages.length, 0); assert.equal(writes.length, 0); // omitted dryRun is safe
reset(); const sent = await response(post({ action: 'send', dryRun: false }), 200);
assert.equal(sent.attempted, 1); assert.equal(sent.remaining, 0); assert.equal(messages.length, 1);
assert.equal(messages[0].recipient, '222222222222222222');
assert.equal(tables.creator_claim_tokens.find(row => row.jti === 'foreign').dm_status, 'pending');
assert.ok(calls.filter(call => call.table === 'creator_claim_tokens' && !call.columns).every(call => call.filters.some(([, key, value]) => key === 'creator_id' && value === queuedCreator)));
reset(); await response(post({ action: 'test', discordId: '111111111111111111' }), 200);
assert.deepEqual(signs.map(row => row.creatorId), [ownCreator]); assert.equal(messages.length, 1);
reset(); tables.managed_creators = tables.managed_creators.filter(row => row.creator_id === foreignCreator);
const noCreator = await response(post({ action: 'test', discordId: '111111111111111111' }), 200);
assert.equal(noCreator.outcome, 'error'); assert.equal(signs.length, 0);

for (const body of [null, [], { action: 'send', limit: '40' }, { action: 'send', limit: 101 }, { action: 'send', dryRun: 'false' },
  { action: 'mint_link', creatorId: 'invalid' }, { action: 'mint_link', query: {} }, { action: 'test', discordId: {} }]) {
  reset(); await response(post(body), 400); assert.equal(calls.length, 0); assert.equal(signs.length, 0);
}
reset(); await response(post({ action: 'enqueue' }, { origin: 'https://foreign.invalid' }), 403); assert.equal(calls.length, 0);
reset(); await response(post({ action: 'enqueue' }, { 'content-type': 'text/plain' }), 415); assert.equal(calls.length, 0);
reset(); await response(post({ action: 'mint_link', query: 'a'.repeat(10001) }), 413); assert.equal(calls.length, 0);

// More than a PostgREST page of duplicate legacy rows cannot hide an eligible creator.
reset(); tables.managed_creators = Array.from({ length: 1001 }, (_, index) => ({ id: index, tenant_id: tenant, creator_id: queuedCreator, archived_at: null }));
tables.managed_creators.push({ id: 2000, tenant_id: tenant, creator_id: ownCreator, archived_at: null });
assert.equal((await response(route.GET(), 200)).toEnqueue, 1);
assert.ok(calls.some(call => call.table === 'managed_creators' && call.range?.[0] === 1000));
// Token pagination must inspect every active claim, including duplicate legacy tokens.
reset(); tables.creator_claim_tokens = Array.from({ length: 1001 }, (_, index) => ({ ...tables.creator_claim_tokens[0], jti: `claim-${index}` }));
tables.creator_claim_tokens.push({ ...tables.creator_claim_tokens[0], jti: 'zz-last', creator_id: ownCreator });
assert.equal((await response(route.GET(), 200)).toEnqueue, 0);
assert.ok(calls.some(call => call.table === 'creator_claim_tokens' && call.range?.[0] === 1000));
console.log('Legacy creator invite access passed: scope, tenant isolation, minting boundary, safe dry runs, failures, and pagination.');
