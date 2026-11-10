import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync('src/app/(admin)/agency/finance/request.ts', 'utf8');
const exports = {}, deadlines = [];
let handler;
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports, FormData, AbortSignal: { any: signals => AbortSignal.any(signals), timeout: milliseconds => {
    assert.equal(milliseconds, 45_000); const controller = new AbortController(); deadlines.push(controller); return controller.signal;
  } }, fetch: (...args) => handler(...args),
});
const request = exports.requestFinance;
handler = async (_, options) => { assert.equal(options.cache, 'no-store'); return Response.json({ clients: [] }); };
assert.deepEqual(JSON.parse(JSON.stringify(await request('/api/agency/finance'))), { clients: [] });
handler = async () => new Response('<html>Unavailable</html>', { status: 502 });
await assert.rejects(request('/api/agency/finance'), /inputs are preserved/);
handler = async () => Response.json(null);
await assert.rejects(request('/api/agency/finance'), /response could not be verified/);
handler = async (_, options) => { assert.equal(options.method, 'POST'); assert.equal(JSON.parse(options.body).action, 'settings'); return Response.json({ revision: 2 }); };
assert.equal((await request('/api/agency/finance', { action: 'settings' })).revision, 2);
handler = (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
let pending = request('/api/agency/finance'); deadlines.at(-1).abort(new DOMException('Timeout', 'TimeoutError'));
await assert.rejects(pending, /Finance took too long.*retry/);
pending = request('/api/agency/finance', { action: 'settings' }); deadlines.at(-1).abort(new DOMException('Timeout', 'TimeoutError'));
await assert.rejects(pending, /check whether the change was saved before retrying/);
const cancel = new AbortController(); pending = request('/api/agency/finance', undefined, cancel.signal); cancel.abort(new DOMException('Unmounted', 'AbortError'));
await assert.rejects(pending, /Unmounted/);
let decode;
handler = async () => ({ ok: true, json: () => new Promise(resolve => { decode = resolve; }) });
pending = request('/api/agency/finance'); await new Promise(resolve => setImmediate(resolve)); deadlines.at(-1).abort(new DOMException('Timeout', 'TimeoutError')); decode({ clients: [] });
await assert.rejects(pending, /Finance took too long/, 'The deadline also covers response decoding');

const ui = readFileSync('src/app/(admin)/agency/finance/workspace.tsx', 'utf8');
assert.match(ui, /if \(busyRef.current\) return/);
assert.match(ui, /run\(load, false\)/, 'Reload does not issue another automatic reload');
assert.match(ui, /completedAgencyMonth\(reviewMonth/);
assert.match(ui, /contract.extraction \|\| !contract.source_url/, 'Linked Drive files do not offer unsupported extraction');
assert.match(ui, /month > completedMonth/);
assert.match(ui, /busy \|\| !validActionDate/);
assert.match(ui, /\[ref|ref=\{fileInput\}/);
const quick = readFileSync('src/app/(admin)/agency/quick-client-setup.tsx', 'utf8');
assert.match(quick, /!fee.trim\(\)/, 'Blank fees must not coerce to confirmed zero');
assert.match(quick, /!share.trim\(\)/);
assert.match(quick, /client.revision\}:\$\{month\}/, 'A month change clears the previous period draft');
console.log('PASS finance UI: bounded reads/writes, timeout uncertainty, cancellation, response parsing, one reload, period/date guards, Drive extraction, and explicit quick-setup fees');
