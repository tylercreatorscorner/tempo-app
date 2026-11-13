import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';

const own = { tenantId: 'tenant-a', email: 'operator@fixture.invalid', brandScope: { kind: 'scoped', brandSlugs: ['m3'] } };
let scope = own, canWrite = true, canonical = null, canonicalFailure = false, sequence = null;
let calls = [], inserts = [], builds = [], onBuild = null, rows = [], queryFailure = false;
const original = { id: 'original', token: 'original-token', tenant_id: 'tenant-a', brand_slug: 'm3', brand_name: 'M3', report_type: 'monthly', period_start: '2026-10-01', period_end: '2026-10-31', period_label: 'October 2026', created_at: '2026-11-01T00:00:00Z', revoked_at: null, notes: 'Old notes', plan: 'Old plan', snapshot: { v: 1, report: { totalGmv: 10 }, generatedAt: 'old' } };
const approved = { ...original, id: 'approved', token: 'approved-token', created_at: '2026-11-13T00:00:00Z', notes: 'Approved notes', plan: 'Approved plan', correction: { status: 'approved' }, snapshot: { v: 1, report: { totalGmv: 20, activeCreators: 3, managedPct: 50 }, reportCorrection: { status: 'approved', sourceReportId: 'original', approvedAt: '2026-11-12T12:00:00Z' }, revision: { previousReportId: 'original' }, generatedAt: 'approved' } };
class CanonicalReportUnavailableError extends Error {}
const resolve = async target => {
  calls.push(target);
  if (canonicalFailure) throw new CanonicalReportUnavailableError('Approved revision unavailable');
  if (sequence) return sequence.shift() ?? null;
  return canonical && target.tenantId === canonical.tenant_id && target.brandSlug === canonical.brand_slug && target.reportType === canonical.report_type && target.periodStart === canonical.period_start && target.periodEnd === canonical.period_end ? canonical : null;
};
const canonicalApi = { CanonicalReportUnavailableError, loadCanonicalForPeriod: resolve,
  loadCanonicalForReport: row => resolve({ tenantId: row.tenant_id, brandSlug: row.brand_slug, reportType: row.report_type ?? 'performance', periodStart: row.period_start, periodEnd: row.period_end }) };
function from() {
  const filters = []; let insert, start = 0, end = Infinity;
  const q = { select: () => q, order: () => q, abortSignal: () => q,
    eq: (key, value) => { filters.push(row => row[key] === value); return q; },
    in: (key, values) => { filters.push(row => values.includes(row[key])); return q; },
    range: (a, b) => { start = a; end = b + 1; return q; },
    insert: value => { insert = value; return q; }, single: () => run(true), maybeSingle: () => run(true),
    then: (yes, no) => Promise.resolve(run(false)).then(yes, no) };
  function run(single) {
    if (queryFailure) return { data: null, error: { message: 'fixture failure' } };
    if (insert) { inserts.push(insert); return { data: { ...insert, id: 'new-copy', token: 'new-copy-token' }, error: null }; }
    const selected = rows.filter(row => filters.every(test => test(row))).slice(start, end);
    return { data: single ? selected[0] ?? null : selected, error: null };
  }
  return q;
}
const db = { from, auth: { getUser: async () => ({ data: { user: { email: own.email } } }) } };
const deps = { 'next/server': { NextRequest, NextResponse },
  '@/lib/supabase/server': { createAdminClient: async () => db, createClient: async () => db },
  '@/lib/auth/workspace-scope': { getWorkspaceScope: async () => scope, isBrandInScope: (s, b) => s.brandScope.kind === 'all' || s.brandScope.brandSlugs.includes(b.slug) },
  '@/lib/auth/client-report-access': { reportGuard: (_scope, mode) => mode === 'write' && !canWrite ? NextResponse.json({ error: 'Forbidden' }, { status: 403 }) : null, clientReportContext: async () => ({ tenantId: own.tenantId }), ClientReportAccessError: class extends Error {} },
  '@/lib/data/client-report-canonical': canonicalApi, './client-report-canonical': canonicalApi,
  '@/lib/data/client-reports': { parseReportPeriod: value => value, draftClientReportNotes: () => 'Generated notes', buildClientReportSnapshot: async (brand, period, _context, _unused, type) => {
    builds.push({ brand, period, type }); if (onBuild) onBuild();
    return { brandName: 'M3', periodStart: '2026-10-01', periodEnd: '2026-10-31', periodLabel: 'October 2026', snapshot: { v: 1, report: { totalGmv: 999, activeCreators: 5, managedPct: 99 } } };
  } },
};
function load(file) { const exports = {}; runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, console: { error() {} }, Date, URL, Map, Set, AbortSignal, process: { env: {} }, require: key => { assert.ok(key in deps, key); return deps[key]; } }); return exports; }
deps['@/lib/data/client-report-library'] = load('src/lib/data/client-report-library.ts');
const library = load('src/app/api/client-reports/route.ts');
const preview = load('src/app/api/client-reports/preview/route.ts');
const refresh = load('src/app/api/client-reports/[id]/refresh/route.ts');
const edit = load('src/app/api/client-reports/[id]/route.ts');
const request = (body, method = 'POST', query = '') => new NextRequest('https://fixture.invalid/api/client-reports' + query, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
const ctx = id => ({ params: Promise.resolve({ id }) });
const monthly = { brand: 'm3', period: { start: '2026-10-01', end: '2026-10-31' }, reportType: 'monthly' };
function reset() { scope = own; canWrite = true; canonical = approved; canonicalFailure = false; sequence = null; calls = []; inserts = []; builds = []; onBuild = null; queryFailure = false; rows = [structuredClone(original), structuredClone(approved)]; }

reset(); let response = await preview.POST(request(monthly)); let body = await response.json();
assert.equal(response.status, 200); assert.equal(body.headline.gmv, 20); assert.equal(body.draftNotes, 'Approved notes'); assert.equal(body.draftPlan, 'Approved plan'); assert.equal(builds.length, 0); assert.equal(calls[0].reportType, 'monthly');
response = await library.POST(request({ ...monthly, notes: approved.notes, plan: approved.plan })); body = await response.json();
assert.equal(body.token, approved.token); assert.equal(body.reused, true); assert.equal(inserts.length, 0); assert.equal(builds.length, 0);
response = await library.POST(request({ ...monthly, notes: 'Unsaved edit' })); assert.equal(response.status, 409); assert.equal(inserts.length, 0, 'Creating a corrected period cannot discard edits or mint regenerated figures');
response = await refresh.POST(request(null), ctx('original')); body = await response.json(); assert.equal(body.token, approved.token); assert.equal(builds.length, 0); assert.equal(inserts.length, 0);

reset(); const frozenOriginal = JSON.stringify(rows[0]); response = await edit.PATCH(request({ notes: 'New approved commentary' }, 'PATCH'), ctx('original'));
assert.equal(response.status, 200); assert.equal(inserts[0].snapshot.report.totalGmv, 20); assert.equal(inserts[0].snapshot.reportCorrection.status, 'approved'); assert.equal(inserts[0].snapshot.revision.previousReportId, 'approved'); assert.equal(inserts[0].plan, 'Approved plan'); assert.equal(inserts[0].notes, 'New approved commentary'); assert.equal(JSON.stringify(rows[0]), frozenOriginal);
assert.equal(inserts[0].snapshot.reportCorrection.approvedAt, approved.snapshot.reportCorrection.approvedAt, 'A later notes insert retains original financial approval precedence');
reset(); canonical = structuredClone(approved); delete canonical.snapshot.reportCorrection.approvedAt;
response = await edit.PATCH(request({ notes: 'Legacy correction notes' }, 'PATCH'), ctx('original'));
assert.equal(response.status, 200); assert.equal(inserts[0].snapshot.reportCorrection.approvedAt, approved.created_at, 'Legacy approval precedence is frozen before copying, never replaced with the new notes timestamp');
reset(); sequence = [approved, { ...approved, id: 'newer-approval' }]; response = await edit.PATCH(request({ notes: 'Stale copy' }, 'PATCH'), ctx('original')); assert.equal(response.status, 409); assert.equal(inserts.length, 0);

for (const action of ['create', 'refresh', 'preview']) {
  reset(); canonical = null; onBuild = () => { canonical = approved; };
  response = action === 'create' ? await library.POST(request(monthly)) : action === 'refresh' ? await refresh.POST(request(null), ctx('original')) : await preview.POST(request(monthly));
  assert.equal(response.status, 200); body = await response.json(); assert.equal(action === 'preview' ? body.headline.gmv : body.token, action === 'preview' ? 20 : approved.token); assert.equal(inserts.length, 0, 'Approval arriving during build wins');
}
reset(); response = await preview.POST(request({ ...monthly, reportType: 'weekly' })); assert.equal(response.status, 200); assert.equal(builds[0].type, 'weekly', 'Exact report cadence cannot borrow a monthly correction');
for (const action of [() => preview.POST(request(monthly)), () => library.POST(request(monthly)), () => refresh.POST(request(null), ctx('original')), () => edit.PATCH(request({ notes: 'edit' }, 'PATCH'), ctx('original'))]) {
  reset(); canonicalFailure = true; response = await action(); assert.equal(response.status, 503); assert.equal(builds.length, 0); assert.equal(inserts.length, 0, 'Unavailable approval lookup must not fall back to old or regenerated data');
}
reset(); rows[0].revoked_at = '2026-11-13'; response = await refresh.POST(request(null), ctx('original')); assert.equal(response.status, 409); response = await edit.PATCH(request({ notes: 'edit' }, 'PATCH'), ctx('original')); assert.equal(response.status, 409); assert.equal(calls.length, 0);
reset(); canWrite = false; assert.equal((await library.POST(request(monthly))).status, 403); assert.equal((await edit.PATCH(request({ notes: 'edit' }, 'PATCH'), ctx('original'))).status, 403); assert.equal(calls.length, 0);
reset(); assert.equal((await preview.POST(request({ ...monthly, brand: 'foreign' }))).status, 403); assert.equal(calls.length, 0);

reset(); rows.push({ ...original, id: 'unapproved-newer', token: 'unapproved-token', created_at: '2026-11-14T00:00:00Z' }, { ...original, id: 'weekly', report_type: 'weekly' }, { ...original, id: 'september', period_start: '2026-09-01', period_end: '2026-09-30' }, { ...approved, id: 'foreign', tenant_id: 'tenant-b' });
response = await library.GET(request(null, 'GET', '?page=1')); body = await response.json(); assert.equal(body.total, 3); assert.deepEqual(body.reports.map(row => row.id).sort(), ['approved', 'september', 'weekly']); assert.ok(!JSON.stringify(body).includes('snapshot'));
response = await library.GET(request(null, 'GET', '?page=1&history=1')); body = await response.json(); assert.equal(body.total, 5, 'Audit mode retains every authorized frozen version');
reset(); for (let day = 1; day <= 25; day++) rows.push({ ...original, id: 'day-' + day, period_start: '2026-09-' + String(day).padStart(2, '0'), period_end: '2026-09-' + String(day).padStart(2, '0') });
response = await library.GET(request(null, 'GET', '?page=2')); body = await response.json(); assert.equal(body.total, 26); assert.equal(body.reports.length, 6, 'Collapsed report scopes produce complete pages and an exact final-page count');
reset(); canonicalFailure = true; response = await library.GET(request(null, 'GET', '?page=1')); assert.equal(response.status, 503, 'A damaged latest approval cannot expose an older incorrect library row');
console.log('PASS authenticated canonical reports: prepare/create/refresh reuse, exact cadence, canonical note copies, mid-build approval, fail-closed errors, scoped collapsed pagination and preserved audit history');
