import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('src/lib/media/tiktok-video-cover.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const id = '7700368396864539934';
const watchUrl = `https://www.tiktok.com/@vanessafoundit/video/${id}`;
const coverUrl = 'https://p16-common-sign.tiktokcdn-us.com/cover.jpg?signature=private-to-upstream';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGxkAAAAASUVORK5CYII=', 'base64');
const html = (videoId = id, cover = coverUrl, originCover) => `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({ __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct: { id: videoId, video: { cover, originCover } } } } } })}</script>`;
const page = value => new Response(value, { headers: { 'content-type': 'text/html; charset=utf-8' } });
const image = (bytes = png, type = 'image/png', headers = {}) => new Response(bytes, { headers: { 'content-type': type, ...headers } });
function runtime(upstream) {
  const model = {};
  const calls = [];
  let clock = 1_800_000_000_000;
  class Clock extends Date { static now() { return clock; } }
  runInNewContext(source, { exports: model, URL, Uint8Array, DataView, TextDecoder, AbortSignal, Date: Clock,
    fetch: async (url, options) => { calls.push({ url, options }); return upstream(url, options); },
  });
  return { ...model, calls, advance: ms => { clock += ms; } };
}

const valid = runtime(async url => url.startsWith('https://www.tiktok.com/') ? page(html()) : image());
assert.deepEqual(JSON.parse(JSON.stringify(valid.parseTikTokVideoUrl(watchUrl))), { url: watchUrl, videoId: id });
for (const bad of ['http://www.tiktok.com/@a/video/' + id, 'https://www.tiktok.com.evil.test/@a/video/' + id,
  'https://user:password@www.tiktok.com/@a/video/' + id, watchUrl + '?next=http://127.0.0.1', watchUrl + '#fragment', 'https://www.tiktok.com/@a/video/123', 'https://127.0.0.1/@a/video/' + id]) {
  assert.equal(valid.parseTikTokVideoUrl(bad), null);
  assert.equal(await valid.getTikTokVideoCover(bad), null);
}
const [first, concurrent] = await Promise.all([valid.getTikTokVideoCover(watchUrl), valid.getTikTokVideoCover(watchUrl)]);
assert.equal(first.contentType, 'image/png');
assert.deepEqual(Buffer.from(first.bytes), png);
assert.equal(concurrent, first);
assert.equal(valid.calls.length, 2, 'Concurrent consumers must share watch/image requests');
assert.equal(await valid.getTikTokVideoCover(watchUrl), first);
assert.equal(valid.calls.length, 2, 'Success must reuse cached public image bytes');
assert.ok(valid.calls.every(({ options }) => options.credentials === 'omit' && options.redirect === 'error' && options.signal && !options.headers.Cookie && !options.headers.Authorization));
valid.advance(6 * 60 * 60 * 1000 + 1);
await valid.getTikTokVideoCover(watchUrl);
assert.equal(valid.calls.length, 4, 'Expired covers must refresh');

const wrongId = runtime(async () => page(html('7690236292919004430')));
assert.equal(await wrongId.getTikTokVideoCover(watchUrl), null);
assert.equal(wrongId.calls.length, 1, 'Another video must never supply this cover');
for (const unsafe of ['http://p16.tiktokcdn.com/cover.jpg', 'https://p16.tiktokcdn.com.evil.test/cover.jpg', 'https://127.0.0.1/cover.jpg', 'https://user:pass@p16.tiktokcdn.com/cover.jpg', 'https://p16.tiktokcdn.com:8443/cover.jpg']) {
  const blocked = runtime(async () => page(html(id, unsafe)));
  assert.equal(await blocked.getTikTokVideoCover(watchUrl), null);
  assert.equal(blocked.calls.length, 1, 'Untrusted image locations must never be fetched');
}
const fallbackUrl = 'https://p19.tiktokcdn.com/original.webp';
const fallback = runtime(async url => url === watchUrl ? page(html(id, coverUrl, fallbackUrl)) : url === coverUrl ? new Response(null, { status: 403 }) : image());
assert.ok(await fallback.getTikTokVideoCover(watchUrl));
assert.equal(fallback.calls.at(-1).url, fallbackUrl);

for (const response of [image('<svg></svg>', 'image/svg+xml'), image('<html>blocked</html>', 'image/png'), image(png, 'image/jpeg'), image(png, 'image/png', { 'content-length': String(4 * 1024 * 1024 + 1) }), image(new Uint8Array(4 * 1024 * 1024 + 1))]) {
  const invalid = runtime(async url => url === watchUrl ? page(html()) : response);
  assert.equal(await invalid.getTikTokVideoCover(watchUrl), null);
}
const hugeHtml = runtime(async () => page('x'.repeat(2 * 1024 * 1024 + 1)));
assert.equal(await hugeHtml.getTikTokVideoCover(watchUrl), null);
assert.equal(hugeHtml.calls.length, 1);
const apng = Buffer.concat([png.subarray(0, 33), Buffer.from([0,0,0,0,97,99,84,76,0,0,0,0]), png.subarray(33)]);
const animated = runtime(async url => url === watchUrl ? page(html()) : image(apng));
assert.equal(await animated.getTikTokVideoCover(watchUrl), null, 'Animated PNG must not enter the static cover cache');
const animatedWebp = Buffer.from('524946461000000057454250414e494d0400000000000000', 'hex');
const webp = runtime(async url => url === watchUrl ? page(html()) : image(animatedWebp, 'image/webp'));
assert.equal(await webp.getTikTokVideoCover(watchUrl), null, 'Animated WebP must be rejected');

let available = false;
const transient = runtime(async url => { if (!available) throw new Error('Upstream temporarily unavailable'); return url === watchUrl ? page(html()) : image(); });
assert.equal(await transient.getTikTokVideoCover(watchUrl), null);
available = true;
assert.equal(await transient.getTikTokVideoCover(watchUrl), null);
assert.equal(transient.calls.length, 1, 'Short failure cache avoids hot retry loops');
transient.advance(30_001);
assert.ok(await transient.getTikTokVideoCover(watchUrl), 'Failures must become retryable');

const many = runtime(async url => url.startsWith('https://www.tiktok.com/') ? page(html(url.split('/').at(-1))) : image());
for (let index = 0; index < 101; index++) await many.getTikTokVideoCover(`https://www.tiktok.com/@creator/video/${BigInt(id) + BigInt(index)}`);
const beforeEviction = many.calls.length;
await many.getTikTokVideoCover('https://www.tiktok.com/@creator/video/' + id);
assert.equal(many.calls.length, beforeEviction + 2, 'Entry count must remain bounded');
const largePng = new Uint8Array(4 * 1024 * 1024); largePng.set(png);
const memory = runtime(async url => url.startsWith('https://www.tiktok.com/') ? page(html(url.split('/').at(-1))) : image(largePng));
for (let index = 0; index < 6; index++) await memory.getTikTokVideoCover(`https://www.tiktok.com/@creator/video/${BigInt(id) + BigInt(index)}`);
const beforeMemoryEviction = memory.calls.length;
await memory.getTikTokVideoCover('https://www.tiktok.com/@creator/video/' + id);
assert.equal(memory.calls.length, beforeMemoryEviction + 2, 'Public image byte cache must stay within 20 MB');
console.log('PASS TikTok covers: canonical URL and matching identity, trusted CDN only, bounded static image bodies, no cookies/redirects, cache TTL/size, in-flight deduplication and transient recovery');
