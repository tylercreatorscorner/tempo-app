import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const exports = {};
runInNewContext(ts.transpileModule(readFileSync('src/lib/data/client-report-history.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, Date, Map, Set, AbortSignal, require: name => {
  if (name === './client-report-canonical') return { loadCanonicalForPeriod: async () => null };
  assert.equal(name, 'server-only'); return {};
} });
const { selectClientReportHistory, loadClientReportHistory } = exports;
const source = { token: 'source-token', tenant_id: 'tenant-a', brand_slug: 'alpha', report_type: 'monthly',
  period_start: '2026-09-01', period_end: '2026-09-30', period_label: 'September 2026', created_at: '2026-10-01T12:00:00Z' };
const older = (extra = {}) => ({ ...source, token: 'august-old', period_start: '2026-08-01', period_end: '2026-08-31',
  period_label: 'August 2026', created_at: '2026-09-01T12:00:00Z', revoked_at: null, ...extra });
const rows = [older(), older({ token: 'august-new', created_at: '2026-09-03T12:00:00Z' }),
  older({ token: 'foreign-tenant', tenant_id: 'tenant-b' }), older({ token: 'foreign-brand', brand_slug: 'beta' }),
  older({ token: 'wrong-cadence', report_type: 'weekly' }), older({ token: 'revoked-token', revoked_at: '2026-09-04' }),
  older({ token: 'reconciliation', reconciliation: { creator: 'partial reconciliation' }, created_at: '2026-09-08T12:00:00Z' }),
  older({ token: 'invalid-date', period_start: '2026-02-30' })];
const before = JSON.stringify(rows);
let result = selectClientReportHistory(rows, source);
assert.deepEqual(Array.from(result, row => row.token), ['source-token', 'august-new']);
assert.equal(JSON.stringify(rows), before, 'Original snapshots and metadata cannot be mutated');
assert.equal(selectClientReportHistory(rows, { ...source, tenant_id: null }).length, 0, 'Legacy tenant ownership is never guessed');
assert.equal(selectClientReportHistory(rows, { ...source, brand_slug: 'all' }).length, 0);
assert.equal(selectClientReportHistory(rows, { ...source, report_type: 'performance' }).length, 0);
const oldSource = { ...source, token: 'older-september-version', created_at: '2026-09-30T12:00:00Z' };
result = selectClientReportHistory([{ ...source, revoked_at: null }, ...rows], oldSource);
assert.equal(result[0].token, oldSource.token, 'Reading an old issued link must not silently replace its frozen numbers');
const weekly = { ...source, report_type: 'weekly', period_start: '2026-09-07', period_end: '2026-09-13' };
assert.equal(selectClientReportHistory([{ ...weekly, token: 'another-version', revoked_at: null }], weekly).length, 1);
let reads = 0, fail = false;
const many = Array.from({ length: 501 }, (_, i) => older({ token: `older-version-${i}`, created_at: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString() }));
const db = { from(table) {
  reads++; assert.equal(table, 'client_reports'); const filters = [];
  const query = { select(value) { assert.ok(!value.includes('notes')); return query; },
    eq(key, value) { filters.push([key, value]); return query; }, is(key, value) { assert.equal(key, 'revoked_at'); assert.equal(value, null); return query; },
    order() { return query; }, range(start, end) { query.bounds = [start, end]; return query; },
    async abortSignal() { assert.deepEqual(filters, [['tenant_id', 'tenant-a'], ['brand_slug', 'alpha'], ['report_type', 'monthly']]);
      return { data: fail ? null : many.slice(query.bounds[0], query.bounds[1] + 1), error: fail ? { message: 'failure' } : null }; } };
  return query;
} };
result = await loadClientReportHistory(db, source); assert.equal(reads, 2); assert.equal(result.length, 2);
fail = true; result = await loadClientReportHistory(db, source); assert.deepEqual(Array.from(result, row => row.token), ['source-token']);
const previousReads = reads; await loadClientReportHistory(db, { ...source, tenant_id: null }); assert.equal(reads, previousReads);
console.log('PASS report history: exact tenant/brand/cadence, one active version per period, revoked/reconciliation exclusions, issued-link stability, complete pagination and safe failure');
