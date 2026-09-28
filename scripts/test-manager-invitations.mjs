import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const [manager, newUser, existing, admin, foreign, tenant, otherTenant, nello, neurogum, otherBrand] =
  Array.from({ length: 10 }, (_, i) => id(i + 1));

await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.user_profiles(user_id uuid PRIMARY KEY REFERENCES auth.users(id),email text,tenant_id uuid NOT NULL,role text,role_id uuid,status text,can_view_finance boolean);
CREATE TABLE public.brands_v2(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,is_archived boolean DEFAULT false);
CREATE TABLE public.user_brand_access(user_id uuid REFERENCES auth.users(id),brand_id uuid REFERENCES public.brands_v2(id),tenant_id uuid,UNIQUE(user_id,brand_id));
GRANT USAGE ON SCHEMA public TO service_role,authenticated,anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
INSERT INTO auth.users VALUES ('${manager}'),('${newUser}'),('${existing}'),('${admin}'),('${foreign}');
INSERT INTO user_profiles(user_id,tenant_id,role,status,can_view_finance) VALUES
 ('${manager}','${tenant}','manager','active',false),
 ('${existing}','${tenant}','manager','active',true),
 ('${admin}','${tenant}','admin','active',true),
 ('${foreign}','${otherTenant}','coach','active',false);
INSERT INTO brands_v2(id,tenant_id) VALUES
 ('${nello}','${tenant}'),('${neurogum}','${tenant}'),('${otherBrand}','${tenant}');
INSERT INTO user_brand_access VALUES
 ('${manager}','${nello}','${tenant}'),('${manager}','${neurogum}','${tenant}'),
 ('${existing}','${otherBrand}','${tenant}');`);
await db.exec(readFileSync('supabase/migrations/20260928190920_scoped_manager_invitations.sql', 'utf8'));
const call = (actor, target, role, brands) => db.query(
  'SELECT public.provision_manager_invited_member($1::uuid,$2::uuid,$3,$4,$5::uuid[])',
  [actor, target, 'person@example.invalid', role, brands],
);
await db.exec('SET ROLE service_role');
for (const args of [
  [manager,newUser,'admin',[nello]],
  [manager,newUser,'coach',[otherBrand]],
  [manager,newUser,'coach',[nello,otherBrand]],
  [manager,newUser,'coach',[]],
  [manager,newUser,'coach',[nello,nello]],
  [manager,admin,'manager',[nello]],
  [manager,foreign,'coach',[nello]],
  [existing,newUser,'coach',[nello]],
]) await assert.rejects(() => call(...args));
assert.equal((await db.query('SELECT count(*)::int AS n FROM user_profiles WHERE user_id=$1',[newUser])).rows[0].n,0);
await call(manager,newUser,'coach',[nello,neurogum]);
const profile=(await db.query('SELECT role,can_view_finance FROM user_profiles WHERE user_id=$1',[newUser])).rows[0];
assert.equal(profile.role,'coach'); assert.equal(profile.can_view_finance,false);
assert.equal((await db.query('SELECT count(*)::int AS n FROM user_brand_access WHERE user_id=$1',[newUser])).rows[0].n,2);
await call(manager,existing,'manager',[nello]);
assert.equal((await db.query('SELECT can_view_finance FROM user_profiles WHERE user_id=$1',[existing])).rows[0].can_view_finance,true);
assert.equal((await db.query('SELECT count(*)::int AS n FROM user_brand_access WHERE user_id=$1',[existing])).rows[0].n,2);
await assert.rejects(() => call(manager,newUser,'manager',[nello]));

await db.exec('RESET ROLE; SET ROLE authenticated');
await assert.rejects(() => call(manager,newUser,'coach',[nello]),/permission denied/);
await db.close();
console.log('PASS manager invitations: assigned brands only, scoped roles, atomic grants, existing-role preservation, cross-tenant and browser-role denial');
