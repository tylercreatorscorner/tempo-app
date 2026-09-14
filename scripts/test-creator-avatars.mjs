import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { NextResponse } from 'next/server.js';
import ts from 'typescript';
function load(path, deps, extra = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, console, Date, AbortSignal, ...extra, require: n => { assert.ok(n in deps, n); return deps[n]; } });
  return exports;
}
const id = '11111111-1111-4111-8111-111111111111';
const foreign = '22222222-2222-4222-8222-222222222222';
const discord = '123456789012345678';
const original = { tenantId: 'a', role: 'manager', permissions: new Set(['roster:read']), brandScope: { kind: 'scoped', brandIds: ['brand-a'], brandSlugs: ['alpha'] } };
let scope = original, error = false, calls = 0;
const rows = { creators_v2: [{ id, tenant_id: 'a', discord_id: discord }, { id: foreign, tenant_id: 'b', discord_id: discord }], creator_brands: [{ id: 'link', creator_id: id, brand_id: 'brand-a' }] };
function from(table) {
  const filters = []; const result = () => ({ data: error ? null : rows[table].filter(r => filters.every(f => f(r))), error });
  const q = { select: () => q, eq: (k,v) => { filters.push(r => r[k] === v); return q; }, in: (k,v) => { filters.push(r => v.includes(r[k])); return q; }, limit: () => q,
    maybeSingle: async () => ({ data: result().data?.[0] ?? null, error }), then: (a,b) => Promise.resolve(result()).then(a,b) };
  return q;
}
const supabase = { createAdminClient: async () => ({ from }) };
const auth = load('src/lib/auth/authorize-creator.ts', { 'next/server': { NextResponse }, '@/lib/supabase/server': supabase });
const permissions = load('src/lib/auth/permissions.ts', {});
const route = load('src/app/api/creators/[id]/avatar/route.ts', {
  'next/server': { NextResponse }, '@/lib/supabase/server': supabase, '@/lib/auth/workspace-scope': { getWorkspaceScope: async () => scope },
  '@/lib/auth/authorize-creator': auth, '@/lib/auth/permissions': permissions,
  '@/lib/discord/avatars': { fetchDiscordAvatars: async ids => { calls++; assert.deepEqual([...ids], [discord]); return { [discord]: `https://cdn.discordapp.com/avatars/${discord}/${'a'.repeat(32)}.png?size=128` }; } },
});
const get = (creator = id) => route.GET(null, { params: Promise.resolve({ id: creator }) });
assert.equal((await get()).status, 302);
assert.match((await get()).headers.get('cache-control'), /^private/);
const before = calls;
scope = null; assert.equal((await get()).status, 401);
scope = { ...original, permissions: new Set() }; assert.equal((await get()).status, 403);
scope = original; assert.equal((await get(foreign)).status, 404);
scope = { ...original, brandScope: { kind: 'scoped', brandIds: [] } }; assert.equal((await get()).status, 403);
scope = original; error = true; assert.equal((await get()).status, 404); error = false;
assert.equal((await get('https://example.com')).status, 404);
assert.equal(calls, before, 'Denied requests never reach Discord');
rows.creators_v2[0].discord_id = null;
rows.creators_v2[0].discord_avatar = `https://evil.example/avatars/${discord}/x.png`;
assert.equal((await get()).status, 404);
rows.creators_v2[0].discord_avatar = `https://cdn.discordapp.com/avatars/${discord}/old.png`;
assert.equal((await get()).status, 302, 'Recognized stored CDN identity can be refreshed');
let requests = 0;
const avatars = load('src/lib/discord/avatars.ts', {}, { process: { env: { DISCORD_BOT_TOKEN: 'test-only' } }, fetch: async (url, init) => {
  requests++; assert.equal(url, `https://discord.com/api/v10/users/${discord}`); assert.ok(init.signal);
  return { ok: true, status: 200, json: async () => ({ id: discord, avatar: 'b'.repeat(32) }) };
} });
await avatars.fetchDiscordAvatars(['not-an-id', discord, discord]);
await avatars.fetchDiscordAvatars([discord]);
assert.equal(requests, 1, 'Valid identities deduplicated and successful lookups cached');
console.log('PASS avatar route: real capability/tenant/brand denial, fail closed, safe stored identity, private cache, bounded Discord request and deduplication');
