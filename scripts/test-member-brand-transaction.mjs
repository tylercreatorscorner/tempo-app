import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const [actor,member,foreign,owner,tenantA,tenantB,brandA,brandB]=[1,2,3,4,5,6,7,8].map(id);
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE public.user_profiles(user_id uuid PRIMARY KEY, tenant_id uuid, role text);
CREATE TABLE public.brands_v2(id uuid PRIMARY KEY, tenant_id uuid NOT NULL);
CREATE TABLE public.user_brand_access(user_id uuid, brand_id uuid REFERENCES public.brands_v2, tenant_id uuid, UNIQUE(user_id,brand_id));
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role;
INSERT INTO user_profiles VALUES ('${actor}','${tenantA}','owner'),('${member}','${tenantA}','manager'),('${foreign}','${tenantB}','manager'),('${owner}','${tenantA}','owner');
INSERT INTO brands_v2 VALUES ('${brandA}','${tenantA}'),('${brandB}','${tenantB}');
INSERT INTO user_brand_access VALUES ('${member}','${brandA}','${tenantA}');
`);
const migration=readdirSync('supabase/migrations').find(name=>name.endsWith('_replace_member_brand_access.sql'));
assert.ok(migration);
await db.exec(readFileSync(`supabase/migrations/${migration}`,'utf8'));
const call=(who,target,brands)=>db.query('SELECT public.replace_member_brand_access($1::uuid,$2::uuid,$3::uuid[])',[who,target,brands]);
for(const role of ['anon','authenticated']){await db.exec(`SET ROLE ${role}`);await assert.rejects(()=>call(actor,member,[]),/permission denied/);await db.exec('RESET ROLE');}
await db.exec('SET ROLE service_role');
for(const [who,target,brands] of [[actor,foreign,[]],[actor,owner,[]],[actor,actor,[]],[member,actor,[]],[actor,member,[brandB]],[actor,member,[brandA,brandB]],[actor,member,[id(99)]],[actor,member,[null]],[actor,member,null],[id(99),member,[]],[actor,id(99),[]]]){
 await assert.rejects(()=>call(who,target,brands));
 assert.equal((await db.query('SELECT count(*)::int AS n FROM user_brand_access')).rows[0].n,1);
}
await call(actor,member,[]);assert.equal((await db.query('SELECT count(*)::int AS n FROM user_brand_access')).rows[0].n,0);
await call(actor,member,[brandA,brandA]);assert.equal((await db.query('SELECT count(*)::int AS n FROM user_brand_access')).rows[0].n,1);
await db.exec('RESET ROLE');
// Force the insert to fail after DELETE, proving transaction rollback preserves prior access.
await db.exec(`CREATE FUNCTION reject_access() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$; CREATE TRIGGER reject_access BEFORE INSERT ON user_brand_access FOR EACH ROW EXECUTE FUNCTION reject_access(); SET ROLE service_role;`);
await assert.rejects(()=>call(actor,member,[brandA]),/fixture failure/);
assert.equal((await db.query('SELECT count(*)::int AS n FROM user_brand_access')).rows[0].n,1);
await db.close();
console.log('PASS actual PostgreSQL migration: client denial, actor/target/brand isolation, owner/self protection, deduplication and clear/reassign');
console.log('PASS insert failure rolls back the preceding delete and preserves existing access');
