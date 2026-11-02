import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const model = {};
let requests = [];
let active = 0;
let maxActive = 0;
let failMonth = '';
const fakeFetch = async (url, { signal }) => {
  const params = new URL(url, 'https://tempo.test').searchParams;
  const start = params.get('start');
  requests.push({ start, end: params.get('end'), brand: params.get('brand') });
  maxActive = Math.max(maxActive, ++active);
  await new Promise(resolve => setTimeout(resolve, 2));
  active--;
  if (signal.aborted) throw new Error('Aborted');
  return { ok: start !== failMonth, json: async () => ({ rows: [{ stat_date: start }], brands: 20 }) };
};
runInNewContext(ts.transpileModule(readFileSync('src/components/dashboard/dashboard-series-loader.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: model, URLSearchParams, AbortController, setTimeout, clearTimeout, fetch: fakeFetch });

const windows = JSON.parse(JSON.stringify(model.seriesWindows('2026-05-01', '2026-10-31')));
assert.equal(windows.length, 6);
assert.deepEqual(windows[0], { start: '2026-05-01', end: '2026-05-31' });
assert.deepEqual(windows[5], { start: '2026-10-01', end: '2026-10-31' });
assert.deepEqual(JSON.parse(JSON.stringify(model.seriesWindows('2026-10-25', '2026-10-31'))), [{ start: '2026-10-25', end: '2026-10-31' }]);
const cache = new Map();
const controller = new AbortController();
const args = { start: '2026-05-01', end: '2026-10-31', brand: 'catakor', signal: controller.signal, cache, onProgress() {} };
const loaded = await model.loadSeriesRange(args);
assert.equal(loaded.rows.length, 6);
assert.equal(loaded.rows[0].stat_date, '2026-05-01');
assert.equal(loaded.rows[5].stat_date, '2026-10-01');
assert.equal(maxActive, 2);
assert.ok(requests.every(request => request.brand === 'catakor'));
requests = [];
await model.loadSeriesRange({ ...args, start: '2025-11-01' });
assert.equal(requests.length, 6, '6-to-12 months should fetch only the six missing months');
assert.ok(requests.every(request => request.start < '2026-05-01'));
failMonth = '2026-07-01';
const failedCache = new Map();
await assert.rejects(model.loadSeriesRange({ ...args, cache: failedCache }));
assert.equal(failedCache.has('2026-07-01|2026-07-31'), false, 'Failed ranges must not enter the success cache');
failMonth = '';
requests = [];
const recovered = await model.loadSeriesRange({ ...args, cache: failedCache });
assert.equal(recovered.rows.length, 6);
assert.ok(requests.length < 6, 'Retry should retain already successful month windows');
const aborted = new AbortController();
aborted.abort();
await assert.rejects(model.loadSeriesRange({ ...args, cache: new Map(), signal: aborted.signal }));
console.log('PASS dashboard loading: short selected range, calendar month coverage, bounded concurrency, ordered merge, scoped request, successful-window reuse, retry and abort');

const labels = {};
runInNewContext(ts.transpileModule(readFileSync('src/components/dashboard/dashboard-chart-labels.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: labels });
const days = ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'];
const dayFormat = value => `Oct ${Number(value.slice(-2))}`;
for (const limit of [3, 5]) {
  const fromRaw = days.map(value => labels.sparseCategoryLabel(value, days, limit, dayFormat));
  const fromApexPositions = days.map((_, i) => labels.sparseCategoryLabel(String(i + 1), days, limit, dayFormat));
  const fromFormatted = days.map(value => labels.sparseCategoryLabel(dayFormat(value), days, limit, dayFormat));
  assert.deepEqual(fromRaw, fromApexPositions, 'Responsive numeric ticks must match original categories');
  assert.deepEqual(fromRaw, fromFormatted, 'Rerendered formatted labels must retain the same ticks');
  assert.equal(fromRaw.filter(Boolean).length, limit);
}
const months = Array.from({ length: 12 }, (_, i) => `Month ${i + 1}`);
assert.equal(months.map((_, i) => labels.sparseCategoryLabel(String(i + 1), months, 3)).filter(Boolean).length, 3);
console.log('PASS chart axis labels: desktop, initial mobile, responsive numeric category ticks, formatted rerenders and 12-month history');
