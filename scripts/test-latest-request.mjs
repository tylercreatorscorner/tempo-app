import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const exports = {};
runInNewContext(ts.transpileModule(readFileSync('src/lib/latest-request.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, AbortController });
const { LatestRequest } = exports;
const request = new LatestRequest();
const events = [];
const handlers = { success: value => events.push(value), error: error => events.push(error.message), settled: () => events.push('settled') };
let resolveOld, rejectOld, oldSignal;
const first = request.run(signal => { oldSignal = signal; return new Promise(resolve => { resolveOld = resolve; }); }, handlers);
await request.run(async () => 'new result', handlers);
assert.equal(oldSignal.aborted, true);
resolveOld('stale result'); await first;
assert.deepEqual(events, ['new result', 'settled'], 'Late response cannot overwrite newer results or loading state');
events.length = 0;
const failing = request.run(() => new Promise((_, reject) => { rejectOld = reject; }), handlers);
await request.run(async () => 'latest result', handlers);
rejectOld(new Error('stale failure')); await failing;
assert.deepEqual(events, ['latest result', 'settled'], 'Stale errors cannot replace the current view with an error');
events.length = 0;
const unmounted = request.run(() => new Promise(resolve => { resolveOld = resolve; }), handlers);
request.cancel(); resolveOld('unmounted result'); await unmounted;
assert.deepEqual(events, [], 'Unmount cancels publication even if the transport ignores abort');
await request.run(async () => { throw new Error('current failure'); }, handlers);
assert.deepEqual(events, ['current failure', 'settled'], 'Current failures remain visible');
console.log('PASS latest request: out-of-order success/error, cancellation, loading ownership, and current error handling');
