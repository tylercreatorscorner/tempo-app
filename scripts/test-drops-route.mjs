import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function load(path, dependencies) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => {
    assert.ok(name in dependencies, name); return dependencies[name];
  }, console, URL, Date, Map, Promise, Error });
  return exports;
}
const formats = load('src/lib/data/drop-formats.ts', {});
let scope = { userId: 'operator', brandScope: { kind: 'all' } };
let fail = false;
const calls = [], throttleKeys = [];
const names = ['Movers', 'Rookie', 'Milestone', 'Mtd', 'WhatsCooking', 'WhosCooking', 'DailyDrop'];
const posts = {};
for (const name of names) posts[`get${name}Data`] = async () => {
  calls.push(name);
  if (fail) throw new Error('fixture database timeout');
  return { movers: [], rookies: [], milestones: [], leaderboard: [], topCreators: [],
    creatorCount: 0, videoCount: 0, yesterdayGmv: 0, discordMap: new Map() };
};
for (const name of ['Movers', 'Rookie', 'Milestones', 'Mtd', 'WhatsCooking', 'WhosCooking', 'DailyDrop']) {
  posts[`format${name}Discord`] = () => 'fixture';
}
const route = load('src/app/api/drops/route.ts', {
  'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
  '@/lib/auth/workspace-scope': { getWorkspaceScope: async () => scope },
  '@/lib/rate-limit': { throttle: key => { throttleKeys.push(key); return true; } },
  '@/lib/data/brand-registry': { getBrandRegistry: async () => ({}), brandLabel: () => 'Fixture' },
  '@/lib/data/discord-posts': posts,
  '@/lib/data/drop-formats': formats,
});
const request = query => route.GET({ nextUrl: new URL('https://fixture.invalid/api/drops?' + query) });
assert.equal(route.maxDuration, 180, 'Route must allow the 120s milestone query plus overhead');
for (const [i, format] of formats.DROP_FORMATS.entries()) {
  calls.length = 0;
  const res = await request(`brand=fixture&period=7d&format=${format.id}`);
  assert.equal(res.status, 200);
  assert.deepEqual(calls, [names[i]], 'A single-format request must not run the whole board');
  assert.equal(res.body.cards.length, 1);
  assert.equal(res.body.cards[0].id, format.id);
}
assert.equal(new Set(throttleKeys).size, 7, 'Independent formats must not throttle each other');
calls.length = 0;
assert.equal((await request('format=unknown')).status, 400);
assert.equal(calls.length, 0);
scope = null;
assert.equal((await request('format=movers')).status, 403);
scope = { userId: 'scoped', brandScope: { kind: 'scoped', brandSlugs: ['assigned'] } };
assert.equal((await request('brand=foreign&format=movers')).status, 403);
assert.equal((await request('brand=all&format=movers')).status, 403);
assert.equal(calls.length, 0, 'Authorization runs before any generator');
fail = true;
const broken = await request('brand=assigned&format=milestones');
assert.equal(broken.body.cards[0].id, 'milestones');
assert.equal(broken.body.cards[0].empty, false);
assert.match(broken.body.cards[0].error, /fixture database timeout/);
console.log('PASS per-format routes: isolated generators, independent throttling, access checks and correctly labelled failures');
