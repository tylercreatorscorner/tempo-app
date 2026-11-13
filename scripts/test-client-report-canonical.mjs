import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const exports = {};
runInNewContext(ts.transpileModule(readFileSync('src/lib/data/client-report-canonical.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, Date, Set, AbortSignal, require: name => { assert.equal(name, 'server-only'); return {}; } });
const { loadCanonicalForPeriod, loadCanonicalForReport, CanonicalReportUnavailableError } = exports;
const tenant = '00000000-0000-0000-0000-000000000001';
const otherTenant = '00000000-0000-0000-0000-000000000002';
const sourceId = 'c85fae7e-c86c-4f92-a969-907647d79dc0';
const targetId = '2723ac34-042b-4fb0-8627-a9874bdc2a02';
const scope = { tenantId: tenant, brandSlug: 'm3', reportType: 'monthly', periodStart: '2026-10-01', periodEnd: '2026-10-31' };
const source = { id: sourceId, token: 'original-token', tenant_id: tenant, brand_slug: 'm3', report_type: 'monthly',
  period_start: scope.periodStart, period_end: scope.periodEnd, created_at: '2026-11-12T00:00:00Z', revoked_at: null,
  snapshot: { v: 1, report: { brandSlug: 'm3', startDate: scope.periodStart, endDate: scope.periodEnd } } };
const approved = () => ({ ...structuredClone(source), id: targetId, token: 'approved-token', created_at: '2026-11-13T01:00:00Z',
  snapshot: { ...structuredClone(source.snapshot), reportCorrection: { v: 1, status: 'approved', sourceReportId: sourceId, scope: structuredClone(scope) } } });
let rows = [], calls = [], failure = false, throwFailure = false, corruptReturnedScope = false;
const clone = value => JSON.parse(JSON.stringify(value));
function contains(value, desired) {
  return desired && typeof desired === 'object' ? Object.entries(desired).every(([key, next]) => contains(value?.[key], next)) : value === desired;
}
const db = { from(table) {
  assert.equal(table, 'client_reports');
  const call = { filters: [], order: [], limit: null, columns: null };
  calls.push(call);
  const query = {
    select(columns) { call.columns = columns; return query; },
    eq(key, value) { call.filters.push(['eq', key, value]); return query; },
    contains(key, value) { call.filters.push(['contains', key, clone(value)]); return query; },
    order(key, opts) { call.order.push([key, opts.ascending]); return query; },
    limit(value) { call.limit = value; return query; },
    abortSignal(signal) { assert.ok(signal instanceof AbortSignal); return query; },
    maybeSingle: async () => run(true),
    then: (yes, no) => Promise.resolve().then(() => run(false)).then(yes, no),
  };
  function run(single) {
      if (throwFailure) throw new Error('database secrets');
      if (failure) return { data: null, error: { message: 'database secrets' } };
      let found = rows.filter(row => call.filters.every(([op, key, value]) => op === 'eq' ? row[key] === value : contains(row[key], value)));
      for (const [key, ascending] of [...call.order].reverse()) found.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1));
      if (call.limit !== null) found = found.slice(0, call.limit);
      if (single) assert.ok(found.length <= 1, 'Query must not choose an arbitrary row');
      if (corruptReturnedScope) found = found.map(row => ({ ...row, tenant_id: otherTenant }));
      const data = single ? found.length ? clone(found[0]) : null : clone(found);
      return { data, error: null };
  }
  return query;
} };
function reset(next = [source, approved()]) { rows = clone(next); calls = []; failure = false; throwFailure = false; corruptReturnedScope = false; }
async function rejects(task) {
  await assert.rejects(task, error => error instanceof CanonicalReportUnavailableError && !error.message.includes('database secrets'));
}

reset([source, { ...source, id: targetId, token: 'newer-unapproved', created_at: '2026-11-14T00:00:00Z' }]);
assert.equal(await loadCanonicalForPeriod(scope, db), null, 'Newer ordinary snapshots must never replace sent reports');
assert.equal(calls.length, 1);
reset();
const before = JSON.stringify(rows);
let result = await loadCanonicalForReport(source, db);
assert.equal(result.id, targetId);
assert.equal(result.token, 'approved-token');
assert.equal(JSON.stringify(rows), before, 'Canonical resolution is strictly read-only');
assert.deepEqual(calls[0].filters, [
  ['eq', 'tenant_id', tenant], ['eq', 'brand_slug', 'm3'], ['eq', 'report_type', 'monthly'],
  ['eq', 'period_start', scope.periodStart], ['eq', 'period_end', scope.periodEnd],
  ['contains', 'snapshot', { reportCorrection: { status: 'approved' } }],
]);
assert.deepEqual(calls[0].order, [['created_at', false], ['id', false]]);
assert.equal(calls[0].limit, 201);
assert.equal(calls.length, 2, 'Validate original provenance in addition to approved target');
assert.equal((await loadCanonicalForReport(approved(), db)).id, targetId, 'Canonical target resolves to itself without recursion');

for (const changes of [{ tenantId: otherTenant }, { brandSlug: 'lemme' }, { reportType: 'weekly' },
  { periodStart: '2026-10-02' }, { periodEnd: '2026-10-30' }]) {
  reset();
  assert.equal(await loadCanonicalForPeriod({ ...scope, ...changes }, db), null, 'Other tenants/brands/cadences/windows remain unchanged');
}
reset();
assert.equal(await loadCanonicalForReport({ ...source, revoked_at: '2026-11-13T02:00:00Z' }, db), null);
assert.equal(calls.length, 0, 'Revoked source cannot gain access through a corrected token');
assert.equal(await loadCanonicalForReport({ ...source, tenant_id: null }, db), null);
assert.equal(calls.length, 0, 'Legacy tenantless token must not resolve across workspaces');

for (const mutate of [
  row => { row.revoked_at = '2026-11-13T02:00:00Z'; },
  row => { row.snapshot.reportCorrection.v = 2; },
  row => { row.snapshot.reportCorrection.scope.tenantId = otherTenant; },
  row => { row.snapshot.reportCorrection.scope.brandSlug = 'lemme'; },
  row => { row.snapshot.reportCorrection.scope.reportType = 'weekly'; },
  row => { row.snapshot.reportCorrection.scope.periodStart = '2026-10-02'; },
  row => { row.snapshot.reportCorrection.scope.periodEnd = '2026-10-30'; },
  row => { row.snapshot.reportCorrection.sourceReportId = row.id; },
  row => { row.snapshot.reportCorrection.sourceReportId = 'missing'; },
  row => { row.snapshot.report.brandSlug = 'lemme'; },
  row => { row.snapshot.report.startDate = '2026-09-01T00:00:00.000Z'; },
  row => { row.snapshot.report.endDate = '2026-11-01T00:00:00.000Z'; },
  row => { row.snapshot.report.endDate = 'not-a-date'; },
  row => { row.token = 'bad'; },
]) {
  reset(); mutate(rows[1]);
  await rejects(() => loadCanonicalForPeriod(scope, db));
}
reset();
rows[1].snapshot.report.startDate = '2026-10-01T00:00:00.000Z';
rows[1].snapshot.report.endDate = '2026-10-31T00:00:00.000Z';
assert.equal((await loadCanonicalForPeriod(scope, db)).id, targetId, 'Frozen ISO dates are accepted');

reset();
rows.push({ ...approved(), id: '3723ac34-042b-4fb0-8627-a9874bdc2a02', token: 'latest-approved-token', created_at: '2026-11-14T00:00:00Z', revoked_at: '2026-11-14T01:00:00Z' });
await rejects(() => loadCanonicalForPeriod(scope, db));
assert.equal(calls.length, 1, 'Revoked latest approval must never fall back to prior approved or original reports');
reset(); rows[0].brand_slug = 'lemme';
await rejects(() => loadCanonicalForPeriod(scope, db));
reset([approved()]); await rejects(() => loadCanonicalForPeriod(scope, db));
reset(); corruptReturnedScope = true; await rejects(() => loadCanonicalForPeriod(scope, db));
reset(); failure = true; await rejects(() => loadCanonicalForPeriod(scope, db));
reset(); throwFailure = true; await rejects(() => loadCanonicalForPeriod(scope, db));
reset(); await rejects(() => loadCanonicalForPeriod({ ...scope, periodEnd: '2026-02-30' }, db));
assert.equal(calls.length, 0, 'Invalid scope is rejected before database access');

// Normal notes-only copies spread the snapshot: replacing revision metadata
// cannot discard approved membership metadata at the separate snapshot key.
reset();
rows.push({ ...approved(), id: '4723ac34-042b-4fb0-8627-a9874bdc2a02', token: 'copied-approved-token', created_at: '2026-11-14T00:00:00Z',
  snapshot: { ...approved().snapshot, revision: { kind: 'copy', previousReportId: targetId } } });
assert.equal((await loadCanonicalForPeriod(scope, db)).token, 'copied-approved-token');
// A stale notes edit may finish after a new financial approval. The financial
// approval timestamp must win over the late copy's created_at timestamp.
reset();
rows[1].snapshot.reportCorrection.approvedAt = '2026-11-13T01:00:00Z';
const nextApproval = { ...approved(), id: '5723ac34-042b-4fb0-8627-a9874bdc2a02', token: 'new-financial-approval', created_at: '2026-11-14T01:00:00Z' };
nextApproval.snapshot.reportCorrection.approvedAt = '2026-11-14T00:00:00Z';
const lateCopy = { ...clone(rows[1]), id: '6723ac34-042b-4fb0-8627-a9874bdc2a02', token: 'late-old-notes-copy', created_at: '2026-11-15T01:00:00Z' };
rows.push(nextApproval, lateCopy);
assert.equal((await loadCanonicalForPeriod(scope, db)).token, nextApproval.token);
nextApproval.revoked_at = '2026-11-15T01:00:00Z';
await rejects(() => loadCanonicalForPeriod(scope, db));
reset(); rows[1].snapshot.reportCorrection.approvedAt = 'not-a-date';
await rejects(() => loadCanonicalForPeriod(scope, db));
reset(); rows[1].snapshot.reportCorrection.approvedAt = '2027-01-01T00:00:00Z';
await rejects(() => loadCanonicalForPeriod(scope, db));
reset(); rows[1].snapshot.reportCorrection.approvedAt = '2026-11-13T01:00:03Z';
assert.equal((await loadCanonicalForPeriod(scope, db)).id, targetId, 'Allow small creation/approval clock skew');
reset();
for (let i = 0; i < 200; i++) rows.push({ ...approved(), id: `70000000-0000-0000-0000-${String(i).padStart(12,'0')}` });
await rejects(() => loadCanonicalForPeriod(scope, db));
console.log('PASS approved report canonical resolution: exact scope, explicit approval, immutable originals, copied corrections, provenance, revocation and fail-closed errors');
