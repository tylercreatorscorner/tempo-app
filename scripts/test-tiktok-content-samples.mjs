import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server.js';
import ts from 'typescript';

function load(path, deps) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Date, URL, console, crypto: { randomUUID }, setTimeout: f => f(),
    require: name => { assert.ok(name in deps, 'Unexpected import ' + name); return deps[name]; } });
  return exports;
}
const plain = v => JSON.parse(JSON.stringify(v));
const core = load('src/lib/tiktok/ingest-core.ts', {});
const samples = load('src/lib/tiktok/samples.ts', { './ingest-core': core });
const collect = async gen => { const all = []; for await (const p of gen) all.push(...p.rows); return all; };
assert.equal(core.validReportDate('2026-02-30'), false);
assert.equal(core.validReportDate('2026-07-24'), true);
assert.equal(core.explicitInstant('2026-07-24 23:59:00'), null);
assert.equal(core.explicitInstant('2026-07-24T23:59:00-08:00'), '2026-07-25T07:59:00.000Z');
assert.equal(core.number(null), null); assert.equal(core.number(false), null);
const video = core.listedVideo({ id: '1', creator: { open_id: 'stable', user_name: 'Creator' }, gmv: { amount: '0' } });
assert.equal(video.creatorOpenId, 'stable');
assert.equal(video.gmv, 0);
assert.equal(core.detailTargets([video], 1).length, 1);
assert.throws(() => core.listedVideo({ id: 7666309225525628173 }), /ID/);
const calls = [];
const got = await collect(core.pages(async token => {
  calls.push(token);
  return token ? { videos: [{ id: '2' }], total_count: 2 } : { videos: [{ id: '1' }], total_count: 2, next_page_token: 'next' };
}, 'videos'));
assert.equal(got.length, 2); assert.deepEqual(calls, [null, 'next']);
await assert.rejects(() => collect(core.pages(async () => ({ videos: [], next_page_token: 'repeat' }), 'videos')), /Repeated/);
await assert.rejects(() => collect(core.pages(async () => ({ videos: [], next_page_token: 'next' }), 'videos', 1)), /Page limit/);
await assert.rejects(() => collect(core.pages(async () => ({ wrong: [] }), 'videos')), /Missing videos/);
await assert.rejects(() => collect(core.pages(async () => ({ videos: [], total_count: 5 }), 'videos')), /Incomplete/);
console.log('PASS short-page continuation, repeated tokens, caps, missing containers, counts, dates and stable IDs');

let sampleResponse = { sample_applications: [{ id: '123', status: 'PENDING',
  creator: { username: 'creator', creator_open_id: 'stable', gmv: { amount: '999' } },
  product: { id: 'product', title: 'Product' }, commission_rate: '0.30' }], total_count: 1 };
const requests = [];
const client = { post: async (path, options) => { requests.push({ path, options }); return { data: sampleResponse }; } };
const samplePage = await samples.searchSampleApplications(client, { status: 'PENDING' });
assert.equal(samplePage.applications[0].commissionRate, 0.3);
assert.equal(samplePage.applications[0].trackingNumber, null);
assert.equal('gmv' in samplePage.applications[0], false);
assert.equal(requests[0].options.query.page_size, '50');
assert.equal(requests[0].options.idempotent, true);
await assert.rejects(() => samples.searchSampleApplications(client, { status: 'APPROVE' }), /Invalid/);
sampleResponse = { fulfillments: [{ content: { id: 'zero-sale', view_count: 0, like_count: 0, paid_order_count: 0 } }] };
const fulfillment = await samples.sampleFulfillments(client, '123', 'VIDEO');
assert.equal(fulfillment.length, 1); assert.equal(fulfillment[0].likes, 0); assert.equal(fulfillment[0].comments, null);
assert.match(requests.at(-1).path, /202409\/sample_applications\/123\/fulfillments\/search$/);
sampleResponse = {};
await assert.rejects(() => samples.searchSampleApplications(client), /Missing/);
console.log('PASS actual sample schema, fractional commission, zero-sale fulfillment, no GMV leakage and read-only paths');

let captured = [], failWrite = false, missingInterval = false, duplicate = false, touched = 0;
const db = { from: table => {
  assert.ok(table.startsWith('api_shadow_'), 'Unexpected fact-table write: ' + table);
  const query = { insert: data => { captured.push({ table, kind: 'insert', data }); return Promise.resolve({ error: null }); },
    upsert: data => { captured.push({ table, kind: 'upsert', data }); return Promise.resolve({ error: failWrite ? { message: 'write failure' } : null }); },
    update: data => { captured.push({ table, kind: 'update', data }); return query; },
    eq: () => Promise.resolve({ error: null }) };
  return query;
} };
const vendor = {
  post: async () => ({ data: { open_collaborations: [] } }),
  get: async (path, query) => {
    if (path.includes('shop_products')) return { data: { products: [], total_count: 0 } };
    if (path.endsWith('shop_videos/performance')) {
      assert.match(path, /202605/);
      return { data: query.page_token ? { videos: [{ id: duplicate ? '1' : '2', username: 'creator', video_post_time: '2026-07-24 23:00:00' }], total_count: 2 }
        : { videos: [{ id: '1', creator: { user_name: 'creator', open_id: 'stable' }, gmv: { amount: '0' }, views: 0 }], total_count: 2, next_page_token: 'next' } };
    }
    assert.match(path, /202509\/shop_videos\/\d+\/performance$/);
    return { data: { performance: { intervals: missingInterval ? [] : [{ traffic: { views: 0, likes: 0 }, sales: { overall: { gmv: { amount: '0' }, items_sold: 0 } } }] } } };
  },
};
const ingest = load('src/lib/tiktok/shadow-ingest.ts', {
  '@/lib/supabase/server': { createAdminClient: async () => db },
  './connections': { getActiveConnection: async () => ({ ok: true, client: vendor, connectionId: 'connection', brandSlug: 'fixture' }), touchApiCall: async () => { touched++; } },
  './client': { TikTokError: class extends Error {} }, './ingest-core': core,
});
let result = await ingest.runShadowIngest('fixture', '2026-07-24', 0);
assert.equal(result.status, 'partial'); assert.equal(result.inventoryComplete, true); assert.equal(result.videosListed, 2);
let inventory = captured.filter(x => x.table === 'api_shadow_content_inventory').flatMap(x => x.data);
assert.equal(inventory.length, 2); assert.equal(inventory[0].seller_video_gmv, 0);
assert.equal(inventory[1].seller_video_gmv, null); assert.equal(inventory[1].post_time_zone, null);
assert.equal(inventory[0].affiliate_video_gmv, null);
captured = [];
result = await ingest.runShadowIngest('fixture', '2026-07-24', 2);
assert.equal(result.status, 'ok'); assert.equal(result.videosDetailed, 2);
const detail = captured.filter(x => x.table === 'api_shadow_video_performance').flatMap(x => x.data);
assert.equal(detail.length, 2); assert.equal(detail[0].likes, 0); assert.equal(detail[0].comments, null);
assert.equal(detail[1].post_date, null); assert.equal(detail[1].post_time_raw, '2026-07-24 23:00:00');
assert.equal(detail[0].gmv, null); assert.equal(detail[0].seller_video_gmv, 0);
const creator = captured.find(x => x.table === 'api_shadow_creator_performance').data[0];
assert.equal(creator.comments, null); assert.equal(creator.customers, null); assert.equal(creator.video_gmv, null);
missingInterval = true; result = await ingest.runShadowIngest('fixture', '2026-07-24', 2);
assert.equal(result.status, 'partial'); missingInterval = false;
duplicate = true; result = await ingest.runShadowIngest('fixture', '2026-07-24', 0);
assert.equal(result.status, 'failed'); assert.equal(result.inventoryComplete, false); duplicate = false;
failWrite = true; result = await ingest.runShadowIngest('fixture', '2026-07-24', 0);
assert.equal(result.status, 'failed'); assert.equal(result.inventoryComplete, false); failWrite = false;
assert.ok(touched > 0);
console.log('PASS ingest persists all zero-sale posts, preserves nulls, separates GMV and exposes incomplete/failed runs');

let scope = { role: 'owner', tenantId: 'tenant-a' }, brandTenant = 'tenant-a', connections = 0;
const api = load('src/app/api/tiktok/samples/route.ts', {
  'next/server': { NextResponse },
  '@/lib/auth/workspace-scope': { getWorkspaceScope: async () => scope },
  '@/lib/supabase/server': { createAdminClient: async () => ({ from: () => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { tenant_id: brandTenant, is_umbrella: false }, error: null }) };
    return q;
  } }) },
  '@/lib/tiktok/connections': { getActiveConnection: async () => { connections++; return { ok: true, client }; } },
  '@/lib/tiktok/samples': samples,
});
const request = query => new NextRequest('https://tempo.test/api/tiktok/samples?' + query);
for (const denied of [null, { role: 'viewer', tenantId: 'tenant-a' }, { role: 'manager', tenantId: 'tenant-a' },
  { role: 'owner', tenantId: 'tenant-a', impersonating: { userId: 'x' } }]) {
  scope = denied; assert.equal((await api.GET(request('brand=fixture'))).status, 403);
}
assert.equal(connections, 0);
scope = { role: 'admin', tenantId: 'tenant-a' }; brandTenant = 'tenant-b';
assert.equal((await api.GET(request('brand=other'))).status, 404); assert.equal(connections, 0);
brandTenant = 'tenant-a';
assert.equal((await api.GET(request('brand=fixture&applicationId=../foo'))).status, 400);
sampleResponse = { sample_applications: [], total_count: 0 };
const res = await api.GET(request('brand=fixture'));
assert.equal(res.status, 200); assert.equal(res.headers.get('cache-control'), 'private, no-store');
assert.deepEqual(plain(await res.json()), { applications: [], totalCount: 0, nextPageToken: null });
console.log('PASS unauthenticated, wrong-role, impersonation and cross-tenant requests cannot reach the seller token');
