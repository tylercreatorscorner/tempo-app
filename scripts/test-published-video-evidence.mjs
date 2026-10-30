import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';

const db = new PGlite();
const tenant = '11111111-1111-4111-8111-111111111111';
const foreign = '22222222-2222-4222-8222-222222222222';
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
  CREATE TABLE brands_v2(id uuid,tenant_id uuid,slug text,is_umbrella boolean,parent_brand_id uuid);
  CREATE TABLE managed_creators(id int,tenant_id uuid,brand text,creator_id uuid,reporting_start_date date,archived_at timestamptz,tags text[],
    account_1 text,account_2 text,account_3 text,account_4 text,account_5 text,account_6 text,account_7 text,account_8 text,account_9 text,account_10 text);
  CREATE TABLE tiktok_accounts(tenant_id uuid,creator_id uuid,tiktok_username text);
  CREATE TABLE video_performance(tenant_id uuid,brand text,video_id text,creator_name text,post_date timestamp,report_date date,period_type text,gmv numeric);
  CREATE TABLE videos(tenant_id uuid,brand text,video_id text,video_name text,video_link text,post_date date);
  CREATE INDEX video_identity ON videos(video_id,brand);
  CREATE TABLE ingestion_runs(id uuid DEFAULT gen_random_uuid(),brand_slug text,target_table text,report_date date,status text,
    rows_expected int,rows_written int,started_at timestamptz,finished_at timestamptz,error text);
  INSERT INTO brands_v2 VALUES('${uuid(1)}','${tenant}','alpha',false,null),('${uuid(2)}','${tenant}','beta',false,null),
    ('${uuid(3)}','${tenant}','umbrella',true,null),('${uuid(4)}','${tenant}','leaf',false,'${uuid(3)}'),
    ('${uuid(5)}','${tenant}','leaf-two',false,'${uuid(3)}'),('${uuid(6)}','${foreign}','alpha',false,null),
    ('${uuid(7)}','${foreign}','secret',false,null);
  INSERT INTO managed_creators(id,tenant_id,brand,creator_id,reporting_start_date,archived_at,tags,account_1) VALUES
    (1,'${tenant}','alpha','${uuid(10)}',null,null,null,' @@CASE '),
    (2,'${tenant}','alpha',null,'2026-09-02',null,null,'new'),
    (3,'${tenant}','alpha',null,null,'2026-09-02',null,'departed'),
    (4,'${tenant}','alpha','${uuid(40)}',null,null,ARRAY['reporting-exclude:2026-09'],'excluded'),
    (5,'${tenant}','alpha','${uuid(40)}',null,null,null,'excluded-alias'),
    (6,'${tenant}','alpha',null,null,null,null,'excluded'),
    (7,'${tenant}','beta',null,null,null,null,'beta-only'),
    (8,'${tenant}','umbrella',null,null,null,null,'umbrella-creator'),
    (9,'${tenant}','alpha',null,null,null,null,'bad handle'),
    (10,'${foreign}','alpha',null,null,null,null,'foreign-member');
  INSERT INTO tiktok_accounts VALUES('${tenant}','${uuid(10)}','renamed'),('${tenant}','${uuid(40)}','linked-excluded-alias'),
    ('${foreign}','${uuid(10)}','foreign-account');
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
`);
await db.exec(readFileSync('supabase/migrations/20261029233148_published_video_scoped_coverage_counts.sql', 'utf8'));
await db.exec(readFileSync('supabase/migrations/20261029234530_report_published_video_evidence.sql', 'utf8'));
const signature = 'public.get_report_published_video_evidence_workspace(uuid,text[],text[],date,date,text[])';
for (const role of ['anon', 'authenticated']) {
  assert.equal((await db.query(`SELECT has_function_privilege('${role}','${signature}','execute') allowed`)).rows[0].allowed, false);
}
assert.equal((await db.query(`SELECT prosecdef FROM pg_proc WHERE oid='${signature}'::regprocedure`)).rows[0].prosecdef, false);
const add = (id, handle, posted = '2026-09-02', brand = 'alpha', sourceTenant = tenant, period = 'daily') =>
  db.query(`INSERT INTO video_performance VALUES($1,$2,$3,$4,$5,'2026-09-03',$6,0)`, [sourceTenant, brand, id, handle, posted, period]);
const firstId = '7701542516230819102';
await add(firstId, '@CaSe');
await add(firstId, 'renamed', '2026-09-03');
await add(firstId, 'case'); // repeat daily/product rows
await add(' '+firstId+' ', 'case'); // exactly the counter's trimmed-ID normalization
await add('7701542516230819103', 'case');
await add('7701542516230819103', 'beta-only', '2026-09-02', 'beta'); // same ID across stores
await add('7701542516230819104', 'beta-only', '2026-09-02', 'beta');
await add('7701542516230819105', 'new');
await add('7701542516230819106', 'departed', '2026-09-01');
await add('unknown-id', 'bad handle');
await add('blocked', 'excluded');
await add('blocked-alias', 'excluded-alias');
await add('blocked-linked', 'linked-excluded-alias');
await add('before-start', 'new', '2026-09-01');
await add('at-archive', 'departed', '2026-09-02');
await add('unmanaged', 'not-on-roster');
await add('foreign-brand-member', 'beta-only');
await add('old-earning-video', 'case', '2026-08-31');
await add('future-video', 'case', '2026-09-04');
await add('missing-post-date', 'case', null);
await add('weekly-copy', 'case', '2026-09-02', 'alpha', tenant, 'weekly');
await add('foreign-fact', 'case', '2026-09-02', 'alpha', foreign);
await add('foreign-member-video', 'foreign-member');
await add('foreign-account-video', 'foreign-account');
await add('leaf-video', 'umbrella-creator', '2026-09-02', 'leaf');
await add('leaf-two-video', 'umbrella-creator', '2026-09-02', 'leaf-two');
await db.query(`INSERT INTO videos VALUES
  ($1,'alpha',$2,'A title','https://www.tiktok.com/@renamed/video/7701542516230819102','2026-09-02'),
  ($1,'alpha','7701542516230819103','Poisoned old URL','https://www.tiktok.com.evil.example/@case/video/7701542516230819103','2026-09-02'),
  ($3,'alpha','7701542516230819104','FOREIGN TITLE','https://www.tiktok.com/@foreign/video/7701542516230819104','2026-09-02')`,
[tenant, firstId, foreign]);
await db.exec('SET ROLE service_role');
const read = async ({ slugs = ['alpha'], data = null, handles = null, start = '2026-09-01', end = '2026-09-03' } = {}) =>
  (await db.query(`SELECT get_report_published_video_evidence_workspace($1,$2,$3,$4,$5,$6) result`,
    [tenant, slugs, data, start, end, handles])).rows[0].result;
const count = async (slugs, data = null) => (await db.query(
  `SELECT get_published_video_counts_workspace($1,$2,'2026-09-01','2026-09-03','2026-08-29','2026-08-31',$3) result`,
  [tenant, slugs, data],
)).rows[0].result;
const canonical = await read();
assert.equal(canonical.total, 5);
assert.equal(canonical.total, (await count(['alpha'])).total, 'Canonical evidence equals the actual counter result');
assert.equal(new Set(canonical.videos.map(v => v.videoId)).size, canonical.total);
assert.deepEqual(canonical.videos.find(v => v.videoId === firstId).qualifyingHandles, ['case', 'renamed']);
assert.equal(canonical.videos.find(v => v.videoId === firstId).videoId, firstId, 'Large IDs remain exact strings');
assert.equal(canonical.videos.find(v => v.videoId === 'unknown-id').watchUrl, null, 'Unlinkable counted identities are kept');
assert.equal(canonical.videos.find(v => v.videoId === '7701542516230819103').watchUrl,
  'https://www.tiktok.com/@case/video/7701542516230819103', 'Unsafe CDN/foreign hosts fall back to the counted identity');
const portfolio = await read({ slugs: ['alpha', 'beta', 'umbrella'] });
assert.equal(portfolio.total, (await count(['alpha', 'beta', 'umbrella'])).total);
assert.equal(portfolio.total, 8);
assert.equal(portfolio.videos.find(v => v.videoId === '7701542516230819104').title, null, 'Catalog enrichment is tenant scoped');
const child = await read({ slugs: ['leaf', 'umbrella'], data: ['leaf'] });
assert.equal(child.total, 1);
assert.equal(child.total, (await count(['leaf', 'umbrella'], ['leaf'])).total);
assert.equal((await read({ slugs: [] })).total, 0);
assert.equal((await read({ data: [] })).total, 0);
await assert.rejects(read({ slugs: ['secret'] }), /scope is invalid/);
await assert.rejects(read({ data: ['secret'] }), /scope is invalid/);

// Reconstruction uses ONLY frozen accounts and stores. Changes to the current
// roster, current monthly exclusions and current membership do not rewrite it.
const reconstructed = await read({ slugs: [], data: ['alpha'], handles: [' @EXCLUDED ', 'new', 'departed', 'not-on-roster'] });
assert.deepEqual(new Set(reconstructed.videos.map(v => v.videoId)), new Set([
  'blocked', '7701542516230819105', 'before-start', '7701542516230819106', 'at-archive', 'unmanaged',
]));
assert.equal((await read({ data: ['alpha'], handles: [] })).total, 0, 'Empty frozen handles never mean all creators');
assert.equal((await read({ data: [], handles: ['case'] })).total, 0);
await assert.rejects(read({ data: null, handles: ['case'] }), /scope or dates are invalid/);
await db.exec('RESET ROLE');
await db.exec(`INSERT INTO video_performance
  SELECT '${tenant}','alpha','bulk-'||n,'case','2026-09-02','2026-09-03','daily',0 FROM generate_series(1,1001) n; SET ROLE service_role;`);
const wide = await read();
assert.equal(wide.total, 1006);
assert.equal(wide.videos.length, 1006, 'A single JSON packet is not truncated by PostgREST row pagination');
assert.equal(wide.total, (await count(['alpha'])).total);
await db.close();

// Server loader and frozen-packet validator: no provider details or unknown
// private fields survive the public whitelist, and malformed packets fail closed.
let defaultReads = 0;
let response = { data: canonical, error: null };
let rpcArgs;
const client = { rpc(name, args) {
  assert.equal(name, 'get_report_published_video_evidence_workspace'); rpcArgs = args;
  return { abortSignal: async () => response };
} };
const api = {};
runInNewContext(ts.transpileModule(readFileSync('src/lib/data/published-video-evidence.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: api, URL, AbortSignal, Date,
  require: path => {
    if (path === 'server-only') return {};
    if (path.endsWith('/supabase/server')) return { createAdminClient: async () => { defaultReads++; return client; } };
    throw new Error(path);
  },
});
const input = { tenantId: tenant, rosterSlugs: ['alpha'], start: '2026-09-01', end: '2026-09-03' };
assert.equal((await api.getPublishedVideoEvidence(input, client)).total, 5);
assert.equal(defaultReads, 0, 'Snapshot tests can inject their authorized server client');
const polluted = { ...canonical, sourcePath: 'private/file.xlsx', videos: canonical.videos.map(v => ({ ...v, phone: '+1private', retainer: 999 })) };
const clean = api.parsePublishedVideoEvidence(polluted);
assert.equal('sourcePath' in clean, false);
assert.equal(clean.videos.some(v => 'phone' in v || 'retainer' in v), false);
assert.equal(defaultReads, 0, 'Frozen packet validation never queries source data');
for (const url of ['javascript:alert(1)', 'https://evil.example/video/'+firstId, 'https://www.tiktok.com.evil/@case/video/'+firstId,
  'https://user:password@www.tiktok.com/@case/video/'+firstId, 'https://www.tiktok.com/@case/video/999999',
  'https://www.tiktok.com:8443/@case/video/'+firstId]) {
  const packet = { ...canonical, videos: canonical.videos.map(v => v.videoId === firstId ? { ...v, watchUrl: url } : v) };
  assert.equal(api.parsePublishedVideoEvidence(packet).videos.find(v => v.videoId === firstId).watchUrl,
    'https://www.tiktok.com/@case/video/'+firstId);
}
for (const invalid of [null, { ...canonical, total: canonical.total + 1 }, { ...canonical, total: 250001 },
  { ...canonical, periodStart: '2026-02-30' }, { ...canonical, capturedAt: '7' },
  { ...canonical, videos: [canonical.videos[0], ...canonical.videos.slice(1).map((v, i) => i === 0 ? canonical.videos[0] : v)] },
  { ...canonical, videos: canonical.videos.map((v, i) => i === 0 ? { ...v, publishedAt: '2026-08-31' } : v) }]) {
  assert.throws(() => api.parsePublishedVideoEvidence(invalid), /could not be loaded/);
}
await assert.rejects(api.getPublishedVideoEvidence({ ...input, frozenHandles: ['case'] }, client), /could not be loaded/);
await assert.rejects(api.getPublishedVideoEvidence({ ...input, start: '2026-02-30' }, client), /could not be loaded/);
response = { data: { ...canonical, periodStart: '2026-08-31' }, error: null };
await assert.rejects(api.getPublishedVideoEvidence(input, client), /could not be loaded/);
response = { data: null, error: { message: 'PRIVATE PROVIDER DETAILS' } };
await assert.rejects(api.getPublishedVideoEvidence(input, client), error => error.message === 'Published video evidence could not be loaded.');
response = { data: { ...canonical, total: 0, videos: [] }, error: null };
await api.getPublishedVideoEvidence({ ...input, dataSlugs: ['alpha'], frozenHandles: [] }, client);
assert.equal(rpcArgs.p_frozen_handles.length, 0);
response = { data: canonical, error: null };
await assert.rejects(api.getPublishedVideoEvidence({ ...input, dataSlugs: ['alpha'], frozenHandles: ['case'] }, client), /could not be loaded/);
console.log('PASS published video evidence: canonical count parity, complete identity lists, creator aliases, frozen-roster reconstruction, strict scopes, URL safety, NULL link retention and private-field whitelisting');
