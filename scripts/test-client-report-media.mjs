import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const token = 'saved-report-token';
const videoId = '7700368396864539934';
const otherId = '7700368396864539935';
const url = `https://www.tiktok.com/@creator/video/${videoId}`;
let adminCalls = 0, coverCalls = 0, databaseError = false, providerError = false;
let cover = { bytes: new Uint8Array([255, 216, 255, 217]), contentType: 'image/jpeg' };
let reads = [];
const record = {
  token, revoked_at: null, period_start: '2026-10-01', period_end: '2026-10-31',
  top_videos: [{ videoUrl: `https://tiktok.com/@creator/video/${videoId}` }],
  managed_top_videos: [], published_evidence: undefined,
};
const packet = (extra = {}) => ({
  v: 1, capturedAt: '2026-11-01T12:00:00.000Z', periodStart: '2026-10-01', periodEnd: '2026-10-31',
  scope: 'managed-published', total: 1,
  videos: [{ videoId, creatorHandle: 'creator', qualifyingHandles: ['creator'], publishedAt: '2026-10-15', watchUrl: url, title: 'Saved video' }],
  ...extra,
});
const db = {
  from(table) {
    assert.equal(table, 'client_reports', 'Only the frozen report may select media access');
    const read = { table, filters: [] };
    const query = {
      select(columns) {
        read.columns = columns;
        assert.equal(columns, 'revoked_at,period_start,period_end,top_videos:snapshot->report->topVideos,managed_top_videos:snapshot->report->creatorsCorner->topVideos,published_evidence:snapshot->publishedVideoEvidence');
        return query;
      },
      eq(key, value) { read.filters.push([key, value]); return query; },
      is(key, value) { read.filters.push([key, value]); return query; },
      abortSignal(signal) {
        assert.ok(signal instanceof AbortSignal);
        return query;
      },
      async maybeSingle() {
        reads.push(read);
        return { data: read.filters.every(([key, expected]) => record[key] === expected) ? structuredClone(record) : null,
          error: databaseError ? { message: 'PRIVATE DATABASE ERROR' } : null };
      },
    };
    return query;
  },
};
const deps = {
  'server-only': {},
  '@/lib/supabase/server': { createAdminClient: async () => { adminCalls++; return db; } },
};
function load(file) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, Response, Request, URL, Uint8Array, AbortSignal, TextDecoder, DataView, Date, Map, Set,
    console, require: name => { assert.ok(name in deps, `Unexpected import: ${name}`); return deps[name]; },
  });
  return exports;
}
const publicMedia = load('src/lib/media/tiktok-video-cover.ts');
deps['@/lib/media/tiktok-video-cover'] = {
  parseTikTokVideoUrl: publicMedia.parseTikTokVideoUrl,
  getTikTokVideoCover: async input => {
    coverCalls++;
    assert.equal(input, url, 'Only the authorized canonical identity reaches the validated public cover resolver');
    if (providerError) throw new Error('PRIVATE PROVIDER ERROR');
    return cover;
  },
};
deps['./published-video-evidence'] = load('src/lib/data/published-video-evidence.ts');
const reader = deps['@/lib/data/client-report-media'] = load('src/lib/data/client-report-media.ts');
const route = load('src/app/api/report-media/[token]/route.ts');
const get = (input = url, reportToken = token) => route.GET(
  new Request(`https://tempo.test/api/report-media/${reportToken}?${new URLSearchParams({ url: input })}`),
  { params: Promise.resolve({ token: reportToken }) },
);
const denied = async (status, input = url, reportToken = token) => {
  const before = coverCalls;
  const response = await get(input, reportToken);
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(await response.text(), '');
  assert.equal(coverCalls, before, 'Unauthorized media never reaches the network/cache resolver');
};

for (const invalid of ['', 'short', 'bad/token', 'x'.repeat(201)]) {
  assert.equal(await reader.getClientReportMediaUrl(invalid, url), null);
  await denied(404, url, invalid);
}
for (const invalid of [
  'http://www.tiktok.com/@creator/video/' + videoId,
  `https://tiktok.com/@creator/video/${videoId}`,
  `https://m.tiktok.com/@creator/video/${videoId}`,
  `https://www.tiktok.com/@creator/video/${videoId}/`,
  `https://www.tiktok.com/@creator/video/${videoId}?redirect=http://127.0.0.1`,
  `https://www.tiktok.com/@creator/video/${videoId}#fragment`,
  `https://www.tiktok.com:444/@creator/video/${videoId}`,
  `https://secret@www.tiktok.com/@creator/video/${videoId}`,
  `https://www.tiktok.com.evil.invalid/@creator/video/${videoId}`,
  'https://127.0.0.1/private',
  'file:///private',
]) {
  assert.equal(await reader.getClientReportMediaUrl(token, invalid), null);
  await denied(400, invalid);
}
assert.equal(adminCalls, 0, 'Malformed requests are rejected before privileged reads');
await denied(404, url, 'unknown-token');
await denied(404, `https://www.tiktok.com/@creator/video/${otherId}`);
await denied(404, `https://www.tiktok.com/@different/video/${videoId}`);

let response = await get();
assert.equal(response.status, 200);
assert.equal(response.headers.get('content-type'), 'image/jpeg');
assert.equal(response.headers.get('content-length'), '4');
assert.equal(response.headers.get('cache-control'), 'private, no-store', 'Browsers and CDNs must recheck revocation for every cover request');
assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
assert.deepEqual(new Uint8Array(await response.arrayBuffer()), cover.bytes);
assert.ok(reads.every(read => read.filters.some(([key, value]) => key === 'token' && value === token)
  || read.filters.some(([key, value]) => key === 'token' && value === 'unknown-token')));
assert.ok(reads.every(read => read.filters.some(([key, value]) => key === 'revoked_at' && value === null)));

record.revoked_at = '2026-11-02T12:00:00Z';
await denied(404);
record.revoked_at = null;
record.top_videos = [];
record.managed_top_videos = [{ videoUrl: url }];
assert.equal((await get()).status, 200, 'Managed top videos are also frozen visible report content');
record.managed_top_videos = [];

record.published_evidence = packet();
assert.equal((await get()).status, 200, 'Validated frozen publication evidence authorizes its saved identity');
for (const invalid of [null, { ...packet(), total: 2 }, packet({ periodStart: '2026-09-01' }), packet({ periodEnd: '2026-10-30' })]) {
  record.published_evidence = invalid;
  await denied(404);
}
record.published_evidence = packet();
record.published_evidence.videos[0].watchUrl = `https://www.tiktok.com/@different/video/${videoId}`;
await denied(404, `https://www.tiktok.com/@different/video/${videoId}`);
await denied(404);
record.published_evidence = undefined;
for (const invalid of [
  `https://www.tiktok.com.evil.invalid/@creator/video/${videoId}`,
  `https://credential@www.tiktok.com/@creator/video/${videoId}`,
  `https://www.tiktok.com/@different/video/${videoId}`,
  `https://www.tiktok.com/@creator/video/${otherId}`,
  `https://www.tiktok.com/@creator/video/${videoId}?tracking=1`,
]) {
  record.top_videos = [{ videoUrl: invalid }];
  await denied(404);
}
record.top_videos = [{ videoUrl: `https://m.tiktok.com/@CREATOR/video/${videoId}` }];
assert.equal((await get()).status, 200, 'Historical saved host/case normalization keeps both handle and ID');

databaseError = true;
await denied(503);
databaseError = false;
cover = null;
response = await get();
assert.equal(response.status, 404);
assert.equal(response.headers.get('cache-control'), 'private, no-store');
providerError = true;
response = await get();
assert.equal(response.status, 503);
assert.equal(await response.text(), '', 'Provider and token details are never exposed');
assert.equal(response.headers.get('cache-control'), 'private, no-store');
console.log('PASS report media: canonical request validation, frozen handle+ID authorization, managed top content, validated evidence, revoked/unknown links, narrow read-only projection, no-store bytes and failure privacy');
