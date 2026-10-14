import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create table tenants(id uuid primary key);
create table user_profiles(user_id uuid,tenant_id uuid,role text);
create table agency_business_client_revisions(tenant_id uuid,actor_id uuid);
create table agency_billing_revisions(tenant_id uuid,actor_id uuid);
insert into tenants values('${id(1)}'),('${id(2)}');
insert into user_profiles values('${id(3)}','${id(1)}','owner'),('${id(4)}','${id(1)}','admin'),('${id(5)}','${id(1)}','manager');
grant usage on schema public to service_role;grant select,insert on all tables in schema public to service_role;`);
await db.exec(readFileSync('supabase/migrations/20261005041923_agency_leadership_access.sql','utf8'));
for (const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(db.query('select * from agency_leadership_access'),/permission denied/);
  await assert.rejects(db.query(`insert into agency_leadership_access values($1,$2,'vp',now())`,[id(1),id(4)]),/permission denied/);
  await assert.rejects(db.query('select agency_is_leadership($1,$2)',[id(1),id(4)]),/permission denied/);
  await db.exec('reset role');
}
await db.exec('set role service_role');
const allowed = async (actor,tenant=id(1)) => (await db.query('select agency_is_leadership($1,$2) as allowed',[tenant,actor])).rows[0].allowed;
assert.equal(await allowed(id(3)),true);
assert.equal(await allowed(id(4)),false);
for (const table of ['agency_business_client_revisions','agency_billing_revisions']) {
  await assert.rejects(db.query(`insert into ${table} values($1,$2)`,[id(1),id(4)]),/Invalid agency scope/);
}
await db.query(`insert into agency_leadership_access(tenant_id,user_id,designation) values($1,$2,'vp'),($1,$3,'vp')`,[id(1),id(4),id(5)]);
assert.equal(await allowed(id(4)),true);
assert.equal(await allowed(id(5)),false,'Manager cannot become leadership through a stray designation');
assert.equal(await allowed(id(4),id(2)),false,'Leadership cannot cross tenants');
for (const table of ['agency_business_client_revisions','agency_billing_revisions']) {
  await db.query(`insert into ${table} values($1,$2)`,[id(1),id(4)]);
}
await db.query('delete from agency_leadership_access where user_id=$1',[id(4)]);
assert.equal(await allowed(id(4)),false,'Revocation takes effect without a token refresh');
// The same gate must protect navigation, direct pages and every data endpoint.
for (const file of ['src/app/(admin)/layout.tsx','src/app/(admin)/agency/layout.tsx','src/app/api/agency/business/route.ts','src/app/api/agency/billing/route.ts']) {
  assert.match(readFileSync(file,'utf8'),/canAccessAgency\(scope/);
}
assert.match(readFileSync('src/components/layout/sidebar.tsx','utf8'),/navPerms\?\.agency === true/);
await db.close();
console.log('Agency leadership: tenant isolation, denied admins/managers, grants, revocation and write guards passed');
