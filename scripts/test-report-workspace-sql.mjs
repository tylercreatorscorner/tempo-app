process.on('uncaughtException', err => { console.error(err.message, err.detail ?? '', err.where ?? ''); process.exit(1); });
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222';
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE tenants(id uuid PRIMARY KEY); INSERT INTO tenants VALUES ('${a}'),('${b}');
CREATE TABLE user_profiles(user_id uuid, email text, tenant_id uuid);
CREATE TABLE client_reports(id uuid, token text, brand_slug text, created_by text, snapshot jsonb, created_at timestamptz, revoked_at timestamptz);
CREATE TABLE agency_reports(id uuid, token text, created_by text, snapshot jsonb, created_at timestamptz);
CREATE TABLE report_log(id uuid, brand_slug text, created_by text, created_at timestamptz);`);
const schema=JSON.parse(readFileSync('docs/report-source-schema.json','utf8'));
for(const table of new Set(schema.map(r=>r.table_name))) {
  const columns=schema.filter(r=>r.table_name===table).map(r=>`"${r.column_name}" ${r.udt_name==='_text'?'text[]':r.udt_name}`);
  await db.exec(`CREATE TABLE ${table} (${columns.join(',')});`);
}
await db.exec(`INSERT INTO brands_v2(id,tenant_id,slug,name,is_archived) VALUES ('${a}','${a}','shared','Our brand',false);
INSERT INTO user_profiles VALUES ('${a}','owner@fixture.invalid','${a}');
INSERT INTO client_reports(id,token,brand_slug,created_by,snapshot) VALUES ('${a}','preserved-token','shared','owner@fixture.invalid','{"frozen":true}'),('${b}','unresolved-token','missing','unknown@fixture.invalid','{"frozen":true}');
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT(token), UPDATE(snapshot) ON client_reports TO authenticated;`);
await db.exec('CREATE TABLE retainer_history(id integer,creator_id integer,new_retainer numeric,effective_date date);');
await db.exec(readFileSync('docs/report-retainer-baseline.sql','utf8'));
const migration=readdirSync('supabase/migrations').find(n=>n.endsWith('_report_workspace_ownership.sql'));
await db.exec(readFileSync('supabase/migrations/'+migration,'utf8'));
assert.deepEqual((await db.query('SELECT token,tenant_id,snapshot FROM client_reports ORDER BY token')).rows,[
  {token:'preserved-token',tenant_id:a,snapshot:{frozen:true}}, {token:'unresolved-token',tenant_id:null,snapshot:{frozen:true}},
]);
assert.equal((await db.query("SELECT has_column_privilege('authenticated','client_reports','token','SELECT') ok")).rows[0].ok,false);
const calls={
 get_brand_client_report_agg:"ARRAY['shared'],ARRAY['shared'],'2026-08-01','2026-08-31','2026-07-01','2026-07-31'",
 get_brand_client_report_counts:"ARRAY['shared'],ARRAY['shared'],'2026-08-01','2026-08-31','2026-07-01','2026-07-31'",
 get_brand_client_report_granular:"ARRAY['shared'],ARRAY['shared'],'2026-08-01','2026-08-31'",
 get_brand_client_report_managed_split:"ARRAY['shared'],ARRAY['shared'],'2026-08-01','2026-08-31','2026-07-01','2026-07-31'",
 get_brand_client_report_movers:"ARRAY['shared'],ARRAY['shared'],'2026-08-01','2026-08-31','2026-07-01','2026-07-31',8",
 get_brand_report_extras:"ARRAY['shared'],'2026-08-01','2026-08-31','2026-07-01','2026-07-31',NULL",
 get_brand_report_extras_windowed:"ARRAY['shared'],'2026-08-01','2026-08-31','2026-07-01','2026-07-31',NULL",
 get_brand_report_signings:"ARRAY['shared'],'2026-08-31'",
 get_brand_roster_weekly:"ARRAY['shared'],ARRAY['shared'],'2026-08-31'",
 get_agency_portfolio:"'2026-08-01','2026-08-31','2026-07-01','2026-07-31'",
 get_agency_coverage_gaps:"'2026-08-01','2026-08-31'",
 get_agency_roster_quality:'',get_agency_trend:"'2026-08-01','2026-08-31'",
 get_reporting_coverage:"ARRAY['shared'],14",
};
async function seed(tenant,amount,name){
 await db.exec(`INSERT INTO creator_performance(tenant_id,brand,report_date,period_type,creator_name,gmv,orders,items_sold,videos,est_commission) VALUES ('${tenant}','shared','2026-08-15','daily','${name}',${amount},1,1,1,1);
 INSERT INTO video_performance(tenant_id,brand,report_date,period_type,creator_name,video_id,product_id,video_title,product_name,gmv,orders,views) VALUES ('${tenant}','shared','2026-08-15','daily','${name}','12345','product','title','product',${amount},1,10);
 INSERT INTO daily_video_product_stats(tenant_id,brand_id,report_date,tiktok_username,video_id,post_date,gmv,orders) VALUES ('${tenant}','${tenant}','2026-08-15','${name}','12345','2026-08-10',${amount},1);
 INSERT INTO retainer_history VALUES (${tenant===a?1:2},${tenant===a?1:2},10,'2026-08-01');
 INSERT INTO managed_creators(id,tenant_id,creator_id,brand,real_name,account_1,retainer,added_at,cc_start_date,employment_status) VALUES (${tenant===a?1:2},'${tenant}','${tenant}','shared','${name}','${name}',10,'2026-08-01','2026-08-01','active');`);
}
await db.exec(`CREATE VIEW managed_brand_handles AS
 SELECT DISTINCT mc.brand AS brand_slug, lower(btrim(regexp_replace(h.handle,'^@',''))) handle
 FROM managed_creators mc CROSS JOIN LATERAL (VALUES (mc.account_1),(mc.account_2),(mc.account_3),(mc.account_4),(mc.account_5),(mc.account_6),(mc.account_7),(mc.account_8),(mc.account_9),(mc.account_10)) h(handle)
 WHERE h.handle IS NOT NULL AND btrim(h.handle)<>''
 UNION SELECT DISTINCT mc.brand,lower(btrim(regexp_replace(t.tiktok_username,'^@','')))
 FROM managed_creators mc JOIN tiktok_accounts t ON t.creator_id=mc.creator_id
 WHERE t.tiktok_username IS NOT NULL AND btrim(t.tiktok_username)<>'';`.replaceAll('\n+','\n'));
const baseline=[...JSON.parse(readFileSync('docs/report-function-baseline.json','utf8')),...JSON.parse(readFileSync('docs/agency-function-baseline.json','utf8'))];
for(const definition of baseline.filter(d=>d.proname!=='get_brand_lifetime')) await db.exec(definition.definition);
await seed(a,100,'ourcreator');
async function snapshot(tenant){const result={};for(const [name,args] of Object.entries(calls)) {
 result[name]=(await db.query(`SELECT * FROM ${name}_workspace('${tenant}'${args?','+args:''})`)).rows;
 }return result;}
const before=await snapshot(a);
const extrasArgs = [
 "NULL,'2026-08-01','2026-08-31','2026-07-01','2026-07-31',NULL",
 "ARRAY[]::text[],'2026-08-01','2026-08-31','2026-07-01','2026-07-31',NULL",
 "ARRAY['shared','missing'],'2026-08-01','2026-08-31','2026-07-01','2026-07-31',ARRAY['12345']",
 "ARRAY['shared'],'2026-07-01','2026-07-31','2026-06-01','2026-06-30',ARRAY[]::text[]",
];
const extrasForCases=()=>Promise.all(extrasArgs.map(args=>db.query(`SELECT get_brand_report_extras_workspace('${a}',${args}) AS data`).then(r=>r.rows)));
const extrasBefore=await extrasForCases();
await db.exec(readFileSync('supabase/migrations/20260924145911_report_extras_custom_plan.sql','utf8'));
assert.deepEqual(await snapshot(a),before,'Custom report plan must preserve the full report snapshot');
for(let i=0;i<7;i++) assert.deepEqual(await extrasForCases(),extrasBefore,'Repeated calls preserve null, empty, multi-brand and historical-window semantics');
assert.ok((await db.query("SELECT proconfig FROM pg_proc WHERE proname='get_brand_report_extras_workspace'")).rows[0].proconfig.includes('plan_cache_mode=force_custom_plan'));
for(const [name,args] of Object.entries(calls)) {
 const originalArgs=name==='get_reporting_coverage'?'14':args;
 const expected=(await db.query(`SELECT * FROM ${name}(${originalArgs})`)).rows;
 const normalize=rows=>rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/_workspace$/,''),value])));
 assert.deepEqual(normalize(before[name]),expected,`Original legitimate calculation parity: ${name}`);
}
assert.equal(before.get_brand_client_report_agg[0].get_brand_client_report_agg_workspace.totals.gmv,100);
await db.exec(`INSERT INTO brands_v2(id,tenant_id,slug,name,is_archived) VALUES ('${b}','${b}','shared','Foreign brand',false);`);
await seed(b,99999,'foreigncreator');
assert.deepEqual(await snapshot(a),before,'Every report component must remain unchanged after overlapping foreign facts arrive');
const foreign=await snapshot(b);
assert.equal(foreign.get_brand_client_report_agg[0].get_brand_client_report_agg_workspace.totals.gmv,99999);
const grants=(await db.query(`SELECT proname,has_function_privilege('authenticated',oid,'EXECUTE') client,has_function_privilege('service_role',oid,'EXECUTE') service,prosecdef FROM pg_proc WHERE proname LIKE '%_workspace'`)).rows;
assert.equal(grants.length,14);assert.ok(grants.every(r=>!r.client&&r.service&&!r.prosecdef));
console.log('PASS actual migration: frozen-link ownership backfill, unresolved ownership, column revokes, service-only invoker functions');
console.log('PASS original calculation parity with populated creator, video, granular roster and retainer fixtures');
console.log('PASS all 14 scoped SQL calculations: legitimate populated report, overlapping foreign brand/facts cannot alter any component');
// Exercise agreement cutover against the same populated report fixture.
await db.exec(`ALTER TABLE brands_v2 ADD PRIMARY KEY(id);
CREATE TABLE IF NOT EXISTS creators_v2(id uuid PRIMARY KEY,tenant_id uuid);
CREATE TABLE IF NOT EXISTS creator_brands(id uuid,creator_id uuid,brand_id uuid,tenant_id uuid);
INSERT INTO creators_v2(id,tenant_id) VALUES ('${a}','${a}');
UPDATE managed_creators SET creator_id='${a}' WHERE tenant_id='${a}';`);
await db.exec(readFileSync('supabase/migrations/20260918010833_creator_agreement_ledger.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20260918013822_agreement_reader_cutover.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20260918093354_agreement_roster_write_guard.sql','utf8'));
const beforeLedger=(await db.query(`SELECT get_brand_client_report_granular_workspace('${a}',ARRAY['shared'],ARRAY['shared'],'2026-08-01','2026-08-31') as data`)).rows[0].data;
assert.equal(beforeLedger.roster.monthlyRetainerBudget,before.get_brand_client_report_granular[0].get_brand_client_report_granular_workspace.roster.monthlyRetainerBudget);
const ledgerState={schemaVersion:1,kind:'monthly',start:'2026-08-01',deadline:null,finalDate:null,firstPeriodEnd:'2026-08-31',rules:[{from:'2026-08-01',through:null,terms:{feeCents:80000,requiredPosts:20,renewal:'automatic'}}],periods:[{start:'2026-08-01',through:'2026-08-31',revisions:[{version:1,segments:[{from:'2026-08-01',through:'2026-08-31',terms:{feeCents:80000,requiredPosts:20}}]}]}]};
await db.query('INSERT INTO creator_agreement_ledgers(id,tenant_id,creator_id,brand_id,starts_on,version,state) VALUES($1,$1,$1,$1,$2,1,$3)',[a,'2026-08-01',JSON.stringify(ledgerState)]);
const corrected=(await db.query(`SELECT get_brand_client_report_granular_workspace('${a}',ARRAY['shared'],ARRAY['shared'],'2026-08-01','2026-08-31') as data`)).rows[0].data;
assert.equal(corrected.creators[0].retainer,800);assert.equal(corrected.creators[0].quota,20);
assert.equal(corrected.creators[0].agreement.revision,1);assert.equal(corrected.roster.monthlyRetainerBudget,800);
assert.equal((await db.query(`SELECT get_creator_agreement_terms('${b}','${a}','${a}','2026-08-31') as data`)).rows[0].data,null);
await assert.rejects(db.query(`SELECT get_creator_agreement_terms('${a}','${a}','${a}','2026-09-01')`),/renewal is pending/);
assert.deepEqual((await db.query(`SELECT snapshot FROM client_reports WHERE token='preserved-token'`)).rows[0].snapshot,{frozen:true});
await db.exec(`INSERT INTO creator_brands(creator_id,brand_id,tenant_id) VALUES('${a}','${a}','${a}'); ALTER TABLE managed_creators ADD COLUMN IF NOT EXISTS updated_by text;`);
const currentDate=(await db.query("select (now() at time zone 'America/Chicago')::date::text as day")).rows[0].day;
const endOfMonth=(await db.query("select (date_trunc('month',now() at time zone 'America/Chicago')+interval '1 month - 1 day')::date::text as day")).rows[0].day;
const currentState=structuredClone(ledgerState);
currentState.periods.push({start:currentDate,through:endOfMonth,revisions:[{version:1,segments:[{from:currentDate,through:endOfMonth,terms:{feeCents:90000,requiredPosts:25}}]}]});
await db.query('select save_creator_agreement_ledger($1,$1,$1,$1,$1,1,$2,$3,$4)',[a,'33333333-3333-4333-8333-333333333333',JSON.stringify({action:'change',reason:'Current terms revised'}),JSON.stringify(currentState)]);
assert.equal(Number((await db.query(`select retainer from managed_creators where tenant_id='${a}'`)).rows[0].retainer),900);
await assert.rejects(db.query(`update managed_creators set retainer=987 where tenant_id='${a}'`),/Agreements tab/);
assert.equal((await db.query(`SELECT get_creator_agreement_terms('${a}','${a}','${a}','2026-08-31') as data`)).rows[0].data.retainer,800);
// Future term activation must run on its exact day, not wait for month-end.
const tomorrow=(await db.query("select ((now() at time zone 'America/Chicago')::date+1)::text as day")).rows[0].day;
const scheduled=structuredClone(currentState);
scheduled.rules.push({from:tomorrow,through:null,terms:{feeCents:95000,requiredPosts:25,renewal:'automatic'}});
await db.query('select save_creator_agreement_ledger($1,$1,$1,$1,$1,2,$2,$3,$4)',[a,'44444444-4444-4444-8444-444444444444',JSON.stringify({action:'change',reason:'Future terms'}),JSON.stringify(scheduled)]);
assert.equal((await db.query(`select renew_after::text as day from creator_agreement_ledgers where id='${a}'`)).rows[0].day,tomorrow);
assert.equal(Number((await db.query(`select retainer from managed_creators where tenant_id='${a}'`)).rows[0].retainer),900,'Scheduled terms do not change today');
assert.equal(corrected.creators[0].agreement.reportPeriodComparable,false,'Missing payment basis never fabricates an estimate');
// Browser UPDATE privilege must not require SELECT access to the private ledger.
await db.exec('GRANT UPDATE,SELECT ON managed_creators TO authenticated; SET ROLE authenticated;');
await assert.rejects(db.query(`update managed_creators set retainer=987 where tenant_id='${a}'`),/Agreements tab/);
await db.exec('RESET ROLE;');
await db.exec(readFileSync('supabase/migrations/20260918021757_agreement_agency_history.sql','utf8'));
const agencyAugust=(await db.query(`select get_agency_portfolio_workspace('${a}','2026-08-01','2026-08-31','2026-07-01','2026-07-31') as data`)).rows[0].data;
assert.equal(agencyAugust.brands.find(b=>b.slug==='shared').committedRetainer,800,'Agency history uses August terms despite a higher current roster fee');
console.log('PASS agency agreement history: selected-period fee independent of current mirror');
// New rows and relinked legacy rows must not bypass verified commercial terms.
await db.exec('GRANT INSERT ON managed_creators TO authenticated; SET ROLE authenticated;');
const insertRoster=(id,tenant,creator,fee,quota)=>db.query('insert into managed_creators(id,tenant_id,creator_id,brand,retainer,monthly_post_requirement) values($1,$2,$3,$4,$5,$6)',[id,tenant,creator,'shared',fee,quota]);
await assert.rejects(insertRoster(10,a,a,1,25),/Agreements tab/);
await assert.rejects(insertRoster(10,a,a,900,1),/Agreements tab/);
await assert.rejects(insertRoster(10,a,a,900,null),/Agreements tab/);
await insertRoster(10,a,a,900,25);
await assert.rejects(db.query(`update managed_creators set creator_id=null where id=10`),/agreement history/);
await insertRoster(11,a,null,1,1);
await assert.rejects(db.query(`update managed_creators set creator_id='${a}' where id=11`),/Agreements tab/);
await db.query(`update managed_creators set creator_id='${a}',retainer=900,monthly_post_requirement=25 where id=11`);
await insertRoster(12,b,a,1,1); // Same creator/slug in a different tenant is not this ledger.
await assert.rejects(db.query(`update managed_creators set tenant_id='${a}' where id=12`),/Agreements tab/);
await db.query(`update managed_creators set real_name='Updated display name' where id=10`);
await assert.rejects(db.query('select * from creator_agreement_ledgers'),/permission denied/);
await db.exec('RESET ROLE;');
assert.equal((await db.query("select has_function_privilege('authenticated','guard_ledger_roster_terms()','EXECUTE') allowed")).rows[0].allowed,false);
console.log('PASS roster INSERT and destination UPDATE guards: fee/quota mismatch, null quota, matching insert/relink, history identity protection, tenant isolation, unrelated edits and private ledger access');
console.log('PASS agreement report cutover: historical fee/quota, revision basis, foreign isolation, pending renewal and frozen report preserved');
await db.close();
