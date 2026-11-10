import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const compile = file => ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let deadlines = [], handler;
const exports = {};
runInNewContext(compile('src/lib/posts/client-interactions.ts'), {
  exports,
  AbortSignal: { any: signals => AbortSignal.any(signals), timeout: milliseconds => {
    assert.equal(milliseconds, 45_000);
    const controller = new AbortController(); deadlines.push(controller); return controller.signal;
  } },
  fetch: (url, options) => handler(url, options),
});
const { requestContentLibrary, restoreContentPreviewFocus } = exports;
const rows = { posts: [{ video_id: '1' }], totals: { totalGmv: 15 } };
handler = async (url, { signal }) => {
  assert.equal(url, '/api/posts?brand=alpha'); assert.equal(signal.aborted, false);
  return { ok: true, json: async () => rows };
};
assert.equal(await requestContentLibrary('/api/posts?brand=alpha', new AbortController().signal), rows);
handler = async () => ({ ok: false, json: async () => ({ error: 'PRIVATE_BACKEND_DETAIL' }) });
await assert.rejects(requestContentLibrary('/api/posts', new AbortController().signal), /Content could not be loaded/);
handler = async () => ({ ok: true, json: async () => ({ posts: 'invalid', totals: {} }) });
await assert.rejects(requestContentLibrary('/api/posts', new AbortController().signal), /Content could not be loaded/);

handler = (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
const timed = requestContentLibrary('/api/posts', new AbortController().signal);
deadlines.at(-1).abort(new DOMException('Time expired', 'TimeoutError'));
await assert.rejects(timed, /Content took too long.*last loaded results are preserved/);
const parent = new AbortController();
const cancelled = requestContentLibrary('/api/posts', parent.signal);
parent.abort(new DOMException('Scope changed', 'AbortError'));
await assert.rejects(cancelled, /Scope changed/, 'A scope change remains cancellation, not a visible timeout');

let body;
handler = async () => ({ ok: true, json: () => new Promise(resolve => { body = resolve; }) });
const slowBody = requestContentLibrary('/api/posts', new AbortController().signal);
await new Promise(resolve => setImmediate(resolve));
deadlines.at(-1).abort(new DOMException('Time expired', 'TimeoutError'));
body(rows);
await assert.rejects(slowBody, /Content took too long/, 'The deadline includes response decoding, not just headers');

let focused = [], fallbackCount = 0;
const original = { isConnected: true, disabled: false, focus: options => focused.push(options) };
const fallback = () => { fallbackCount++; return true; };
assert.equal(restoreContentPreviewFocus(original, fallback), true);
assert.equal(focused.length, 1); assert.equal(focused[0].preventScroll, true); assert.equal(fallbackCount, 0);
assert.equal(restoreContentPreviewFocus({ ...original, isConnected: false }, fallback), true);
assert.equal(fallbackCount, 1, 'Next video can replace the original inspector trigger; use its current replacement');
assert.equal(restoreContentPreviewFocus({ ...original, disabled: true }, fallback), true);
assert.equal(fallbackCount, 2, 'A disabled trigger must not swallow focus restoration');
assert.equal(restoreContentPreviewFocus(null), false, 'Leave the dialog default when no focus target remains');

const navigation = {};
runInNewContext(compile('src/lib/agency/revenue-navigation.ts'), { exports: navigation, URLSearchParams });
const row = { month: '2026-10', throughDate: '2026-10-28', agencyTerms: { servicePeriod: { start: '2026-10-15', end: '2026-10-31' } } };
const drilldown = new URL(navigation.revenueBrandDashboardHref(row, 'brand&one'), 'https://fixture.invalid');
assert.equal(drilldown.pathname, '/dashboard'); assert.equal(drilldown.searchParams.get('brand'), 'brand&one');
assert.equal(drilldown.searchParams.get('range'), 'custom'); assert.equal(drilldown.searchParams.get('start'), '2026-10-15');
assert.equal(drilldown.searchParams.get('end'), '2026-10-28', 'Revenue drilldowns retain the reviewed period and recorded cutoff');
assert.equal(navigation.revenueBrandDashboardHref({ ...row, throughDate: '2026-10-14' }, 'brand'), null);
const wholeMonth = new URL(navigation.revenueBrandDashboardHref({ month: '2026-09', agencyTerms: null, throughDate: '2026-09-30' }, 'brand'), 'https://fixture.invalid');
assert.equal(wholeMonth.searchParams.get('start'), '2026-09-01'); assert.equal(wholeMonth.searchParams.get('end'), '2026-09-30');
const capped = new URL(navigation.revenueBrandDashboardHref({ ...row, throughDate: '2026-11-04' }, 'brand'), 'https://fixture.invalid');
assert.equal(capped.searchParams.get('end'), '2026-10-31', 'A dated arrangement cannot drill beyond its approved end');
console.log('PASS Studio interactions: content deadlines/cancellation, response-body timeout, next-video focus restoration and matching-period revenue drilldowns');
