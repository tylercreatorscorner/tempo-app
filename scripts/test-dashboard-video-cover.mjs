import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const url = 'https://www.tiktok.com/@creator/video/7700368396864539934';
let scope = null;
let allowed = true;
let rosterOnly = false;
let calls = 0;
let cover = { bytes: new Uint8Array([255, 216, 255]), contentType: 'image/jpeg' };
const routeModule = { exports: {} };
runInNewContext(ts.transpileModule(readFileSync('src/app/api/dashboard/video-cover/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: routeModule, exports: routeModule.exports, Response, URL, Uint8Array, console,
  require(name) {
    if (name.includes('workspace-scope')) return { getWorkspaceScope: async () => scope };
    if (name.includes('permissions')) return { can: (_scope, screen, action) => { assert.ok(['dashboard','roster'].includes(screen)); assert.equal(action, 'read'); return allowed && screen === (rosterOnly?'roster':'dashboard'); } };
    if (name.includes('tiktok-video-cover')) return {
      parseTikTokVideoUrl: input => input === url ? { url, videoId: '7700368396864539934' } : null,
      getTikTokVideoCover: async input => { calls++; assert.equal(input, url); return cover; },
    };
    throw new Error(`Unexpected import ${name}`);
  },
});
const { GET } = routeModule.exports;
const request = input => new Request(`https://tempo.test/api/dashboard/video-cover?${new URLSearchParams({ url: input })}`);
assert.equal((await GET(request(url))).status, 401);
scope = { userId: 'operator', brandScope: { kind: 'all' } };
allowed = false;
assert.equal((await GET(request(url))).status, 403);
allowed = true;
scope.brandScope = { kind: 'scoped', brandIds: [], brandSlugs: [] };
assert.equal((await GET(request(url))).status, 403);
scope.brandScope = { kind: 'scoped', brandIds: ['brand'], brandSlugs: ['jiyu'] };
assert.equal((await GET(request('https://127.0.0.1/private'))).status, 400);
assert.equal(calls, 0, 'Denied or malformed requests cannot resolve remote images');
const ok = await GET(request(url));
assert.equal(ok.status, 200);
assert.equal(ok.headers.get('Content-Type'), 'image/jpeg');
assert.equal(ok.headers.get('Cache-Control'), 'private, max-age=3600');
assert.equal(ok.headers.get('X-Content-Type-Options'), 'nosniff');
assert.deepEqual(new Uint8Array(await ok.arrayBuffer()), cover.bytes);
rosterOnly = true;
assert.equal((await GET(request(url))).status, 200, 'Roster readers can view public covers without dashboard access');
rosterOnly = false;
cover = null;
const missing = await GET(request(url));
assert.equal(missing.status, 404);
assert.equal(missing.headers.get('Cache-Control'), 'private, no-store');
console.log('PASS dashboard covers: authentication, read permission, empty scope, invalid URL, image bytes, private caching and unavailable source');
