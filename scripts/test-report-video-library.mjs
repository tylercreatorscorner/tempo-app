import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { NextRequest, NextResponse } from 'next/server.js';
import ts from 'typescript';

const tenant = 'tenant-a';
const start = '2026-09-01', end = '2026-09-30';
const videoId = '7496167504848455902', secondId = '7496167504848455903';
const item = (extra = {}) => ({ videoId, creatorHandle: 'primary', qualifyingHandles: ['primary', 'alias'], publishedAt: '2026-09-10', watchUrl: `https://www.tiktok.com/@primary/video/${videoId}`, title: 'First video', ...extra });
const packet = (videos = [item()], extra = {}) => ({ v: 1, capturedAt: '2026-10-01T12:00:00.000Z', periodStart: start, periodEnd: end, scope: 'managed-published', total: videos.length, videos, ...extra });
const creators = () => [{ creatorId: 'person-1', name: 'Creator One', realName: 'Creator One', handle: '@Primary', handles: ['primary', '@ALIAS'], retainer: 300, phone: 'private-phone' }, { creatorId: 'person-2', name: 'Creator Two', handle: 'other', handles: ['other'] }];
const report = (extra = {}) => ({ brandSlug: 'alpha', startDate: start, endDate: end, creatorsCorner: { videos: 9 }, granular: { creators: creators() }, ...extra });
const row = (token, extra = {}) => ({ token, tenant_id: tenant, brand_slug: 'alpha', brand_name: 'Alpha', period_start: start, period_end: end, period_label: 'September 2026', snapshot: { v: 1, report: report() }, revoked_at: null, ...extra });
const rows = [row('legacy-token'), row('frozen-token', { snapshot: { v: 1, report: report(), publishedVideoEvidence: packet() } }), row('revoked-token', { revoked_at: '2026-10-02', snapshot: { report: report(), publishedVideoEvidence: packet() } })];
const brandRows = [
  { id: 'alpha-id', tenant_id: tenant, slug: 'alpha', name: 'Alpha', is_umbrella: false, parent_brand_id: null },
  { id: 'umbrella-id', tenant_id: tenant, slug: 'umbrella', name: 'Umbrella', is_umbrella: true, parent_brand_id: null },
  { id: 'child-id', tenant_id: tenant, slug: 'child', name: 'Child', is_umbrella: false, parent_brand_id: 'umbrella-id' },
  { id: 'child-two-id', tenant_id: tenant, slug: 'child-two', name: 'Child Two', is_umbrella: false, parent_brand_id: 'umbrella-id' },
  { id: 'foreign-id', tenant_id: 'tenant-b', slug: 'alpha', name: 'Foreign', is_umbrella: false, parent_brand_id: null },
];
let tableReads = [], rpcCalls = [], clientCreations = 0;
let reportError = null, registryError = null, sourceError = null, sourceEvidence = packet();
const snapshotBefore = JSON.stringify(rows);
const clone = value => structuredClone(value);
const db = {
  from(table) {
    assert.ok(['client_reports', 'brands_v2'].includes(table), `Current roster or unrelated source reads are forbidden: ${table}`);
    const filters = [];
    const query = { select: () => query, eq: (key, value) => { filters.push([key, value]); return query; }, maybeSingle: () => Promise.resolve(run(true)), then: (yes, no) => Promise.resolve(run(false)).then(yes, no) };
    function run(single) {
      tableReads.push({ table, filters: clone(filters) });
      const data = (table === 'client_reports' ? rows : brandRows).filter(value => filters.every(([key, expected]) => value[key] === expected));
      return { data: clone(single ? data[0] ?? null : data), count: data.length, error: table === 'client_reports' ? reportError : registryError };
    }
    return query;
  },
  rpc(name, args) {
    assert.equal(name, 'get_report_published_video_evidence_workspace');
    rpcCalls.push({ name, args: clone(args) });
    return { abortSignal: async () => ({ data: clone(sourceEvidence), error: sourceError }) };
  },
};
const deps = { 'server-only': {}, 'next/server': { NextRequest, NextResponse }, '@/lib/supabase/server': { createAdminClient: async () => { clientCreations++; return db; } } };
function load(file) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, console, Date, URL, Error, Set, Map, AbortSignal, require: name => { assert.ok(name in deps, `Unexpected import ${name}`); return deps[name]; } });
  return exports;
}
deps['./brand-registry-core'] = load('src/lib/data/brand-registry-core.ts');
const types = deps['./published-video-evidence-types'] = deps['@/lib/data/published-video-evidence-types'] = load('src/lib/data/published-video-evidence-types.ts');
const evidence = deps['./published-video-evidence'] = load('src/lib/data/published-video-evidence.ts');
const reader = deps['@/lib/data/client-report-videos'] = load('src/lib/data/client-report-videos.ts');
const csvRoute = load('src/app/api/report-videos/[token]/route.ts');
const csv = async (token, search = '') => csvRoute.GET(new NextRequest(`https://fixture.invalid/api/report-videos/${token}${search}`), { params: Promise.resolve({ token }) });
const reset = () => { tableReads = []; rpcCalls = []; };

assert.equal(types.normalizeReportVideoHandle(' @@Primary '), 'primary');
assert.equal(types.normalizeReportVideoHandle('invalid handle'), '');
assert.equal(types.reportVideoCreatorKey({ creatorId: 'person-1', handle: 'alias' }), 'id:person-1');
assert.equal(types.reportVideoCreatorKey({ handles: ['@@ALIAS'] }), 'handle:alias');
const beforeInvalid = clientCreations;
for (const token of ['', 'short', 'bad/token', 'x'.repeat(201)]) assert.equal(await reader.getClientReportVideoLibrary(token), null);
assert.equal(clientCreations, beforeInvalid, 'Malformed tokens never query the service client');
reset();
for (const token of ['unknown-token', 'revoked-token']) {
  assert.equal(await reader.getClientReportVideoLibrary(token), null);
  const response = await csv(token); assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
}
assert.equal(rpcCalls.length, 0, 'Unknown/revoked links cannot trigger source evidence reads');

reset();
let library = await reader.getClientReportVideoLibrary('frozen-token');
assert.equal(library.basis, 'frozen'); assert.equal(library.evidence.total, 1); assert.equal(library.reportCount, 9, 'The original reported number is preserved when evidence differs');
assert.equal(rpcCalls.length, 0); assert.deepEqual(tableReads.map(read => read.table), ['client_reports']);
const publicShape = JSON.stringify(library);
assert.ok(!publicShape.includes('private-phone')); assert.ok(!publicShape.includes('retainer'));
const frozen = rows[1];
frozen.snapshot.publishedVideoEvidence.videos[0].privateContact = 'secret-contact';
frozen.snapshot.publishedVideoEvidence.videos[0].watchUrl = 'javascript:alert(1)';
library = await reader.getClientReportVideoLibrary('frozen-token');
assert.ok(!JSON.stringify(library).includes('secret-contact'));
assert.equal(library.evidence.videos[0].watchUrl, `https://www.tiktok.com/@primary/video/${videoId}`, 'Unsafe links become safe identity URLs');
assert.equal(rpcCalls.length, 0);

// Malformed cohort metadata cannot invent aliases or break valid frozen evidence.
const healthyCreators = clone(frozen.snapshot.report.granular.creators);
frozen.snapshot.report.granular.creators = [null, { creatorId: 4, name: {}, handle: {}, handles: 'invented-alias' }];
frozen.snapshot.report.reportingExclusions = { handles: 'bad-array', creatorIds: null };
assert.equal((await reader.getClientReportVideoLibrary('frozen-token')).basis, 'frozen');
assert.equal(rpcCalls.length, 0);
frozen.snapshot.report.granular.creators = healthyCreators; delete frozen.snapshot.report.reportingExclusions;

for (const damaged of [null, packet([], { total: 1 }), packet([item(), item()]), packet([item({ publishedAt: '2026-10-01' })]), packet([item()], { periodStart: '2026-08-01' })]) {
  frozen.snapshot.publishedVideoEvidence = damaged; reset();
  library = await reader.getClientReportVideoLibrary('frozen-token');
  assert.equal(library.basis, 'unavailable'); assert.equal(library.evidence, null);
  assert.equal(rpcCalls.length, 0, 'A damaged saved packet must never be silently replaced from live records');
}
frozen.snapshot.publishedVideoEvidence = packet();

reset(); sourceEvidence = packet([item(), item({ videoId: secondId, creatorHandle: 'other', qualifyingHandles: ['other'], title: 'Second video', watchUrl: null })]);
library = await reader.getClientReportVideoLibrary('legacy-token');
assert.equal(library.basis, 'reconstructed'); assert.equal(library.reportCount, 9); assert.equal(library.evidence.total, 2);
assert.deepEqual(rpcCalls[0].args.p_roster_slugs, []);
assert.deepEqual(rpcCalls[0].args.p_data_slugs, ['alpha']);
assert.deepEqual(rpcCalls[0].args.p_frozen_handles, ['primary', 'alias', 'other']);
assert.equal(rpcCalls[0].args.p_tenant_id, tenant); assert.equal(rpcCalls[0].args.p_start, start); assert.equal(rpcCalls[0].args.p_end, end);
assert.ok(tableReads.find(read => read.table === 'brands_v2').filters.some(([key, value]) => key === 'tenant_id' && value === tenant));
assert.deepEqual(types.filterReportVideos(library, { creator: 'id:person-1' }).map(video => video.videoId), [videoId]);
assert.equal(types.filterReportVideos(library, { creator: 'unrecognized' }).length, 0);
assert.equal(types.filterReportVideos(library, { q: '@ALIAS' }).length, 1);
assert.equal(types.filterReportVideos(library, { q: 'second video' }).length, 1);
assert.equal(types.filterReportVideos(library, { q: 'does not exist' }).length, 0);

const legacy = rows[0];
legacy.snapshot.report.reportingExclusions = { handles: ['@ALIAS'], creatorIds: ['person-2'] };
sourceEvidence = packet([]); reset();
library = await reader.getClientReportVideoLibrary('legacy-token');
assert.equal(library.creators.length, 0);
assert.equal(rpcCalls.length, 0, 'Excluded people cannot select fresh source accounts');
delete legacy.snapshot.report.reportingExclusions;

legacy.snapshot.report.granular.creators[0].handles = 'alias';
sourceEvidence = packet(); reset();
library = await reader.getClientReportVideoLibrary('legacy-token');
if (rpcCalls.length) assert.deepEqual(rpcCalls[0].args.p_frozen_handles, ['primary', 'other'], 'A malformed string handle collection must not spread into invented one-character aliases');
else assert.equal(library.basis, 'unavailable', 'A damaged old cohort may be held instead of broadening its aliases');
legacy.snapshot.report.granular.creators = creators();

sourceEvidence = packet([item({ creatorHandle: 'outsider', qualifyingHandles: ['outsider'] })]); reset();
library = await reader.getClientReportVideoLibrary('legacy-token');
assert.equal(library.basis, 'unavailable'); assert.equal(library.evidence, null, 'An RPC packet outside the frozen cohort fails closed');
sourceEvidence = packet();
for (const variant of [{ tenant_id: null }, { brand_slug: 'all' }, { brand_slug: 'not-in-registry' }]) {
  const old = { tenant_id: legacy.tenant_id, brand_slug: legacy.brand_slug }; Object.assign(legacy, variant); reset();
  library = await reader.getClientReportVideoLibrary('legacy-token');
  assert.equal(library.basis, 'unavailable'); assert.equal(rpcCalls.length, 0);
  Object.assign(legacy, old);
}
const savedGranular = legacy.snapshot.report.granular;
legacy.snapshot.report.granular = undefined; reset();
assert.equal((await reader.getClientReportVideoLibrary('legacy-token')).basis, 'unavailable'); assert.equal(rpcCalls.length, 0);
legacy.snapshot.report.granular = savedGranular;

legacy.brand_slug = 'umbrella'; sourceEvidence = packet([]); reset();
library = await reader.getClientReportVideoLibrary('legacy-token');
assert.equal(library.basis, 'reconstructed'); assert.deepEqual(rpcCalls[0].args.p_data_slugs, ['child', 'child-two']);
legacy.brand_slug = 'child'; reset();
await reader.getClientReportVideoLibrary('legacy-token'); assert.deepEqual(rpcCalls[0].args.p_data_slugs, ['child']);
legacy.brand_slug = 'alpha';

for (const failure of [null, { bad: 'shape' }, packet([item()], { periodEnd: '2026-09-29' })]) {
  sourceEvidence = failure;
  assert.equal((await reader.getClientReportVideoLibrary('legacy-token')).basis, 'unavailable');
}
sourceError = { message: 'Secret source response includes private data' }; sourceEvidence = packet();
library = await reader.getClientReportVideoLibrary('legacy-token');
assert.equal(library.basis, 'unavailable'); assert.ok(!JSON.stringify(library).includes('Secret source'));
sourceError = null;
registryError = { message: 'private registry details' }; reset();
assert.equal((await reader.getClientReportVideoLibrary('legacy-token')).basis, 'unavailable'); assert.equal(rpcCalls.length, 0);
registryError = null;

// CSV uses the exact shared filter and protects text identities and formula-like captions.
frozen.snapshot.publishedVideoEvidence = packet([item({ title: '  =SUM(1,2)\n"caption"  ' }), item({ videoId: secondId, creatorHandle: 'other', qualifyingHandles: ['other'], title: '+Another formula', watchUrl: null })]);
let response = await csv('frozen-token');
assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
assert.equal(response.headers.get('referrer-policy'), 'no-referrer'); assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
let text = await response.text();
assert.ok(text.includes(`'${videoId},'@primary`), 'Video IDs and handles are text-safe in spreadsheets');
assert.ok(text.includes('"\'=SUM(1,2)\n""caption"""'));
assert.ok(text.includes("'+Another formula"));
assert.ok(text.includes('Saved with report')); assert.ok(!text.includes('Secret source'));
text = await (await csv('frozen-token', '?creator=id%3Aperson-1&q=%40ALIAS&brand=foreign&start=1900-01-01')).text();
assert.ok(text.includes(videoId)); assert.ok(!text.includes(secondId));
text = await (await csv('frozen-token', '?creator=unknown')).text();
assert.equal(text.trim().split('\r\n').length, 1, 'Unknown creator filters yield only the header, never every video');
sourceEvidence = packet([item()]);
text = await (await csv('legacy-token')).text(); assert.ok(text.includes('Reconstructed from current records'));
sourceError = { message: 'private upstream error' };
response = await csv('legacy-token'); assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('private upstream error'));
sourceError = null; reportError = { message: 'private database error' };
response = await csv('frozen-token'); assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('private database error'));
reportError = null;

// Reads only cloned data, and never expose update/insert methods or mutate sent snapshots.
frozen.snapshot.publishedVideoEvidence = packet();
delete frozen.snapshot.publishedVideoEvidence.videos[0].privateContact;
assert.equal(JSON.stringify(rows), snapshotBefore);
assert.equal(evidence.parsePublishedVideoEvidence(packet([item({ creatorHandle: '', qualifyingHandles: [''], watchUrl: 'https://evil.invalid/private' })])).videos[0].watchUrl, null, 'Unknown source identity preserves the counted item without exposing an unsafe link');
console.log('PASS report video library: revoked tokens, frozen/no-source reads, legacy tenant/brand/date/cohort scope, exclusions, malformed metadata, safe links/CSV/filtering, source failures and immutable sent snapshots');
