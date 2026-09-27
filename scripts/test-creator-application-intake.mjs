import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create table auth.users(id uuid primary key);
  create table public.tenants(id uuid primary key);
  create table public.brands_v2(id uuid primary key,tenant_id uuid,slug text,is_archived boolean default false);
  create table public.user_profiles(user_id uuid,tenant_id uuid,role text,role_id uuid);
  create table public.roles(id uuid,tenant_id uuid,key text);
  create table public.role_permissions(role_id uuid,screen text,level text);
  create table public.user_brand_access(user_id uuid,brand_id uuid,tenant_id uuid);
  create table public.brand_manager_assignments(brand_id uuid,manager_user_id uuid);
`);
const migration = readFileSync(new URL('../supabase/migrations/20260927221852_creator_application_intake_additive.sql', import.meta.url), 'utf8');
await db.exec(migration);

const tenant = '00000000-0000-4000-8000-000000000001';
const otherTenant = '00000000-0000-4000-8000-000000000002';
const brand = '00000000-0000-4000-8000-000000000003';
const manager = '00000000-0000-4000-8000-000000000004';
const otherManager = '00000000-0000-4000-8000-000000000005';
const role = '00000000-0000-4000-8000-000000000006';
const form = '00000000-0000-4000-8000-000000000007';
const app = '00000000-0000-4000-8000-000000000008';
await db.exec(`
  insert into tenants values ('${tenant}'),('${otherTenant}');
  insert into auth.users values ('${manager}'),('${otherManager}');
  insert into brands_v2(id,tenant_id,slug) values ('${brand}','${tenant}','jiyu');
  insert into roles values ('${role}','${tenant}','manager');
  insert into role_permissions values ('${role}','roster','write');
  insert into user_profiles values ('${manager}','${tenant}','manager','${role}'),('${otherManager}','${tenant}','manager','${role}');
  insert into user_brand_access values ('${manager}','${brand}','${tenant}'),('${otherManager}','${brand}','${tenant}');
  insert into brand_manager_assignments values ('${brand}','${manager}');
  insert into creator_application_forms(id,tenant_id,brand_id,created_by) values ('${form}','${tenant}','${brand}','${manager}');
  insert into creator_application_submissions(id,tenant_id,brand_id,form_id,form_version,questions_snapshot,full_name,email,tiktok_handle)
    values ('${app}','${tenant}','${brand}','${form}',1,'[]','Example Creator','example@example.com','example');
`);
const decide = (actor, expected = 'pending', next = 'approved', tenantId = tenant) =>
  db.query('select status from decide_creator_application($1,$2,$3,$4,$5,$6)', [app, tenantId, actor, expected, next, 'Reviewed']);
await assert.rejects(decide(otherManager), /Only the current assigned brand manager/);
await assert.rejects(decide(manager, 'pending', 'approved', otherTenant), /Application changed/);
await db.exec(`delete from user_brand_access where user_id='${manager}'`);
await assert.rejects(decide(manager), /Only the current assigned brand manager/);
await db.exec(`insert into user_brand_access values ('${manager}','${brand}','${tenant}')`);
await db.exec(`update brands_v2 set is_archived=true where id='${brand}'`);
await assert.rejects(decide(manager), /Only the current assigned brand manager/);
await db.exec(`update brands_v2 set is_archived=false where id='${brand}'`);
await db.exec(`delete from role_permissions where role_id='${role}'`);
await assert.rejects(decide(manager), /Roster write access is required/);
await db.exec(`insert into role_permissions values ('${role}','roster','write')`);
assert.equal((await decide(manager)).rows[0].status, 'approved');
await assert.rejects(decide(manager), /Application changed/);
const { rows } = await db.query('select prior_status,new_status,actor_id from creator_application_decisions');
assert.equal(rows.length, 1);
assert.equal(rows[0].actor_id, manager);
const grants = await db.query(`select
  has_table_privilege('anon','public.creator_application_submissions','select') anon_read,
  has_table_privilege('authenticated','public.creator_application_submissions','select') staff_read,
  has_function_privilege('authenticated','public.decide_creator_application(uuid,uuid,uuid,text,text,text)','execute') staff_decide`);
assert.deepEqual(Object.values(grants.rows[0]), [false, false, false]);
console.log('creator application decision boundary: passed');
await db.close();
