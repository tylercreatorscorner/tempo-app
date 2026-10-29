import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';

const db = new PGlite();
const tenant = '11111111-1111-4111-8111-111111111111';
const foreign = '22222222-2222-4222-8222-222222222222';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE TABLE brands_v2(id uuid, tenant_id uuid, slug text, is_umbrella boolean, parent_brand_id uuid);
  CREATE TABLE managed_creators(id int, tenant_id uuid, brand text, creator_id uuid,
    reporting_start_date date, archived_at timestamptz, tags text[],
    account_1 text, account_2 text, account_3 text, account_4 text, account_5 text,
    account_6 text, account_7 text, account_8 text, account_9 text, account_10 text);
  CREATE TABLE tiktok_accounts(tenant_id uuid, creator_id uuid, tiktok_username text);
  CREATE TABLE video_performance(tenant_id uuid, brand text, video_id text, creator_name text,
    post_date timestamp, report_date date, period_type text, gmv numeric);
  CREATE TABLE ingestion_runs(id uuid DEFAULT gen_random_uuid(), brand_slug text, target_table text,
    report_date date, status text, rows_expected int, rows_written int,
    started_at timestamptz, finished_at timestamptz, error text);
  INSERT INTO brands_v2 VALUES
    ('${id(1)}','${tenant}','alpha',false,null),
    ('${id(2)}','${tenant}','beta',false,null),
    ('${id(3)}','${tenant}','umbrella',true,null),
    ('${id(4)}','${tenant}','leaf',false,'${id(3)}'),
    ('${id(5)}','${foreign}','alpha',false,null);
  INSERT INTO managed_creators(id,tenant_id,brand,creator_id,reporting_start_date,archived_at,tags,account_1) VALUES
    (1,'${tenant}','alpha','${id(10)}',null,null,null,' @@CASE '),
    (2,'${tenant}','alpha',null,'2026-09-02',null,null,'new'),
    (3,'${tenant}','alpha',null,null,'2026-09-02',null,'departed'),
    (4,'${tenant}','alpha','${id(40)}',null,null,ARRAY['reporting-exclude:2026-09'],'excluded'),
    (5,'${tenant}','beta',null,null,null,null,'beta-only'),
    (6,'${tenant}','umbrella',null,null,null,null,'umbrella-creator'),
    (7,'${foreign}','alpha',null,null,null,null,'foreign-member'),
    (8,'${tenant}','alpha','${id(40)}',null,null,null,'excluded-alias'),
    (9,'${tenant}','alpha',null,null,null,null,'excluded');
  INSERT INTO tiktok_accounts VALUES
    ('${tenant}','${id(10)}','renamed'),
    ('${foreign}','${id(10)}','foreign-account'),
    ('${tenant}','${id(40)}','linked-excluded-alias');
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
`);
const migration = readFileSync('supabase/migrations/20261029204703_published_video_counts.sql', 'utf8');
await db.exec(migration);
await db.exec(readFileSync('supabase/migrations/20261029205550_published_video_counts_performance.sql', 'utf8'));
const signature = 'public.get_published_video_counts_workspace(uuid,text[],date,date,date,date,text[])';
for (const role of ['anon', 'authenticated']) {
  assert.equal((await db.query(`SELECT has_function_privilege('${role}','${signature}','execute') AS allowed`)).rows[0].allowed, false);
}
assert.equal((await db.query(`SELECT prosecdef FROM pg_proc WHERE oid='${signature}'::regprocedure`)).rows[0].prosecdef, false);

async function add(brand, video, handle, posted, report = '2026-09-02', sourceTenant = tenant, period = 'daily') {
  await db.query(`INSERT INTO video_performance VALUES($1,$2,$3,$4,$5,$6,$7,0)`, [sourceTenant, brand, video, handle, posted, report, period]);
}
await add('alpha', 'unique', '@CaSe', '2026-09-02');
await add('alpha', 'unique', 'case', '2026-09-02', '2026-09-03');
await add('alpha', 'unique', 'renamed', '2026-09-03'); // same ID across date and name changes
await add('alpha', 'unique', 'case', '2026-09-02'); // duplicate product row
await add('alpha', 'shared', 'case', '2026-09-02');
await add('beta', 'shared', 'beta-only', '2026-09-02');
await add('beta', 'beta-video', 'beta-only', '2026-09-02');
await add('alpha', 'foreign-brand-member', 'beta-only', '2026-09-02');
await add('alpha', 'before-start', 'new', '2026-09-01');
await add('alpha', 'at-start', 'new', '2026-09-02');
await add('alpha', 'before-archive', 'departed', '2026-09-01');
await add('alpha', 'at-archive', 'departed', '2026-09-02');
await add('alpha', 'blocked-current', 'excluded', '2026-09-02');
await add('alpha', 'blocked-alias', 'excluded-alias', '2026-09-02');
await add('alpha', 'blocked-linked-alias', 'linked-excluded-alias', '2026-09-02');
await add('alpha', 'unblocked-prior', 'excluded', '2026-08-31');
await add('alpha', 'prior', 'case', '2026-08-31');
await add('alpha', 'old-earning', 'case', '2026-08-28');
await add('alpha', 'future', 'case', '2026-09-04');
await add('alpha', 'end-boundary', 'case', '2026-09-03T23:59:59');
await add('alpha', 'unknown-date', 'case', null);
await add('alpha', '', 'case', '2026-09-02');
await add('alpha', '  ', 'case', '2026-09-02');
await add('alpha', 'weekly-copy', 'case', '2026-09-02', '2026-09-02', tenant, 'weekly');
await add('alpha', 'foreign-source', 'case', '2026-09-02', '2026-09-02', foreign);
await add('alpha', 'foreign-member', 'foreign-member', '2026-09-02');
await add('alpha', 'foreign-account', 'foreign-account', '2026-09-02');
await add('leaf', 'leaf-video', 'umbrella-creator', '2026-09-02');

const read = async (slugs, readTenant = tenant) => (await db.query(
  `SELECT public.get_published_video_counts_workspace($1,$2,'2026-09-01','2026-09-03','2026-08-29','2026-08-31') AS result`,
  [readTenant, slugs],
)).rows[0].result;
await db.exec('SET ROLE service_role');
let result = await read(['alpha', 'beta', 'umbrella']);
assert.equal(result.total, 7, 'Global total deduplicates shared ID across brands and renames/days/products');
assert.equal(result.priorTotal, 2, 'Prior end-month exclusions are independent of current month');
assert.equal(result.brands.find(b => b.slug === 'alpha').count, 5);
assert.equal(result.brands.find(b => b.slug === 'beta').count, 2);
assert.equal(result.brands.find(b => b.slug === 'umbrella').count, 1);
assert.equal(result.currentComplete, false, 'Rows alone do not certify ingestion coverage');
assert.equal(result.priorComplete, false);
assert.equal(result.storeTotal, 15, 'Whole-shop scope retains unmanaged and excluded creators, excluding unknown IDs/dates and foreign facts');
assert.deepEqual(await read([]), { total: 0, priorTotal: 0, storeTotal: 0, priorStoreTotal: 0, currentComplete: false, priorComplete: false, brands: [] });
await assert.rejects(read(['not-in-tenant']), /scope is invalid/);
await assert.rejects(read(null), /scope or dates are invalid/);
await db.exec('RESET ROLE');
await db.exec(`INSERT INTO brands_v2 VALUES('${id(7)}','${tenant}','orphan-umbrella',true,null);
  INSERT INTO managed_creators(id,tenant_id,brand,account_1) VALUES(10,'${tenant}','orphan-umbrella','own-creator');`);
await add('orphan-umbrella', 'own-video', 'own-creator', '2026-09-02');
await db.exec('SET ROLE service_role');
assert.equal((await read(['orphan-umbrella'])).total, 1, 'Umbrella without child stores uses its own data, matching expandSlugs');
await db.exec('RESET ROLE');
await db.exec(`INSERT INTO brands_v2 VALUES('${id(6)}','${tenant}','leaf-two',false,'${id(3)}');`);
await add('leaf-two', 'leaf-two-video', 'umbrella-creator', '2026-09-02');
await db.exec('SET ROLE service_role');
const childResult = (await db.query(
  `SELECT public.get_published_video_counts_workspace($1,ARRAY['umbrella','leaf'],'2026-09-01','2026-09-03','2026-08-29','2026-08-31',ARRAY['leaf']) AS result`, [tenant],
)).rows[0].result;
assert.equal(childResult.total, 1, 'A child-store client report may use its parent roster without widening to sibling stores');
assert.equal(childResult.storeTotal, 1);
assert.equal((await read(['umbrella'])).total, 2, 'Unrestricted umbrella includes both stores');
assert.equal((await db.query(
  `SELECT public.get_published_video_counts_workspace($1,ARRAY['umbrella'],'2026-09-01','2026-09-03','2026-08-29','2026-08-31',ARRAY[]::text[]) AS result`, [tenant],
)).rows[0].result.total, 0, 'Empty data-store intersection cannot widen');
await db.exec('RESET ROLE');
// Only beta has an unambiguous slug. Every day requires a finished full-file run
// and actual stored rows; a newer failure invalidates otherwise good evidence.
for (const day of ['2026-09-01', '2026-09-02', '2026-09-03']) {
  await add('beta', null, 'filler', null, day);
  await db.query(`INSERT INTO ingestion_runs(brand_slug,target_table,report_date,status,rows_expected,rows_written,started_at,finished_at)
    SELECT 'beta','video_performance',$1,'complete',count(*)::int,count(*)::int,'2026-10-01','2026-10-01'
    FROM video_performance WHERE tenant_id=$2 AND brand='beta' AND report_date=$1 AND period_type='daily'`, [day, tenant]);
}
await db.exec('SET ROLE service_role');
assert.equal((await read(['beta'])).currentComplete, true);
await db.exec('RESET ROLE');
await db.exec(`INSERT INTO ingestion_runs(brand_slug,target_table,report_date,status,rows_expected,rows_written,started_at)
  VALUES('beta','video_performance','2026-09-02','partial',9000,2,'2026-09-01'); SET ROLE service_role;`);
assert.equal((await read(['beta'])).currentComplete, false, 'An earlier larger expected file is not repaired by a smaller completed file');
await db.exec(`RESET ROLE; DELETE FROM ingestion_runs WHERE rows_expected=9000;`);
await db.exec(`UPDATE ingestion_runs SET rows_expected=1,rows_written=1 WHERE brand_slug='beta' AND report_date='2026-09-02'; SET ROLE service_role;`);
assert.equal((await read(['beta'])).currentComplete, false, 'An insert-only repair subset is not evidence for a complete daily file');
await db.exec('RESET ROLE');
await db.exec(`INSERT INTO ingestion_runs(brand_slug,target_table,report_date,status,rows_expected,rows_written,started_at)
  VALUES('beta','video_performance','2026-09-02','partial',100,2,'2026-10-02'); SET ROLE service_role;`);
assert.equal((await read(['beta'])).currentComplete, false);
assert.equal((await read(['alpha'])).currentComplete, false, 'Tenant-ambiguous legacy ledger is not trusted');
await db.exec('RESET ROLE');
// A parent and its child can both map to one data store. Coverage must count
// that store's actual rows once, including rows without known publication dates.
for (const day of ['2026-09-01', '2026-09-02', '2026-09-03']) {
  await add('leaf', null, 'filler', null, day);
  await db.query(`INSERT INTO ingestion_runs(brand_slug,target_table,report_date,status,rows_expected,rows_written,started_at,finished_at)
    SELECT 'leaf','video_performance',$1,'complete',count(*)::int,count(*)::int,'2026-10-01','2026-10-01'
    FROM video_performance WHERE tenant_id=$2 AND brand='leaf' AND report_date=$1 AND period_type='daily'`, [day, tenant]);
}
const scenarios = [
  { slugs: ['alpha'], start: '2026-09-01', end: '2026-09-30', priorStart: '2026-08-02', priorEnd: '2026-08-31', data: null },
  { slugs: ['alpha', 'beta', 'umbrella'], start: '2026-09-01', end: '2026-09-03', priorStart: '2026-08-29', priorEnd: '2026-08-31', data: null },
  { slugs: ['umbrella', 'leaf'], start: '2026-09-01', end: '2026-09-03', priorStart: '2026-08-29', priorEnd: '2026-08-31', data: ['leaf'] },
  { slugs: ['umbrella'], start: '2026-09-01', end: '2026-09-03', priorStart: '2026-09-02', priorEnd: '2026-09-04', data: null },
  { slugs: ['umbrella'], start: '2026-09-01', end: '2026-09-03', priorStart: '2026-08-29', priorEnd: '2026-08-31', data: [] },
  { slugs: [], start: '2026-09-01', end: '2026-09-03', priorStart: '2026-08-29', priorEnd: '2026-08-31', data: null },
];
const readScenario = async s => (await db.query(
  `SELECT public.get_published_video_counts_workspace($1,$2,$3,$4,$5,$6,$7) AS result`,
  [tenant, s.slugs, s.start, s.end, s.priorStart, s.priorEnd, s.data],
)).rows[0].result;
await db.exec('SET ROLE service_role');
const beforeScopedCoverage = [];
for (const scenario of scenarios) beforeScopedCoverage.push(await readScenario(scenario));
assert.equal(beforeScopedCoverage[2].currentComplete, true);
await db.exec('RESET ROLE');
await db.exec(readFileSync('supabase/migrations/20261029233148_published_video_scoped_coverage_counts.sql', 'utf8'));
await db.exec('SET ROLE service_role');
for (let i = 0; i < scenarios.length; i++) {
  assert.deepEqual(await readScenario(scenarios[i]), beforeScopedCoverage[i],
    'Scoped live coverage preserves the full count and evidence response for months, portfolios, duplicate parent/child stores, overlapping windows and empty scopes');
}
await db.close();

let rpcCalls = 0;
let fakeResponse = { data: result, error: null };
let rejectedRequest = null, clientFailure = null, lastArgs = null;
let diagnosticNow = 1000;
class DiagnosticDate extends Date { static now() { return diagnosticNow; } }
const diagnostics = [];
const api = {};
runInNewContext(ts.transpileModule(readFileSync('src/lib/data/published-videos.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports: api, AbortSignal, Date: DiagnosticDate,
  console: { error: (...items) => diagnostics.push(items) },
  require: path => {
    if (path === 'server-only') return {};
    if (path.endsWith('/supabase/server')) return { createAdminClient: async () => {
      if (clientFailure) throw clientFailure;
      return { rpc(name, args) {
        assert.equal(name, 'get_published_video_counts_workspace');
        assert.equal(args.p_tenant_id, tenant);
        lastArgs = args;
        rpcCalls++;
        return { abortSignal: async () => {
          diagnosticNow += 37;
          if (rejectedRequest) throw rejectedRequest;
          return fakeResponse;
        } };
      } };
    } };
    throw new Error(path);
  },
});
const input = { tenantId: tenant, rosterSlugs: ['alpha', 'beta', 'umbrella'], start: '2026-09-01', end: '2026-09-03', priorStart: '2026-08-29', priorEnd: '2026-08-31' };
assert.equal((await api.getPublishedVideoCounts(input)).total, 7);
await api.getPublishedVideoCounts({ ...input, rosterSlugs: [] });
assert.equal(rpcCalls, 1, 'Empty scope never issues an all-brand query');
await assert.rejects(api.getPublishedVideoCounts({ ...input, start: '2026-02-30' }), /scope or dates are invalid/);
await assert.rejects(api.getPublishedVideoCounts({ ...input, rosterSlugs: ['alpha', null] }), /scope or dates are invalid/);
await assert.rejects(api.getPublishedVideoCounts({ ...input, dataSlugs: [1] }), /scope or dates are invalid/);
assert.equal(rpcCalls, 1, 'Malformed scope fails before a privileged request');
assert.equal(diagnostics.length, 0, 'Successful or invalid-input reads do not create failure logs');
const privateDetails = 'PRIVATE_PROVIDER_DETAILS_do_not_log';
fakeResponse = { data: null, error: { code: '57014', message: privateDetails, details: `${privateDetails}/secret`, hint: privateDetails } };
await assert.rejects(api.getPublishedVideoCounts(input), /could not be loaded/);
let diagnostic = diagnostics.at(-1)[1];
assert.equal(diagnostics.at(-1)[0], '[published-videos] count read failed');
assert.equal(diagnostic.stage, 'rpc');
assert.equal(diagnostic.code, '57014', 'Statement timeout is distinguishable from an empty count');
assert.equal(diagnostic.elapsedMs, 37);
assert.equal(diagnostic.rosterBrandCount, 3);
assert.equal(diagnostic.dataStoreCount, null);
for (const key of ['start', 'end', 'priorStart', 'priorEnd']) assert.equal(diagnostic[key], input[key]);
assert.equal(JSON.stringify(diagnostics).includes(privateDetails), false, 'Raw provider messages, details and hints stay out of logs');
assert.equal(JSON.stringify(diagnostics).includes(tenant), false, 'Tenant IDs are not logged');
fakeResponse = { data: null, error: { code: 'PGRST202', message: privateDetails } };
await assert.rejects(api.getPublishedVideoCounts({ ...input, rosterSlugs: [' alpha ', 'alpha', 'beta', 'umbrella'], dataSlugs: [' alpha ', 'alpha', ' beta '] }), /could not be loaded/);
diagnostic = diagnostics.at(-1)[1];
assert.equal(diagnostic.code, 'PGRST202');
assert.equal(diagnostic.rosterBrandCount, 3);
assert.equal(diagnostic.dataStoreCount, 2);
assert.deepEqual(Array.from(lastArgs.p_data_slugs), ['alpha', 'beta']);
rejectedRequest = { name: 'TimeoutError', code: `secret/${privateDetails}`, message: privateDetails, raw: { token: privateDetails } };
await assert.rejects(api.getPublishedVideoCounts(input), error => error.message === 'Published video counts could not be loaded.');
assert.equal(diagnostics.at(-1)[1].code, 'CLIENT_TIMEOUT');
assert.equal(diagnostics.at(-1)[1].elapsedMs, 37);
rejectedRequest = new Error(privateDetails);
await assert.rejects(api.getPublishedVideoCounts(input), error => !error.message.includes(privateDetails));
assert.equal(diagnostics.at(-1)[1].code, 'RPC_REQUEST_FAILED');
rejectedRequest = null;
clientFailure = new Error(privateDetails);
await assert.rejects(api.getPublishedVideoCounts(input), error => error.message === 'Published video counts could not be loaded.');
assert.equal(diagnostics.at(-1)[1].stage, 'client');
assert.equal(diagnostics.at(-1)[1].code, 'CLIENT_INIT_FAILED');
clientFailure = null;
fakeResponse = { data: { ...result, total: null }, error: null };
await assert.rejects(api.getPublishedVideoCounts(input), /response is invalid/);
assert.equal(diagnostics.at(-1)[1].stage, 'response');
assert.equal(diagnostics.at(-1)[1].code, 'INVALID_RESPONSE');
fakeResponse = { data: { ...result, brands: [null] }, error: null };
await assert.rejects(api.getPublishedVideoCounts(input), /response is invalid/);
fakeResponse = { data: { ...result, brands: result.brands.slice(1) }, error: null };
await assert.rejects(api.getPublishedVideoCounts(input), /scope is incomplete/);
assert.equal(diagnostics.at(-1)[1].code, 'SCOPE_MISMATCH');
assert.equal(JSON.stringify(diagnostics).includes(privateDetails), false);
const beforePartial = diagnostics.length;
fakeResponse = { data: { total: 469, priorTotal: 335, storeTotal: 900, priorStoreTotal: 800,
  currentComplete: false, priorComplete: false, brands: [{ slug: 'peach_slices', count: 469, priorCount: 335,
    storeCount: 900, priorStoreCount: 800, currentComplete: false, priorComplete: false }] }, error: null };
const partialMonth = await api.getPublishedVideoCounts({ ...input, rosterSlugs: ['peach_slices'],
  start: '2026-10-01', end: '2026-10-27', priorStart: '2026-09-04', priorEnd: '2026-09-30' });
assert.equal(partialMonth.total, 469, 'The reported monthly window is valid and partial coverage still returns its recorded count');
assert.equal(partialMonth.priorTotal, 335);
assert.equal(partialMonth.currentComplete, false);
assert.equal(diagnostics.length, beforePartial, 'Incomplete coverage is data, not a failed RPC');
console.log('PASS published videos: tenant/brand membership, umbrella stores, post dates, unique IDs, no-sales videos, exclusion periods, conservative ingestion coverage, service-only access and unavailable reads');
console.log('PASS published video diagnostics: safe SQL/request codes, elapsed timing, date windows, normalized scope sizes, generic transport errors, malformed response handling and valid partial monthly counts');
