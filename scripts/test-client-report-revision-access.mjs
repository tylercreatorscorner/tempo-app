import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { NextResponse } from 'next/server.js';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const own = { tenantId: id(1), role: 'manager', canViewFinance: true, impersonating: false,
  permissions: new Set(['reporting:read', 'reporting:write']), brandScope: { kind: 'scoped', brandSlugs: ['fixture'], brandIds: [] } };
let scope = own, databaseError = false, reads = 0, coverReads = 0, pdfRenders = 0, pdfProps;
const artworkCalls = [];
const videoUrl = 'https://www.tiktok.com/@fixture/video/7689752945746889998';
const source = { id: id(3), tenant_id: id(1), brand_slug: 'fixture', report_type: 'performance',
  period_start: '2026-11-01', period_end: '2026-11-08', token: 'original-public-token', notes: 'Original notes', snapshot: { original: true } };
const creator = { name: '  =formula', handle: 'fixture', handles: ['fixture'], isAffiliate: false,
  retainer: 1000, quota: 20, gmv: 2500, orders: 40, units: 0, postsPublished: 1, videosEarning: 2, agreement: null };
const draft = { id: id(4), tenant_id: id(1), source_report_id: source.id, brand_slug: 'fixture', brand_name: 'Private fixture',
  report_type: 'performance', period_start: source.period_start, period_end: source.period_end, period_label: 'Nov 1-8', status: 'draft',
  notes: 'Corrected private notes', plan: 'Private review plan', provenance: { internal: 'NOT-A-PUBLIC-PROP' },
  created_at: '2026-11-10T16:00:00Z', updated_at: '2026-11-10T16:00:00Z',
  snapshot: { v: 1, generatedAt: '2026-11-10T16:00:00Z', weekly: [],
    report: { brandSlug: 'fixture', startDate: '2026-11-01T12:00:00Z', endDate: '2026-11-08T12:00:00Z', dailyPerformance: [],
      creatorsCorner: { videos: 1, topVideos: [{ videoUrl }] },
      topVideos: Array.from({ length: 6 }, (_, index) => ({ videoUrl: `https://www.tiktok.com/@shop/video/768975294574688990${index}` })),
      granular: { creators: [creator] } },
    publishedVideoEvidence: { v: 1, scope: 'managed-published', capturedAt: '2026-11-10T16:00:00Z', periodStart: '2026-11-01', periodEnd: '2026-11-08', total: 1,
      videos: [{ videoId: '7689752945746889998', creatorHandle: 'fixture', qualifyingHandles: ['fixture'], publishedAt: '2026-11-03', watchUrl: videoUrl, title: 'Frozen evidence title' }] },
  },
};
const tables = { client_reports: [source], client_report_revision_drafts: [draft], brands_v2: [
  { tenant_id: id(1), slug: 'fixture', logo_url: 'https://example.invalid/fixture-logo.png' },
  { tenant_id: id(2), slug: 'fixture', logo_url: 'https://example.invalid/foreign-logo.png' },
] };
const originals = JSON.stringify(tables);
const db = { from(table) {
  assert.ok(table in tables, 'A draft read must not query live roster or publication data');
  const filters = [];
  const query = { select: () => query, eq: (key, value) => { filters.push(row => row[key] === value); return query; },
    is: (key, value) => { filters.push(row => row[key] === value); return query; }, abortSignal: () => query,
    maybeSingle: async () => { reads++; return { data: databaseError ? null : structuredClone(tables[table].find(row => filters.every(fn => fn(row))) ?? null), error: databaseError ? { message: 'PRIVATE-DATABASE-DETAIL' } : null }; } };
  return query;
} };
const dependencies = {
  'server-only': {}, 'next/server': { NextResponse },
  'next/navigation': { notFound: () => { throw new Error('NOT_FOUND'); } },
  '@/lib/supabase/server': { createAdminClient: async () => db },
  '@/lib/auth/workspace-scope': { getWorkspaceScope: async () => scope, isBrandInScope: (s, b) => s.brandScope.kind === 'all' || s.brandScope.brandSlugs.includes(b.slug) },
  '@/lib/data/brand-registry': {}, '@/lib/data/brand-client-report': {}, './reporting-exclusions': {},
  '@react-pdf/renderer': { renderToBuffer: async props => { pdfRenders++; pdfProps = props; return Buffer.from('%PDF-fixture'); } },
  '@/lib/pdf/brand-client-report-pdf': { BrandClientReportPDF: props => props },
  '@/lib/pdf/report-reconciliation-pdf': { ReportReconciliationPDF: props => props },
  '@/lib/pdf/report-artwork': { reportVideoCovers: async rows => { artworkCalls.push(rows); return {}; } },
  '@/lib/brand-logo': { brandLogoDataUri: async url => url },
  '@/app/r/[token]/studio-report-view': { StudioReportView: props => props },
  '@/app/r/[token]/videos/video-library': { VideoLibrary: props => props },
};
const modules = new Map();
function load(file) {
  const absolute = path.resolve(file);
  if (modules.has(absolute)) return modules.get(absolute);
  const exports = {}; modules.set(absolute, exports);
  const code = ts.transpileModule(readFileSync(absolute, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  runInNewContext(code, { exports, Date, URL, Response, Request, AbortSignal, Uint8Array, Buffer, Set, Map, console,
    require(name) {
      if (name in dependencies) return dependencies[name];
      if (!name.startsWith('@/') && !name.startsWith('.')) return require(name);
      const base = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(absolute), name);
      const found = ['', '.ts', '.tsx'].map(ext => base + ext).find(existsSync);
      assert.ok(found, name); return load(found);
    },
  });
  return exports;
}
const media = load('src/lib/media/tiktok-video-cover.ts');
dependencies['@/lib/media/tiktok-video-cover'] = {
  parseTikTokVideoUrl: media.parseTikTokVideoUrl,
  getTikTokVideoCover: async () => { coverReads++; return { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' }; },
};
const model = load('src/lib/data/client-report-revision-drafts.ts');
const routes = Object.fromEntries(['pdf', 'csv', 'videos', 'cover'].map(name => [name, load(`src/app/api/client-report-revisions/[id]/${name}/route.ts`)]));
const page = load('src/app/(admin)/reporting/revisions/[id]/page.tsx');
const videosPage = load('src/app/(admin)/reporting/revisions/[id]/videos/page.tsx');
const context = (value = draft.id) => ({ params: Promise.resolve({ id: value }) });
const request = (name, query = '') => new Request(`https://tempo.invalid/api/client-report-revisions/${draft.id}/${name}${query}`);

for (const [viewer, status] of [
  [null, 401], [{ ...own, tenantId: id(2) }, 404],
  [{ ...own, brandScope: { kind: 'scoped', brandSlugs: ['other'], brandIds: [] } }, 404],
  [{ ...own, permissions: new Set(['reporting:read']) }, 403],
  [{ ...own, impersonating: true }, 403],
]) {
  scope = viewer;
  for (const [name, route] of Object.entries(routes)) {
    const response = await route.GET(request(name, '?url=' + encodeURIComponent(videoUrl)), context());
    assert.equal(response.status, status, `${name} enforces the full private draft guard`);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.ok(!JSON.stringify(await response.json()).includes('private notes'));
  }
  await assert.rejects(page.default(context()), /NOT_FOUND/);
  await assert.rejects(videosPage.default({ ...context(), searchParams: Promise.resolve({}) }), /NOT_FOUND/);
}
assert.equal(pdfRenders, 0, 'Unauthorized requests cannot start PDF rendering');
assert.equal(coverReads, 0, 'Unauthorized requests cannot fetch artwork');
scope = null; reads = 0;
await assert.rejects(model.loadClientReportRevisionDraft(draft.id), error => error.status === 401);
assert.equal(reads, 0, 'Anonymous requests do not read draft storage');
scope = own;
await assert.rejects(model.loadClientReportRevisionDraft('original-public-token'), error => error.status === 404);
await assert.rejects(model.loadClientReportRevisionDraft(id(99)), error => error.status === 404);
source.brand_slug = 'other';
await assert.rejects(model.loadClientReportRevisionDraft(draft.id), error => error.status === 404);
source.brand_slug = 'fixture';
draft.snapshot.report.startDate = 'invalid';
await assert.rejects(model.loadClientReportRevisionDraft(draft.id), error => error.status === 503);
draft.snapshot.report.startDate = '2026-11-01T12:00:00Z';
databaseError = true;
let response = await routes.pdf.GET(request('pdf'), context());
assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('PRIVATE-DATABASE-DETAIL'));
databaseError = false;

for (const [name, route] of Object.entries(routes)) {
  response = await route.GET(request(name, name === 'cover' ? '?url=' + encodeURIComponent(videoUrl) : ''), context());
  assert.equal(response.status, 200, name);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  const body = await response.text();
  if (name === 'csv') {
    assert.ok(body.includes('Recorded post target') && body.includes('Monthly rate at report end') && body.includes('Agreement terms not saved'));
    assert.ok(body.includes("'  =formula"), 'Spreadsheet formulas are neutralized even after leading spaces');
    assert.ok(body.includes(',40,0,2500.00,'), 'Actual zero units remain distinct from missing data');
  }
  if (name === 'videos') assert.ok(body.includes('Frozen evidence title') && body.includes('Saved with private revision'));
}
assert.equal(pdfProps.notes, draft.notes); assert.equal(pdfProps.plan, draft.plan); assert.equal(pdfProps.privateRevision, true);
assert.equal(pdfProps.logo, 'https://example.invalid/fixture-logo.png', 'Branding is tenant scoped after draft authorization');
assert.equal(artworkCalls.flat().length, draft.snapshot.report.creatorsCorner.topVideos.length + draft.snapshot.report.topVideos.length);
assert.equal(artworkCalls.length, 2, 'Shop leaders past the helper limit get a separate bounded artwork batch');
assert.ok(artworkCalls.every(rows => rows.length <= 5));
assert.ok(pdfProps.reportUrl.includes('/reporting/revisions/'));
for (const url of ['https://www.tiktok.com/@other/video/7689752945746889999', 'http://127.0.0.1/private', 'https://www.tiktok.com.evil.invalid/@fixture/video/7689752945746889998']) {
  const before = coverReads;
  response = await routes.cover.GET(request('cover', '?url=' + encodeURIComponent(url)), context());
  assert.equal(response.status, 404); assert.equal(coverReads, before, 'Only saved TikTok identities may reach the image provider');
}
response = await routes.videos.GET(request('videos', '?creator=unknown'), context());
assert.equal((await response.text()).trim().split('\r\n').length, 1, 'Unknown creator filters cannot expand evidence');
const rendered = await page.default(context());
assert.equal(rendered.props.privateRevision, true); assert.equal(rendered.props.preview, true);
assert.equal(rendered.props.history.length, 0); assert.equal(rendered.props.token, draft.id);
assert.equal(rendered.props.notes, draft.notes); assert.equal(rendered.props.provenance, undefined);
assert.equal(rendered.props.logoUrl, 'https://example.invalid/fixture-logo.png');
for (const value of Object.values(rendered.props.routes)) assert.ok(value.startsWith('/reporting/revisions/') || value.startsWith('/api/client-report-revisions/'));
assert.ok(!JSON.stringify(rendered).includes(source.token), 'The original bearer token is not passed to private UI');
const renderedVideos = await videosPage.default({ ...context(), searchParams: Promise.resolve({ q: 'Frozen' }) });
assert.equal(renderedVideos.props.privateRevision, true); assert.equal(renderedVideos.props.filteredTotal, 1);
assert.equal(renderedVideos.props.library.evidence.videos.length, 1);
assert.equal(page.metadata.title, 'Private report revision | Tempo');
assert.equal(JSON.stringify(tables), originals, 'All private views and exports preserve original and draft rows');
const withoutEvidence = structuredClone(draft); delete withoutEvidence.snapshot.publishedVideoEvidence;
assert.equal(model.privateReportDraftVideoLibrary(withoutEvidence).basis, 'unavailable', 'Missing frozen evidence never triggers a live reconstruction');
// The draft UUID must also fail through every existing public token surface.
// Those handlers continue to read client_reports only; no draft adapter exists.
for (const name of ['pdf', 'csv', 'videos', 'media']) {
  const publicRoute = load(`src/app/api/report-${name}/[token]/route.ts`);
  const response = await publicRoute.GET(request(name, '?url=' + encodeURIComponent(videoUrl)), { params: Promise.resolve({ token: draft.id }) });
  assert.equal(response.status, 404, `A private draft ID must not authorize public ${name}`);
}
assert.equal(JSON.stringify(tables), originals, 'Public token probes also leave both storage tables unchanged');
console.log('PASS private report revision access: actual loader, pages and four endpoints deny unauthorized scope, preserve originals, isolate routes, guard artwork and keep frozen export data');
