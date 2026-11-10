import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';

const require = createRequire(import.meta.url), origin = 'https://fixture.invalid';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tenant = id(1), foreign = id(2), creator = id(10), otherCreator = id(11), foreignCreator = id(12), brand = id(20), otherBrand = id(21), foreignBrand = id(22);
const discord = '111111111111111111', discordChannel = '222222222222222222', discordMessage = '333333333333333333';
const owner = { userId: id(3), tenantId: tenant, role: 'owner', email: 'owner@fixture.invalid', canViewFinance: true, brandScope: { kind: 'all' }, permissions: new Set(['messages:read', 'messages:write', 'roster:read', 'roster:write']) };
let scope, tables, calls, writes, failure, incomplete, fetchCalls, fetchMode, env;
function reset() {
  scope = owner; calls = []; writes = []; failure = ''; incomplete = ''; fetchCalls = []; fetchMode = 'success'; env = { DISCORD_BOT_TOKEN: 'fixture-only' };
  const own = { id: creator, tenant_id: tenant, real_name: 'Same name', discord_id: discord, discord_avatar: null };
  const other = { id: otherCreator, tenant_id: tenant, real_name: 'Same name', discord_id: null, discord_avatar: null };
  const foreignRow = { id: foreignCreator, tenant_id: foreign, real_name: 'PRIVATE FOREIGN', discord_id: discord, discord_avatar: null };
  tables = {
    brands_v2: [{ id: brand, tenant_id: tenant, slug: 'owned', name: 'Owned', is_archived: false, parent_brand_id: null }, { id: otherBrand, tenant_id: tenant, slug: 'other', name: 'Other', is_archived: false, parent_brand_id: null }, { id: foreignBrand, tenant_id: foreign, slug: 'foreign', name: 'PRIVATE FOREIGN', is_archived: false, parent_brand_id: null }],
    creators_v2: [own, other, foreignRow],
    creator_brands: [{ id: id(30), tenant_id: tenant, creator_id: creator, brand_id: brand, retainer: 10, creator: own }, { id: id(31), tenant_id: tenant, creator_id: otherCreator, brand_id: otherBrand, retainer: 20, creator: other }, { id: id(32), tenant_id: foreign, creator_id: foreignCreator, brand_id: foreignBrand, retainer: 999, creator: foreignRow }],
    managed_creators: [{ id: 101, tenant_id: tenant, creator_id: creator, brand: 'owned' }, { id: 102, tenant_id: foreign, creator_id: creator, brand: 'foreign' }],
    tiktok_accounts: [{ tenant_id: tenant, creator_id: creator, brand_id: brand, tiktok_username: 'own' }, { tenant_id: foreign, creator_id: creator, brand_id: foreignBrand, tiktok_username: 'PRIVATE' }],
    creator_contacts: [], daily_video_product_stats: [], invites: [],
    creator_messages: Array.from({ length: 105 }, (_, index) => ({ id: id(1000 + index), tenant_id: tenant, creator_uuid: index % 2 ? creator : null, creator_id: index % 2 ? null : 101, discord_user_id: discord, direction: 'inbound', content: `message-${index}`, sent_at: `2026-11-10T00:${String(Math.floor(index / 2)).padStart(2, '0')}:00.000Z`, status: 'delivered', channel: 'dm', read_at: null, topic: null })),
  };
  tables.creator_messages.push({ ...tables.creator_messages[104], id: id(2000), tenant_id: foreign, creator_uuid: foreignCreator, creator_id: 102, content: 'PRIVATE FOREIGN' });
}
function matchesOr(row, expression) {
  return expression.split(/,(?![^()]*\))/).some(part => {
    const [key, operation, ...rest] = part.split('.'); const value = rest.join('.');
    if (operation === 'eq') return String(row[key]) === value;
    if (operation === 'in') return value.slice(1, -1).split(',').includes(String(row[key]));
    throw new Error(`Unexpected filter: ${part}`);
  });
}
const db = { from(table) {
  assert.ok(table in tables, `Unexpected table ${table}`);
  const filters = [], orders = [], trace = { table, filters: [] }; let single = false, range = null, limit = null, mutation = null, payload;
  const query = {
    select(columns, options) { trace.columns = columns; trace.options = options; return query; },
    eq(key, value) { trace.filters.push(['eq', key, value]); filters.push(row => row[key] === value); return query; },
    is(key, value) { trace.filters.push(['is', key, value]); filters.push(row => row[key] === value); return query; },
    in(key, values) { trace.filters.push(['in', key, values]); filters.push(row => values.includes(row[key])); return query; },
    gte(key, value) { trace.filters.push(['gte', key, value]); filters.push(row => row[key] >= value); return query; },
    or(expression) { trace.or = expression; filters.push(row => matchesOr(row, expression)); return query; },
    order(key, options = {}) { orders.push([key, options.ascending !== false]); trace.orders = orders; return query; },
    range(from, through) { range = [from, through]; trace.range = range; return query; },
    limit(value) { limit = value; return query; },
    maybeSingle() { single = true; return query; }, single() { single = true; return query; },
    insert(value) { mutation = 'insert'; payload = value; return query; }, update(value) { mutation = 'update'; payload = value; return query; },
    then(resolve, reject) {
      calls.push(trace);
      const failed = failure === table;
      let rows = tables[table].filter(row => filters.every(filter => filter(row)));
      if (mutation) { writes.push({ table, mutation, payload, ids: rows.map(row => row.id) }); if (!failed) {
        if (mutation === 'insert') { rows = [{ ...payload, id: id(9000) }]; tables[table].push(...rows); }
        else rows.forEach(row => Object.assign(row, payload));
      } }
      rows = [...rows].sort((a, b) => { for (const [key, ascending] of orders) { const order = String(a[key]).localeCompare(String(b[key])); if (order) return ascending ? order : -order; } return 0; });
      const count = incomplete === table ? rows.length + 1000 : rows.length;
      if (range) rows = rows.slice(range[0], range[1] + 1);
      else rows = rows.slice(0, 1000); // Match the default PostgREST response cap.
      if (limit !== null) rows = rows.slice(0, limit);
      return Promise.resolve({ data: failed ? null : single ? rows[0] ?? null : rows, error: failed ? { message: 'PRIVATE DB DETAIL' } : null, count }).then(resolve, reject);
    },
  }; return query;
} };
const dependencies = {
  'next/server': { NextRequest, NextResponse },
  '@/lib/supabase/server': { createAdminClient: async () => { calls.push({ admin: true }); return db; } },
  '@/lib/auth/workspace-scope': { getWorkspaceScope: async () => scope },
};
function load(file) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, console, Date, Intl, URL, AbortSignal, process: { get env() { return env; } },
    fetch: async (url, options) => {
      fetchCalls.push({ url, body: JSON.parse(options.body) });
      if (fetchMode === 'channel-error') return { ok: false };
      if (url.endsWith('/users/@me/channels')) return { ok: true, json: async () => ({ id: discordChannel }) };
      if (fetchMode === 'timeout') throw new Error('fixture transport failure');
      if (fetchMode === 'message-error') return { ok: false };
      return { ok: true, json: async () => ({ id: discordMessage }) };
    },
    require: name => name in dependencies ? dependencies[name] : require(name),
  }); return exports;
}
dependencies['@/lib/auth/permissions'] = load('src/lib/auth/permissions.ts');
dependencies['@/lib/data/brand-registry-core'] = load('src/lib/data/brand-registry-core.ts');
dependencies['@/lib/data/creator-status'] = load('src/lib/data/creator-status.ts');
dependencies['@/lib/messages/access'] = load('src/lib/messages/access.ts');
dependencies['@/lib/messages/delivery'] = load('src/lib/messages/delivery.ts');
const history = load('src/app/api/messages/[creatorId]/route.ts');
const markRead = load('src/app/api/messages/[creatorId]/mark-read/route.ts');
const send = load('src/app/api/messages/[creatorId]/send/route.ts');
const conversations = load('src/app/api/messages/conversations/route.ts');
const context = load('src/app/api/messages/[creatorId]/context/route.ts');
const invites = load('src/app/api/invites/generate/route.ts');
const diagnostic = load('src/app/api/messages/test-dm/route.ts');
const params = value => ({ params: Promise.resolve({ creatorId: value }) });
const get = (query = '', target = creator) => history.GET(new NextRequest(`${origin}/api/messages/${target}${query ? `?${query}` : ''}`), params(target));
const post = (route, body = { content: ' Hello fixture ' }, target = creator, extra = {}) => route.POST(new NextRequest(`${origin}/api/messages/${target}`, { method: 'POST', headers: { origin, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) }), params(target));
async function response(pending, status) { const result = await pending; assert.equal(result.status, status); const body = await result.json(); assert.ok(!JSON.stringify(body).includes('PRIVATE DB DETAIL')); return body; }

for (const denied of [null, { ...owner, tenantId: '' }, { ...owner, permissions: new Set() }]) {
  reset(); scope = denied; await response(get(), denied ? 403 : 401); await response(post(send), denied ? 403 : 401);
  await response(conversations.GET(), denied ? 403 : 401); await response(context.GET(new NextRequest(origin), params(creator)), denied ? 403 : 401);
  assert.equal(calls.length, 0); assert.equal(fetchCalls.length, 0);
}
reset(); await response(get('', foreignCreator), 404); assert.ok(!calls.some(call => call.table === 'creator_messages'));
for (const page of ['0', '-1', '1oops', '1.5', '1000000']) { reset(); await response(get(`page=${page}`), 400); assert.equal(calls.length, 0); }
reset(); await response(get('discord_user_id=1%29%2Ctenant_id.eq.foreign'), 400);
reset(); const first = await response(get('page=1'), 200), second = await response(get('page=2'), 200), third = await response(get('page=3'), 200);
assert.equal(first.messages[0].content, 'message-55'); assert.equal(first.messages.at(-1).content, 'message-104');
assert.equal(second.messages[0].content, 'message-5'); assert.equal(second.messages.at(-1).content, 'message-54'); assert.equal(third.messages.length, 5);
assert.equal(first.total, 105); assert.equal(first.hasMore, true); assert.equal(third.hasMore, false);
assert.ok(calls.filter(call => call.table === 'creator_messages').every(call => call.filters.some(([, key, value]) => key === 'tenant_id' && value === tenant)));
reset(); const person = await response(get(`discord_user_id=${discord}`), 200); assert.equal(person.total, 105); assert.ok(!JSON.stringify(person).includes('PRIVATE FOREIGN'));
reset(); failure = 'creator_messages'; assert.equal((await response(get(), 503)).messages, undefined);
reset(); incomplete = 'managed_creators'; await response(get(), 503);
reset(); scope = { ...owner, role: 'manager', brandScope: { kind: 'scoped', brandIds: [brand], brandSlugs: ['owned'] } };
await response(get('', otherCreator), 403);
// The same canonical creator also works for another brand. Neither their
// other-brand legacy rows nor their global UUID/Discord DMs are in scope.
tables.creator_brands.push({ id: id(35), tenant_id: tenant, creator_id: creator, brand_id: otherBrand, creator: tables.creators_v2[0] });
tables.managed_creators.push({ id: 103, tenant_id: tenant, creator_id: creator, brand: 'other' });
tables.creator_messages.push({ ...tables.creator_messages[0], id: id(3000), creator_uuid: creator, creator_id: 103, content: 'PRIVATE OTHER BRAND' });
calls = []; const scoped = await response(get(`discord_user_id=${discord}`), 200); assert.equal(scoped.total, 53);
assert.ok(!JSON.stringify(scoped).includes('PRIVATE')); assert.equal(calls.find(call => call.table === 'creator_messages').or, 'creator_id.in.(101)');
const scopedInbox = await response(conversations.GET(), 200); assert.equal(scopedInbox.conversations[0].message_count, 53); assert.ok(!JSON.stringify(scopedInbox).includes('PRIVATE'));
await response(post(markRead, {}), 200); assert.equal(writes[0].ids.length, 53); assert.equal(tables.creator_messages.find(row => row.id === id(3000)).read_at, null); assert.equal(tables.creator_messages[1].read_at, null);
tables.managed_creators = []; await response(get(), 403);
reset(); scope = { ...owner, impersonating: { userId: id(9) } }; await response(post(markRead, {}), 403); await response(post(send), 403); assert.equal(writes.length, 0); assert.equal(fetchCalls.length, 0);
reset(); await response(post(markRead, {}), 200); assert.equal(writes[0].ids.length, 105); assert.equal(tables.creator_messages.find(row => row.tenant_id === foreign).read_at, null);

for (const setup of [() => { env = {}; }, () => { tables.creators_v2[0].discord_id = null; }, () => { failure = 'creator_contacts'; }, () => { tables.creator_contacts.push({ id: id(50), tenant_id: tenant, creator_id: creator, channel: 'discord', consent_status: 'opted_out' }); }]) {
  reset(); setup(); const result = await post(send); assert.ok(result.status >= 400); assert.equal(fetchCalls.length, 0); assert.equal(writes.length, 0);
}
for (const mode of ['channel-error', 'message-error', 'timeout']) { reset(); fetchMode = mode; const result = await post(send); assert.ok(result.status >= 400); assert.equal(writes.length, 0); if (mode === 'timeout') assert.match((await result.json()).error, /Check Discord before retrying/); }
reset(); const delivered = await response(post(send), 200); assert.equal(delivered.message.status, 'delivered'); assert.equal(writes[0].payload.creator_uuid, creator); assert.equal(writes[0].payload.tenant_id, tenant); assert.equal(Object.hasOwn(writes[0].payload, 'creator_id'), false); assert.equal(writes[0].payload.sent_by, owner.userId);
reset(); failure = 'creator_messages'; const loggedFailure = await response(post(send), 200); assert.equal(loggedFailure.message.status, 'delivered'); assert.match(loggedFailure.warning, /Do not resend/);
reset(); await response(post(send, { content: 'x'.repeat(2001) }), 400); await response(post(send, { content: 'text' }, creator, { origin: 'https://foreign.invalid' }), 403); assert.equal(fetchCalls.length, 0);
const manager = { ...owner, role: 'manager', brandScope: { kind: 'scoped', brandIds: [brand], brandSlugs: ['owned'] } };
reset(); scope = manager; await response(post(send), 200); assert.equal(writes[0].payload.creator_id, 101); assert.equal(writes[0].payload.creator_uuid, creator);
for (const mode of ['missing', 'ambiguous']) {
  reset(); scope = manager;
  if (mode === 'missing') tables.managed_creators = [];
  else tables.managed_creators.push({ id: 103, tenant_id: tenant, creator_id: creator, brand: 'owned' });
  assert.match((await response(post(send), 403)).error, /one of your brand records/); assert.equal(fetchCalls.length, 0); assert.equal(writes.length, 0);
}

const diagnose = (input = { discordUserId: discord, content: 'Fixture diagnostic' }, headers) => post(diagnostic, input, creator, headers);
for (const denied of [null, manager, { ...owner, role: 'viewer' }, { ...owner, impersonating: true }, { ...owner, permissions: new Set(['messages:read']) }]) {
  reset(); scope = denied; await response(diagnose(), denied ? 403 : 401); assert.equal(calls.length, 0); assert.equal(fetchCalls.length, 0); assert.equal(writes.length, 0);
}
reset(); await response(diagnose({ discordUserId: '444444444444444444', content: 'Fixture' }), 404); assert.equal(fetchCalls.length, 0);
reset(); tables.creators_v2[0].discord_id = null; await response(diagnose(), 404); assert.equal(fetchCalls.length, 0); // Same Discord in another tenant is not a target.
reset(); await response(diagnose({ discordUserId: {}, content: 'Fixture' }), 400); await response(diagnose(undefined, { origin: 'https://foreign.invalid' }), 403); assert.equal(fetchCalls.length, 0);
reset(); failure = 'creators_v2'; await response(diagnose(), 503); assert.equal(fetchCalls.length, 0);
reset(); failure = 'creator_contacts'; const diagnosticConsent = await response(diagnose(), 503); assert.equal(diagnosticConsent.delivered, false); assert.equal(fetchCalls.length, 0);
reset(); const diagnosticSuccess = await response(diagnose(), 200); assert.equal(diagnosticSuccess.delivered, true); assert.equal(writes[0].payload.creator_uuid, creator); assert.equal(writes[0].payload.tenant_id, tenant); assert.equal(writes[0].payload.sent_by, owner.userId);

reset(); const inbox = await response(conversations.GET(), 200); assert.equal(inbox.conversations.length, 2); assert.equal(inbox.conversations.find(row => row.creator_id === creator).message_count, 105); assert.ok(!JSON.stringify(inbox).includes('PRIVATE FOREIGN'));
for (const table of ['creator_messages', 'brands_v2']) { reset(); failure = table; await response(conversations.GET(), 503); }
reset(); failure = 'daily_video_product_stats'; const noMetrics = await response(conversations.GET(), 200);
assert.equal(noMetrics.conversations[0].message_count, 105); assert.equal(noMetrics.conversations[0].total_gmv_7d, null); assert.equal(noMetrics.conversations[0].total_videos_7d, null); assert.equal(noMetrics.conversations[0].status, 'unavailable');
reset(); scope = { ...owner, role: 'manager', brandScope: { kind: 'scoped', brandIds: [brand], brandSlugs: ['owned'] } }; assert.equal((await response(conversations.GET(), 200)).conversations.length, 1);
await response(context.GET(new NextRequest(origin), params(otherCreator)), 403); calls = [];
await response(context.GET(new NextRequest(origin), params(creator)), 200);
assert.ok(calls.filter(call => call.table).every(call => call.filters.some(([, key, value]) => key === 'tenant_id' && value === tenant)), 'all context reads are tenant-bound');
// Parent-brand assignments include their verified store data, but neither an
// unrelated brand nor another tenant's observations for the same handle.
reset(); scope = manager; tables.brands_v2[0].is_umbrella = true;
tables.brands_v2.push({ id: id(40), tenant_id: tenant, slug: 'owned-store', name: 'Owned store', is_archived: false, parent_brand_id: brand });
const today = new Date().toISOString().slice(0, 10);
tables.daily_video_product_stats = [
  { id: 1, tenant_id: tenant, brand_id: id(40), video_id: 'own-video', tiktok_username: 'own', gmv: 12, report_date: today, post_date: today },
  { id: 2, tenant_id: tenant, brand_id: otherBrand, video_id: 'private-video', tiktok_username: 'own', gmv: 500, report_date: today, post_date: today },
  { id: 3, tenant_id: foreign, brand_id: id(40), video_id: 'foreign-video', tiktok_username: 'own', gmv: 1000, report_date: today, post_date: today },
];
const storeContext = await response(context.GET(new NextRequest(origin), params(creator)), 200);
assert.equal(storeContext.creator.gmv_7d, 12); assert.equal(storeContext.creator.posts_7d, 1);
const storeInbox = await response(conversations.GET(), 200); assert.equal(storeInbox.conversations[0].total_gmv_7d, 12); assert.equal(storeInbox.conversations[0].total_videos_7d, 1);

// A child/store-only assignment remains a valid inbox roster, without
// inheriting its parent's legacy history or other roster assignments.
reset(); scope = manager; tables.brands_v2[0].parent_brand_id = id(41);
tables.brands_v2.push({ id: id(41), tenant_id: tenant, slug: 'parent', name: 'Private parent', is_archived: false, is_umbrella: true, parent_brand_id: null });
tables.creator_brands.push({ id: id(42), tenant_id: tenant, creator_id: otherCreator, brand_id: id(41), creator: tables.creators_v2[1] });
tables.managed_creators.push({ id: 104, tenant_id: tenant, creator_id: creator, brand: 'parent' });
tables.creator_messages.push({ ...tables.creator_messages[0], id: id(4001), creator_id: 104, content: 'PRIVATE PARENT HISTORY' });
const childInbox = await response(conversations.GET(), 200); assert.equal(childInbox.conversations.length, 1);
assert.equal(childInbox.conversations[0].message_count, 53); assert.equal((await response(get(), 200)).total, 53);
assert.ok(!JSON.stringify(childInbox).includes('PRIVATE')); assert.equal(childInbox.conversations[0].brand, 'owned');

// Scoped canonical profiles sharing Discord remain distinct. Inbox summaries,
// thread reads and read-state writes must name the same authorized profile.
reset(); scope = { ...manager, brandScope: { kind: 'scoped', brandIds: [brand, otherBrand], brandSlugs: ['owned', 'other'] } };
tables.creators_v2[1].discord_id = discord;
tables.managed_creators.push({ id: 104, tenant_id: tenant, creator_id: otherCreator, brand: 'other' });
tables.creator_messages.push({ ...tables.creator_messages[0], id: id(4002), creator_uuid: otherCreator, creator_id: 104, content: 'Second profile latest', sent_at: '2026-11-10T02:00:00.000Z' });
const splitInbox = await response(conversations.GET(), 200); assert.equal(splitInbox.conversations.length, 2);
assert.deepEqual(new Set(splitInbox.conversations.map(row => row.conversation_key)), new Set([`creator:${creator}`, `creator:${otherCreator}`]));
for (const conversation of splitInbox.conversations) {
  const thread = await response(get(`discord_user_id=${discord}`, conversation.creator_id), 200);
  assert.equal(thread.total, conversation.message_count); assert.equal(thread.messages.at(-1).content, conversation.last_message);
}
await response(post(markRead, {}, otherCreator), 200); assert.deepEqual(writes[0].ids, [id(4002)]); assert.equal(tables.creator_messages[0].read_at, null);
scope = owner; const mergedInbox = await response(conversations.GET(), 200); assert.equal(mergedInbox.conversations.length, 1); assert.equal(mergedInbox.conversations[0].conversation_key, discord);
assert.equal(mergedInbox.conversations[0].message_count, (await response(get(`discord_user_id=${discord}`), 200)).total);

reset();
for (let index = 0; index < 1005; index++) {
  const addedCreator = { id: id(10000 + index), tenant_id: tenant, real_name: `Creator ${index}`, discord_id: null, discord_avatar: null };
  tables.creators_v2.push(addedCreator);
  tables.creator_brands.push({ id: id(20000 + index), tenant_id: tenant, creator_id: addedCreator.id, brand_id: brand, retainer: 0, creator: addedCreator });
  tables.managed_creators.push({ id: 10000 + index, tenant_id: tenant, creator_id: addedCreator.id, brand: 'owned' });
  tables.tiktok_accounts.push({ id: id(30000 + index), tenant_id: tenant, creator_id: addedCreator.id, brand_id: brand, tiktok_username: `creator-${index}` });
}
tables.creator_messages.push({ ...tables.creator_messages[0], id: id(40000), creator_id: 11004, creator_uuid: null, content: 'Latest large-roster message' });
const largeInbox = await response(conversations.GET(), 200); assert.equal(largeInbox.conversations.length, 1007);
assert.equal(largeInbox.conversations.find(row => row.creator_id === id(11004)).last_message, 'Latest large-roster message');
for (const table of ['creator_brands', 'managed_creators', 'tiktok_accounts']) assert.ok(calls.some(call => call.table === table && call.range?.[0] === 1000), `${table} pages beyond default cap`);
scope = manager; calls = []; const largeScopedInbox = await response(conversations.GET(), 200); assert.equal(largeScopedInbox.conversations.length, 1006);
assert.ok(calls.filter(call => call.table === 'creator_messages').every(call => call.filters.some(([operation, key, values]) => operation === 'in' && key === 'creator_id' && values.length <= 250)), 'scoped messages are restricted in the database and identifiers are batched');
assert.equal(largeScopedInbox.conversations.find(row => row.creator_id === id(11004)).last_message, 'Latest large-roster message');

const invite = (body = { brand: 'owned' }, headers) => post(invites, body, creator, headers);
for (const denied of [null, { ...owner, role: 'manager' }, { ...owner, impersonating: true }, { ...owner, permissions: new Set(['roster:read']) }]) { reset(); scope = denied; await response(invite(), denied ? 403 : 401); assert.equal(writes.length, 0); }
for (const body of [{ brand: 'foreign' }, { brand: 'missing' }]) { reset(); await response(invite(body), 404); assert.equal(writes.length, 0); }
for (const body of [{ brand: 'owned', tenant_id: foreign }, { brand: 'owned', max_uses: 0 }, { brand: 'owned', max_uses: 1.5 }, { brand: 'owned', expires_days: -1 }, { brand: 'owned', expires_days: 91 }, { brand: {} }]) { reset(); await response(invite(body), 400); assert.equal(writes.length, 0); }
reset(); tables.brands_v2[0].is_archived = true; await response(invite(), 404); assert.equal(writes.length, 0);
reset(); failure = 'brands_v2'; await response(invite(), 503); assert.equal(writes.length, 0);
reset(); await response(invite({ brand: 'owned' }, { origin: 'https://foreign.invalid' }), 403); assert.equal(writes.length, 0);
reset(); const created = await response(invite({ brand: 'owned', tenant_id: tenant }), 200); assert.equal(created.invite.tenant_id, tenant); assert.equal(created.invite.brand, 'owned'); assert.equal(created.invite.code.length, 32); assert.equal(writes[0].payload.created_by, owner.email);
console.log('PASS message APIs: capability/tenant/brand guards, UUID and legacy history, newest-first stable pagination, read errors, scoped context and conversation totals');
console.log('PASS send and read status: no impersonation, consent/prerequisite failures never send, acknowledged Discord delivery only, no duplicate-send signal on log failure');
console.log('PASS shared-creator scope: brandless/other-brand history hidden, read status restricted, scoped send requires one authorized legacy row; diagnostic requires a tenant-owned creator');
console.log('PASS large rosters: identity reads page beyond 1,000 rows, scoped messages are filtered in database; unavailable metrics do not hide conversations');
console.log('PASS scoped inbox identity: child-only assignments stay visible without parent access; profiles sharing Discord retain matching list/thread/read boundaries');
console.log('PASS invite generation: owned active brands, trusted tenant/actor, impersonation/capability/origin denial, bounded inputs and masked failures');
