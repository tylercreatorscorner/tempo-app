import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE TABLE roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
    key text NOT NULL, name text NOT NULL, description text, is_default boolean DEFAULT false,
    UNIQUE(tenant_id,key));
  CREATE TABLE role_permissions(role_id uuid REFERENCES roles(id) ON DELETE CASCADE,
    screen text NOT NULL, level text NOT NULL, PRIMARY KEY(role_id,screen,level));
  CREATE TABLE user_profiles(user_id uuid PRIMARY KEY, tenant_id uuid, role text,
    role_id uuid REFERENCES roles(id) ON DELETE SET NULL);
  INSERT INTO roles VALUES ('${id(10)}','${id(1)}','owner','Owner',NULL,true),
    ('${id(11)}','${id(1)}','custom','Custom',NULL,false),
    ('${id(12)}','${id(2)}','foreign','Foreign',NULL,false);
  INSERT INTO role_permissions VALUES ('${id(10)}','team','configure'),('${id(11)}','earnings','read');
  INSERT INTO user_profiles VALUES ('${id(20)}','${id(1)}','owner',NULL),
    ('${id(21)}','${id(1)}','manager','${id(11)}'),('${id(22)}','${id(2)}','admin','${id(10)}');
  GRANT USAGE ON SCHEMA public TO service_role;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
`);
const migration = readdirSync('supabase/migrations').find(n => n.endsWith('_atomic_custom_roles.sql'));
await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'));
async function mutate(op, role = id(11), name = null, perms = null, actor = id(20)) {
  return db.query('select public.manage_workspace_role($1,$2,$3,$4,$5) as id', [actor, op, role, name, perms === null ? null : JSON.stringify(perms)]);
}
const grants = async () => (await db.query('select screen,level from role_permissions where role_id=$1 order by screen,level', [id(11)])).rows;
await db.exec('SET ROLE authenticated');
await assert.rejects(mutate('replace'), /permission denied/);
await db.exec('RESET ROLE; SET ROLE service_role');
await assert.rejects(mutate('replace',id(12)), /Role not found/);
await assert.rejects(mutate('replace',id(10)), /Default roles/);
await assert.rejects(mutate('replace',id(11),null,[],id(21)), /Only workspace/);
await assert.rejects(mutate('replace',id(11),null,[],id(22)), /permission required/);
for (const malformed of [['earnings:read:configure'], ['unknown:read'], [null], [42], { earnings:'read' }]) {
  await assert.rejects(mutate('replace',id(11),'Rejected',malformed), /Invalid permission|must be an array/);
  assert.deepEqual(await grants(), [{ screen:'earnings',level:'read' }]);
}
await assert.rejects(mutate('delete'), /Members still hold/);
await mutate('replace',id(11),'Updated',['payments:read','payments:read']);
assert.deepEqual(await grants(), [{ screen:'payments',level:'read' }]);
await db.exec(`RESET ROLE;
  CREATE FUNCTION reject_permission() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    RAISE EXCEPTION 'fixture insert failure'; END $$;
  CREATE TRIGGER fail_insert BEFORE INSERT ON role_permissions FOR EACH ROW EXECUTE FUNCTION reject_permission();
  SET ROLE service_role;`);
await assert.rejects(mutate('replace',id(11),'Must roll back',['earnings:read']), /fixture insert failure/);
assert.deepEqual(await grants(), [{ screen:'payments',level:'read' }]);
assert.equal((await db.query('select name from roles where id=$1',[id(11)])).rows[0].name,'Updated');
await assert.rejects(mutate('clone',id(11),'Broken copy'), /fixture insert failure/);
assert.equal((await db.query('select count(*)::int as n from roles')).rows[0].n,3);
await db.exec('RESET ROLE; DROP TRIGGER fail_insert ON role_permissions; SET ROLE service_role');
const copy = (await mutate('clone',id(11),'Finance copy')).rows[0].id;
assert.equal((await db.query('select count(*)::int as n from role_permissions where role_id=$1',[copy])).rows[0].n,1);
await mutate('replace',copy,null,[]);
await mutate('delete',copy);
assert.equal((await db.query('select count(*)::int as n from roles where id=$1',[copy])).rows[0].n,0);
console.log('PASS service-only access, actor authority, tenant boundaries, default protection and assigned-role deletion denial');
console.log('PASS strict parser, duplicate grants, failed save/clone rollback and legitimate clone/replace/empty/delete');
await db.close();
