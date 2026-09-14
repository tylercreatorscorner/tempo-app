import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const tenant = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
await db.exec(`create role anon; create role authenticated; create role service_role;
create table brands_v2(slug text, tenant_id uuid);
create table creator_performance(creator_name text, tenant_id uuid, brand text, period_type text, report_date date, gmv numeric);
create table roster_creator_posts(handle text, brand_slug text, video_id text, post_date date);
insert into brands_v2 values ('alpha','${tenant}'),('beta','${other}'),('gamma','${tenant}');
insert into creator_performance values
('CaSe','${tenant}','alpha','daily','2026-01-01',0),
('case','${tenant}','alpha','daily','2026-01-02',12.5),
('case','${other}','alpha','daily','2026-01-02',9000),
('case','${tenant}','gamma','daily','2026-01-02',2.5),
('case','${tenant}','alpha','weekly','2026-01-02',1000),
('case','${tenant}','alpha','daily','2025-12-31',1000),
('other','${tenant}','alpha','daily','2026-01-02',1000);
insert into roster_creator_posts values ('case','alpha','video-1','2026-01-02'),('case','gamma','video-1','2026-01-02'),('case','beta','secret-video','2026-01-02');
grant select on all tables in schema public to service_role;`);
const file = readdirSync('supabase/migrations').find(name => name.endsWith('_creator_performance_history.sql'));
await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
const signature = 'public.get_creator_performance_history(uuid,text[],text[],date,date)';
for (const role of ['anon', 'authenticated']) assert.equal((await db.query(`select has_function_privilege('${role}','${signature}','execute') as allowed`)).rows[0].allowed, false);
assert.equal((await db.query(`select has_function_privilege('service_role','${signature}','execute') as allowed`)).rows[0].allowed, true);
assert.equal((await db.query(`select prosecdef from pg_proc where oid='${signature}'::regprocedure`)).rows[0].prosecdef, false);
await db.exec('set role service_role');
const call = brands => `select * from get_creator_performance_history('${tenant}',array['case','case'],${brands},'2026-01-01','2026-01-03')`;
let rows = (await db.query(call("array['alpha']"))).rows;
assert.equal(rows.length, 3); assert.equal(Number(rows[0].gmv), 0); assert.equal(Number(rows[1].gmv), 12.5);
assert.equal(Number(rows[1].posts), 1); assert.equal(rows[2].gmv, null); assert.equal(rows[2].posts, null);
rows = (await db.query(call("array['alpha','gamma']"))).rows;
assert.equal(Number(rows[1].gmv), 15); assert.equal(Number(rows[1].posts), 1);
await assert.rejects(db.query(call("array['beta']")), /Invalid history brand scope/);
await assert.rejects(db.query(call("array[]::text[]")), /Invalid history scope/);
await assert.rejects(db.query(`select * from get_creator_performance_history('${tenant}',array['case'],array['alpha'],'2024-01-01','2026-01-01')`), /Invalid history scope/);
await db.exec(`reset role; insert into brands_v2 values ('alpha','${other}'); set role service_role;`);
await assert.rejects(db.query(call("array['alpha']")), /Invalid history brand scope/);
await db.close();
console.log('PASS actual SQL: service-only invoker, tenant/brand isolation, slug collisions, daily source, duplicate handles, distinct videos, dates, zero and gaps');
