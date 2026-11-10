import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the production query, with relational fixtures at the DB boundary.
// No credentials, network, environment files or live mutations are involved.
class FixtureDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-11-10T18:00:00Z'])); }
  static now() { return Date.parse('2026-11-10T18:00:00Z'); }
}
function load(file, dependencies) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Date: FixtureDate, Map, Set, Promise, URLSearchParams, AbortSignal,
    console: { ...console, error() {} }, require: name => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    } });
  return exports;
}
const core = load('src/lib/data/brand-registry-core.ts', {});
const brands = [
  ...['a', 'b', 'c', 'd'].map(slug => ({ id: slug, slug })),
  { id: 'u', slug: 'umbrella', is_umbrella: true },
  { id: 'e', slug: 'east', parent_brand_id: 'u' },
  { id: 'w', slug: 'west', parent_brand_id: 'u' },
  { id: 'z', slug: 'archived', is_archived: true },
].map(row => ({ name: row.slug, is_archived: false, is_umbrella: false, parent_brand_id: null, ...row }));
const registry = core.buildRegistry(brands);
const { rosterSummarySelection } = load('src/lib/data/roster-summary-scoped.ts', {
  '@/lib/data/brand-registry-core': core, '@/lib/data/roster-summary-retainer': {},
  '@/lib/data/published-videos': {}, '@/lib/supabase/server': {}, '@/lib/data/fetch-all-rows': {},
});
const scope = { tenantId: 'tenant-a', canViewCreatorCost: true, brandScope: { kind: 'all' }, permitted: true };
const current = ['2026-11-02', '2026-11-08'];
const prior = ['2026-10-26', '2026-11-01'];
const handle = 'shared';
const makeRow = (brand, overrides = {}) => ({ id: `row-${brand}`, tenant_id: 'tenant-a', creator_id: 'creator-one',
  real_name: 'Shared Creator', brand, status: 'Active', retainer: 1000, monthly_post_requirement: 30,
  created_at: '2026-01-01', joined_at: null, archived_at: null, product_assignments: [], tags: [],
  account_1: handle, account_2: null, account_3: null, account_4: null, account_5: null, ...overrides });
const baseRows = ['a', 'b', 'c'].map(brand => makeRow(brand));
const sales = [
  ['a', current[0], 100], ['b', current[0], 200], ['d', current[0], 700],
  ['a', prior[0], 50], ['b', prior[0], 400], ['d', prior[0], 1000],
  ['e', current[0], 30], ['w', current[0], 70],
  ['e', prior[0], 15], ['w', prior[0], 35],
  ['foreign', current[0], 999999], ['z', current[0], 888888],
].map(([brand, day, gmv]) => ({ brand, day, gmv, handle }));
const videos = [
  ['a', current[0], 'one'], ['a', current[0], 'two'],
  ['b', current[0], 'two'], ['b', current[0], 'three'], ['b', current[0], 'four'],
  ['d', current[0], 'uncontracted'], ['a', prior[0], 'prior-a'],
  ['b', prior[0], 'prior-b-1'], ['b', prior[0], 'prior-b-2'],
  ['b', prior[0], 'prior-b-3'], ['b', prior[0], 'prior-b-4'],
  ['e', current[0], 'umbrella-shared'], ['w', current[0], 'umbrella-shared'],
  ['e', prior[0], 'old-umbrella'],
  ['foreign', current[0], 'forbidden'],
].map(([brand, day, id]) => ({ brand, day, id, handle }));
let rows, calls, fail, allowedIds, dataReads;
const between = (row, start, end) => row.day >= start && row.day <= end;
function source(args) {
  const start = args.p_start_date ?? '2026-10-11';
  const end = args.p_end_date ?? '2026-11-10';
  const handles = args.handles ?? [handle];
  const selected = row => args.brand_ids.includes(row.brand) && handles.includes(row.handle);
  return { sales: sales.filter(row => selected(row) && between(row, start, end)),
    videos: videos.filter(row => selected(row) && between(row, start, end)),
    last: videos.filter(selected), handles };
}
function perf(args) {
  const data = source(args);
  return data.handles.flatMap(h => {
    const g = data.sales.filter(row => row.handle === h);
    const p = data.videos.filter(row => row.handle === h);
    const last = data.last.filter(row => row.handle === h).map(row => row.day).sort().at(-1) ?? null;
    return !g.length && !p.length && !last ? [] : [{ tiktok_username: h,
      gmv_period: g.reduce((sum, row) => sum + row.gmv, 0), posts_period: new Set(p.map(row => row.id)).size,
      last_post_date: last }];
  });
}
async function rpcData(name, args, request) {
  calls.push({ name, args, ...request });
  if (name === 'get_creator_message_signals') return { data: [], error: null };
  assert.ok(Array.isArray(args.brand_ids) && args.brand_ids.length > 0, 'Every performance RPC is explicitly bounded');
  assert.ok(args.brand_ids.every(id => allowedIds.includes(id) || id === '00000000-0000-0000-0000-000000000000'), 'No unauthorized or archived IDs');
  if (fail?.(name, args, request)) return { data: null, error: { message: 'Fixture read failed' } };
  if (name === 'get_unmanaged_top_perf') return { data: [], error: null };
  if (name === 'get_creator_handle_perf') return { data: perf(args), error: null };
  if (name === 'get_creator_handle_brand_gmv') return { data: args.brand_ids.flatMap(id => perf({ ...args, brand_ids: [id] }).map(row => ({ ...row, brand_id: id }))), error: null };
  const data = source(args);
  const selected = name === 'get_creator_handle_gmv_series' ? data.sales : data.videos;
  assert.ok(['get_creator_handle_gmv_series', 'get_creator_handle_posts_series'].includes(name), name);
  const result = [];
  for (const h of data.handles) for (const day of [...new Set(selected.filter(row => row.handle === h).map(row => row.day))]) {
    const matches = selected.filter(row => row.handle === h && row.day === day);
    result.push({ tiktok_username: h, stat_date: day, ...(name === 'get_creator_handle_gmv_series'
      ? { gmv: matches.reduce((sum, row) => sum + row.gmv, 0) } : { posts: new Set(matches.map(row => row.id)).size }) });
  }
  return { data: result, error: null };
}
function rpc(name, args) {
  const order = [];
  const result = async (from = 0, to = 999) => {
    const response = await rpcData(name, args, { from, to, order: [...order] });
    if (!response.data) return response;
    const sorted = [...response.data].sort((a, b) => {
      for (const column of order) { const cmp = String(a[column]).localeCompare(String(b[column])); if (cmp) return cmp; }
      return 0;
    });
    return { ...response, data: sorted.slice(from, Math.min(to + 1, from + 1000)) };
  };
  const query = { order: column => { order.push(column); return query; }, range: result,
    then: (resolve, reject) => result().then(resolve, reject) };
  return query;
}
function from(table) {
  dataReads++;
  const tables = {
    managed_creators: rows,
    tiktok_accounts: [{ tenant_id: 'tenant-a', creator_id: 'creator-one', tiktok_username: handle },
      { tenant_id: 'tenant-a', creator_id: 'creator-one', tiktok_username: 'SHARED' }],
    products: [],
    creator_performance: [{ tenant_id: 'tenant-a', period_type: 'daily', brand: 'a', report_date: current[1] }],
  };
  assert.ok(table in tables, table);
  let predicates = [], offset = 0, end = Infinity;
  const result = () => ({ data: tables[table].filter(row => predicates.every(test => test(row))).slice(offset, end), error: null });
  const query = { select: () => query, order: () => query,
    eq: (key, value) => { predicates.push(row => row[key] === value); return query; },
    is: (key, value) => { predicates.push(row => row[key] === value); return query; },
    in: (key, values) => { predicates.push(row => values.includes(row[key])); return query; },
    contains: () => query, or: () => query,
    range: (first, last) => { offset = first; end = last + 1; return Promise.resolve(result()); },
    limit: limit => { end = limit; return query; },
    then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
  };
  return query;
}
const { runRosterQuery } = load('src/lib/data/roster-query.ts', {
  '@/lib/roster/creator-tags': { matchesCreatorTags: () => true, normalizeCreatorTag: value => value },
  '@/lib/agreements/roster-terms': { applyRosterAgreementTerms: async () => {}, isCalendarMonthAgreement: () => true },
  '@/lib/data/brand-registry': core, '@/lib/auth/permissions': { can: scope => scope.permitted },
  '@/lib/supabase/server': { createAdminClient: async () => ({ from, rpc }) },
  '@/lib/data/date-utils': { resolveDateRange: (_, start, end) => ({ startDate: start, endDate: end }) },
  '@/lib/data/roster-summary': { getRosterSummaryRegistry: async () => registry, rosterSummarySelection,
    loadRosterSummary: async () => ({ totalGmvPeriod: 300, summary: { total_retainer: 3000 } }) },
});
async function run(params = '', options = {}) {
  rows = structuredClone(options.rows ?? baseRows);
  calls = []; dataReads = 0; fail = options.fail;
  const activeScope = options.scope ?? scope;
  const query = new URLSearchParams(`range=custom&start=${options.start ?? current[0]}&end=${options.end ?? current[1]}&sort=gmv_period&${params}`);
  try { allowedIds = rosterSummarySelection(activeScope, registry, query.get('brand'), query.get('store')).dataSlugs.map(slug => registry.bySlug.get(slug).id); }
  catch { allowedIds = []; }
  return runRosterQuery(activeScope, query);
}
const success = result => { assert.equal(result.status, 200); return result.body; };
const values = body => Object.fromEntries(body.data.map(row => [row.brand, row]));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`);

let body = success(await run());
assert.equal(body.total, 1, 'All Brands groups a linked creator once');
let parent = body.data[0];
assert.equal(parent.grouped, true); assert.equal(parent.gmv_period, 300);
assert.equal(parent.posts_period, 5, 'Grouped rows retain summed per-brand publication semantics');
assert.deepEqual(Array.from(parent.brands, row => [row.brand, row.gmv_period, row.posts_period]), [['b', 200, 3], ['a', 100, 2], ['c', 0, 0]]);
near(parent.gmv_delta, -100 / 3); near(parent.posts_delta, 0);
assert.deepEqual(Array.from(parent.spark), [300, 0, 0, 0, 0, 0, 0]);
assert.deepEqual(Array.from(parent.spark_posts), [5, 0, 0, 0, 0, 0, 0]);
assert.equal(parent.gmv_by_store.d, undefined, 'Uncontracted sales do not leak into parent breakdown');
assert.equal(body.total_gmv_period, 300, 'Header source remains independent');

body = success(await run('brand=all'));
assert.equal(body.data[0].grouped, true, 'Explicit all is equivalent to omitted brand');
body = success(await run('include=all'));
assert.equal(body.total, 3); let byBrand = values(body);
assert.equal(byBrand.a.gmv_period, 100); assert.equal(byBrand.b.gmv_period, 200); assert.equal(byBrand.c.gmv_period, 0);
near(byBrand.a.gmv_delta, 100); near(byBrand.b.gmv_delta, -50); assert.equal(byBrand.c.gmv_delta, null);
near(byBrand.a.posts_delta, 100); near(byBrand.b.posts_delta, -25);
assert.equal(byBrand.a.spark[0], 100); assert.equal(byBrand.b.spark_posts[0], 3);
assert.equal(byBrand.c.last_post_date, null, 'Another brand cannot supply last-post evidence');
assert.equal(byBrand.c.health, 'silent');
body = success(await run('health=behind'));
assert.equal(body.data.length, 2); assert.equal(body.behind_count, 2);
assert.ok(body.data.every(row => !row.grouped && row.gmv_period < 300));
body = success(await run('brand=a'));
assert.equal(body.total, 1); assert.equal(body.data[0].gmv_period, 100); near(body.data[0].gmv_delta, 100);

const manager = { ...scope, brandScope: { kind: 'scoped', brandSlugs: ['a', 'b'] } };
body = success(await run('', { scope: manager }));
assert.equal(body.total, 2); assert.ok(body.data.every(row => !row.grouped));
assert.equal(values(body).a.gmv_period, 100); near(values(body).b.gmv_delta, -50);
assert.ok(calls.filter(call => call.args.brand_ids).every(call => call.args.brand_ids.every(id => ['a', 'b'].includes(id))));
assert.equal((await run('brand=d', { scope: manager })).status, 403); assert.equal(dataReads, 0);
body = success(await run('', { scope: { ...manager, brandScope: { kind: 'scoped', brandSlugs: [] } } }));
assert.equal(body.total, 0); assert.equal(calls.length, 0, 'Empty authorization never becomes all brands');

body = success(await run('all=1'));
assert.equal(body.total, 3); assert.equal(values(body).a.gmv_period, 100);
assert.ok(body.data.every(row => !row.grouped && row.spark === undefined), 'Export stays granular and does not fetch optional series');
assert.ok(!calls.some(call => call.name.includes('series')));
body = success(await run('include=all&limit=1&page=2'));
assert.equal(body.data[0].brand, 'a'); assert.equal(body.data[0].gmv_period, 100);
near(body.data[0].gmv_delta, 100); assert.equal(body.data[0].spark[0], 100);

const umbrellaRows = [makeRow('umbrella')];
body = success(await run('brand=umbrella', { rows: umbrellaRows }));
assert.equal(body.data[0].gmv_period, 100); assert.equal(body.data[0].posts_period, 1);
near(body.data[0].gmv_delta, 100); assert.equal(body.data[0].spark_posts[0], 1);
body = success(await run('brand=umbrella&store=east', { rows: umbrellaRows }));
assert.equal(body.data[0].gmv_period, 30); near(body.data[0].gmv_delta, 100);
assert.ok(calls.filter(call => call.args.brand_ids).every(call => call.args.brand_ids.every(id => id === 'e')));
body = success(await run('', { rows: [makeRow('umbrella'), makeRow('east')] }));
assert.equal(body.data[0].gmv_period, 100, 'Overlapping umbrella and child contribute each data store once');
assert.equal(body.data[0].posts_period, 2); near(body.data[0].gmv_delta, 100);
assert.equal(body.data[0].spark[0], 100); assert.equal(body.data[0].spark_posts[0], 2);
body = success(await run('', { rows: [makeRow('a'), makeRow('a', { id: 'duplicate-a' })] }));
assert.equal(body.data[0].gmv_period, 100); assert.equal(body.data[0].retainer, 1000);
body = success(await run('', { rows: [makeRow('a', { creator_id: null, account_2: 'SHARED' })] }));
assert.equal(body.data[0].gmv_period, 100, 'Legacy duplicate handles count once');

const manyRows = Array.from({ length: 600 }, (_, creator) => ['a', 'b', 'c', 'd']
  .filter((_, index) => ((creator % 15) + 1) & (1 << index))
  .map(brand => makeRow(brand, { id: `${creator}-${brand}`, creator_id: `creator-${creator + 2}` }))).flat();
body = success(await run('', { rows: manyRows }));
assert.equal(body.total, 600);
assert.equal(calls.filter(call => call.name === 'get_creator_handle_perf' && call.args.p_start_date === current[0]).length, 4,
  'Initial perf fanout scales with four individual brands, not 600 creator combinations');
assert.ok(calls.length <= 23, `Four brands need at most 23 RPCs across current, comparisons and series, got ${calls.length}`);

const cappedRows = Array.from({ length: 1105 }, (_, index) => makeRow('a', {
  id: `cap-${index}`, creator_id: null, account_1: `cap-${String(index).padStart(4, '0')}`,
}));
const salesLength = sales.length, videosLength = videos.length;
for (const row of cappedRows) {
  sales.push({ brand: 'a', day: current[0], gmv: 1, handle: row.account_1 });
  videos.push({ brand: 'a', day: current[0], id: row.id, handle: row.account_1 });
}
body = success(await run('all=1', { rows: cappedRows }));
assert.equal(body.total, 1105);
assert.ok(body.data.every(row => row.gmv_period === 1 && row.posts_period === 1), 'Later RPC pages preserve all creator metrics');
assert.ok(calls.some(call => call.name === 'get_creator_handle_perf' && call.from === 1000));
assert.ok(calls.some(call => call.name === 'get_creator_handle_brand_gmv' && call.from === 1000));
assert.ok(calls.filter(call => call.name === 'get_creator_handle_brand_gmv').every(call => call.order.join(',') === 'tiktok_username,brand_id'));
assert.equal((await run('all=1', { rows: cappedRows,
  fail: (name, args, request) => name === 'get_creator_handle_perf' && args.p_start_date === current[0] && request.from === 1000,
})).status, 500, 'A failed later page cannot certify partial current totals');
sales.splice(salesLength); videos.splice(videosLength);

const seriesRows = cappedRows.slice(0, 50);
for (const row of seriesRows) for (let index = 0; index < 30; index++) {
  const day = new Date(Date.parse('2026-10-10') + index * 86400000).toISOString().slice(0, 10);
  sales.push({ brand: 'a', day, gmv: 1, handle: row.account_1 });
  videos.push({ brand: 'a', day, id: `${row.id}-${day}`, handle: row.account_1 });
}
body = success(await run('', { rows: seriesRows, start: '2026-10-10' }));
assert.equal(body.data.length, 50);
assert.ok(body.data.every(row => row.spark.length === 30 && row.spark.every(value => value === 1)
  && row.spark_posts.every(value => value === 1)), 'All 1500 daily rows survive the RPC cap');
assert.ok(calls.some(call => call.name === 'get_creator_handle_gmv_series' && call.from === 1000));
assert.ok(calls.some(call => call.name === 'get_creator_handle_posts_series' && call.from === 1000));
assert.ok(calls.filter(call => call.name.includes('_series')).every(call => call.order.join(',') === 'tiktok_username,stat_date'));
body = success(await run('', { rows: seriesRows, start: '2026-10-10',
  fail: (name, _args, request) => name.includes('_series') && request.from === 1000,
}));
assert.ok(body.data.every(row => row.spark === undefined && row.spark_posts === undefined), 'A failed later series page is unavailable, never partial');
sales.splice(salesLength); videos.splice(videosLength);

body = success(await run('', { scope: { ...scope, canViewCreatorCost: false } }));
assert.equal(body.data[0].retainer, null); assert.equal(body.data[0].roi_period, null);
assert.ok(body.data[0].brands.every(row => row.retainer === null && row.roi_period === null));
body = success(await run('', { rows: [makeRow('a', { retainer: null }), makeRow('b')] }));
assert.equal(body.data[0].retainer, null, 'A missing rate does not become a known grouped commitment');
assert.equal(body.data[0].roi_period, null);

assert.equal((await run('', { fail: (name, args) => name === 'get_creator_handle_perf' && args.p_start_date === current[0] })).status, 500, 'Required performance failure cannot fabricate zero');
assert.equal((await run('', { fail: (name, args) => name === 'get_creator_handle_brand_gmv' && args.p_start_date === current[0] })).status, 500);
body = success(await run('', { fail: (name, args) => name === 'get_creator_handle_perf' && args.p_start_date === prior[0] }));
assert.equal(body.data[0].gmv_delta, null); assert.equal(body.data[0].posts_delta, null); assert.equal(body.data[0].gmv_period, 300);
body = success(await run('', { fail: name => name.includes('_series') }));
assert.equal(body.data[0].spark, undefined); assert.equal(body.data[0].spark_posts, undefined);
body = success(await run('', { fail: (name, args) => name === 'get_creator_handle_perf' && args.p_start_date === null }));
assert.equal(body.data[0].level, null);
body = success(await run('', { fail: (name, args) => name === 'get_creator_handle_brand_gmv' && args.p_start_date === '2026-11-01' }));
assert.equal(body.data[0].health, 'not_assessed');
console.log('PASS roster brand performance: real query grouped/ungrouped/scoped/export/pagination/umbrella/store bounds; current/prior/publications/series; unknown failures and cost restrictions');
