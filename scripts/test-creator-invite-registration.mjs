import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [tenant, foreign, brand, foreignBrand, archivedBrand, otherBrand, existingCreator, foreignCreator] = Array.from({ length: 8 }, (_, i) => id(i + 1));

// The exercised columns and constraints match migrations 003 and 010; there is
// deliberately no default tenant, email identity proof, or permissive upsert.
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE TABLE tenants(id uuid PRIMARY KEY);
  CREATE TABLE brands_v2(id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), slug text NOT NULL, is_archived boolean DEFAULT false, UNIQUE(tenant_id, slug));
  CREATE TABLE creators_v2(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), real_name text, email text);
  CREATE UNIQUE INDEX creators_v2_email_lower_uniq ON creators_v2(lower(email)) WHERE email IS NOT NULL AND btrim(email) <> '';
  CREATE TABLE creator_brands(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), creator_id uuid NOT NULL REFERENCES creators_v2(id), brand_id uuid NOT NULL REFERENCES brands_v2(id), status text, is_managed boolean, applied_at timestamptz, UNIQUE(creator_id, brand_id));
  CREATE TABLE tiktok_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), creator_id uuid REFERENCES creators_v2(id), brand_id uuid REFERENCES brands_v2(id), tiktok_username text NOT NULL, is_primary boolean, verified boolean, verified_at timestamptz, UNIQUE(tenant_id, tiktok_username, brand_id));
  CREATE TABLE managed_creators(id serial PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), creator_id uuid REFERENCES creators_v2(id), account_1 text, account_2 text, account_3 text, account_4 text, account_5 text, account_6 text, account_7 text, account_8 text, account_9 text, account_10 text);
  CREATE TABLE invites(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), brand text NOT NULL, code text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, max_uses integer DEFAULT 100, current_uses integer DEFAULT 0, active boolean DEFAULT true);
  ALTER TABLE creators_v2 ENABLE ROW LEVEL SECURITY;
  ALTER TABLE creator_brands ENABLE ROW LEVEL SECURITY;
  ALTER TABLE tiktok_accounts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  INSERT INTO tenants VALUES ('${tenant}'), ('${foreign}');
  INSERT INTO brands_v2 VALUES ('${brand}', '${tenant}', 'shared', false), ('${foreignBrand}', '${foreign}', 'shared', false), ('${archivedBrand}', '${tenant}', 'archived', true), ('${otherBrand}', '${tenant}', 'other', false);
  INSERT INTO creators_v2 VALUES ('${existingCreator}', '${tenant}', 'Keep original', 'Original@fixture.invalid'), ('${foreignCreator}', '${foreign}', 'Private foreign', 'foreign@fixture.invalid');
  INSERT INTO tiktok_accounts(tenant_id, creator_id, brand_id, tiktok_username, verified) VALUES
    ('${tenant}', '${existingCreator}', '${brand}', 'original', true),
    ('${tenant}', '${existingCreator}', '${otherBrand}', 'otherbrand', true),
    ('${tenant}', null, '${brand}', 'unlinked', false),
    ('${tenant}', '${existingCreator}', '${brand}', ' @Legacy.Case ', true),
    ('${foreign}', '${foreignCreator}', '${foreignBrand}', 'foreign.handle', true);
  INSERT INTO managed_creators(tenant_id, creator_id, account_1, account_10) VALUES
    ('${tenant}', '${existingCreator}', ' @Legacy.Only ', 'Legacy.Tenth'),
    ('${tenant}', null, 'orphan.legacy', null),
    ('${foreign}', '${foreignCreator}', 'foreign.legacy', null);
  INSERT INTO invites(tenant_id, brand, code, expires_at, max_uses) VALUES
    ('${tenant}', 'shared', 'validcode', now() + interval '1 day', 10),
    ('${foreign}', 'shared', 'foreigncode', now() + interval '1 day', 10),
    ('${tenant}', 'archived', 'archivedcode', now() + interval '1 day', 10),
    ('${tenant}', 'missing', 'missingbrand', now() + interval '1 day', 10),
    ('${tenant}', 'shared', 'expiredcode', now() - interval '1 day', 10),
    ('${tenant}', 'shared', 'lastslot', now() + interval '1 day', 1),
    ('${tenant}', 'shared', 'rollback', now() + interval '1 day', 10);
`);
await db.exec(readFileSync('supabase/migrations/20261111014615_atomic_creator_invite_registration.sql', 'utf8'));
const register = (code = 'validcode', name = ' New Creator ', email = 'new@fixture.invalid', handles = ['@New.Handle']) =>
  db.query('SELECT public.register_creator_invite($1,$2,$3,$4::text[]) AS creator_id', [code, name, email, handles]);
const snapshot = async () => (await db.query(`SELECT jsonb_build_object(
  'creators', (SELECT jsonb_agg(t ORDER BY id) FROM creators_v2 t),
  'brands', (SELECT jsonb_agg(t ORDER BY id) FROM creator_brands t),
  'accounts', (SELECT jsonb_agg(t ORDER BY id) FROM tiktok_accounts t),
  'managed', (SELECT jsonb_agg(t ORDER BY id) FROM managed_creators t),
  'invites', (SELECT jsonb_agg(t ORDER BY id) FROM invites t)) AS value`)).rows[0].value;

for (const role of ['anon', 'authenticated']) {
  await db.exec(`SET ROLE ${role}`);
  await assert.rejects(() => register(), /permission denied/);
  await db.exec('RESET ROLE');
}
await db.exec('SET ROLE service_role');
const before = await snapshot();
for (const args of [
  ['validcode', 'Test', 'bad', ['new']], ['validcode', 'Test', 'a@b.invalid', []],
  ['validcode', 'Test', 'a@b.invalid', ['same', '@SAME']], ['validcode', 'Test', 'a@b.invalid', [null]],
  ['validcode', 'Test', 'a@b.invalid', ['trailing.']], ['validcode', 'Test', 'a@b.invalid', ['not/a/handle']],
  ['validcode', 'x'.repeat(101), 'a@b.invalid', ['new']], ['validcode', 'Test', 'a@b.invalid', Array.from({ length: 11 }, (_, i) => `handle${i}`)],
]) await assert.rejects(() => register(...args), /Invalid invitation details/);
for (const code of ['missingcode', 'archivedcode', 'missingbrand', 'expiredcode']) await assert.rejects(() => register(code), /Invite unavailable/);
for (const args of [
  ['validcode', 'Attacker', ' ORIGINAL@fixture.invalid ', ['new']],
  ['validcode', 'Attacker', 'attacker@fixture.invalid', ['@ORIGINAL']],
  ['validcode', 'Attacker', 'attacker@fixture.invalid', ['otherbrand']],
  ['validcode', 'Attacker', 'attacker@fixture.invalid', ['unlinked']],
  ['validcode', 'Attacker', 'attacker@fixture.invalid', ['legacy.case']],
  ['validcode', 'Attacker', 'attacker@fixture.invalid', ['legacy.only']],
  ['validcode', 'Attacker', 'attacker@fixture.invalid', ['legacy.tenth']],
  ['validcode', 'Attacker', 'attacker@fixture.invalid', ['orphan.legacy']],
]) await assert.rejects(() => register(...args), /Creator identity requires review/);
// Existing global email uniqueness (migration 068) still rejects cross-tenant
// duplicates atomically, without returning the foreign identity to the caller.
await assert.rejects(() => register('validcode', 'Attacker', 'foreign@fixture.invalid', ['new.email.handle']), /duplicate key/);
assert.deepEqual(await snapshot(), before, 'rejected requests must never change identities, handles, or usage');

const created = (await register()).rows[0].creator_id;
assert.deepEqual((await db.query('SELECT tenant_id,real_name,email FROM creators_v2 WHERE id=$1', [created])).rows[0], { tenant_id: tenant, real_name: 'New Creator', email: 'new@fixture.invalid' });
assert.deepEqual((await db.query('SELECT tenant_id,brand_id,status,is_managed FROM creator_brands WHERE creator_id=$1', [created])).rows[0], { tenant_id: tenant, brand_id: brand, status: 'Applied', is_managed: false });
assert.deepEqual((await db.query('SELECT tenant_id,brand_id,tiktok_username,is_primary,verified,verified_at FROM tiktok_accounts WHERE creator_id=$1', [created])).rows[0], { tenant_id: tenant, brand_id: brand, tiktok_username: 'new.handle', is_primary: true, verified: false, verified_at: null });
assert.equal((await db.query("SELECT current_uses FROM invites WHERE code='validcode'")).rows[0].current_uses, 1);
await assert.rejects(() => register(), /Creator identity requires review/);
// Foreign legacy handles are not an authorization boundary for this tenant.
const foreignHandle = (await register('validcode', 'Own New', 'ownnew@fixture.invalid', ['foreign.legacy'])).rows[0].creator_id;
assert.equal((await db.query('SELECT tenant_id FROM creators_v2 WHERE id=$1', [foreignHandle])).rows[0].tenant_id, tenant);

// The same slug in another workspace resolves only against the invite's tenant.
const foreignNew = (await register('foreigncode', 'Foreign New', 'different@fixture.invalid', ['different'])).rows[0].creator_id;
assert.deepEqual((await db.query('SELECT tenant_id,brand_id FROM creator_brands WHERE creator_id=$1', [foreignNew])).rows[0], { tenant_id: foreign, brand_id: foreignBrand });
const results = await Promise.allSettled([
  register('lastslot', 'First', 'first@fixture.invalid', ['first']),
  register('lastslot', 'Second', 'second@fixture.invalid', ['second']),
]);
assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
assert.equal((await db.query("SELECT current_uses FROM invites WHERE code='lastslot'")).rows[0].current_uses, 1);

// A failure on the last table insert rolls back the creator, brand, and usage.
await db.exec('RESET ROLE');
await db.exec(`CREATE FUNCTION fail_fixture_account() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tiktok_username = 'fail_fixture' THEN RAISE EXCEPTION 'fixture write failure'; END IF; RETURN NEW; END $$;
  CREATE TRIGGER fail_fixture BEFORE INSERT ON tiktok_accounts FOR EACH ROW EXECUTE FUNCTION fail_fixture_account();`);
await db.exec('SET ROLE service_role');
const beforeFailure = await snapshot();
await assert.rejects(() => register('rollback', 'Rollback', 'rollback@fixture.invalid', ['safe_fixture', 'fail_fixture']), /fixture write failure/);
assert.deepEqual(await snapshot(), beforeFailure);
await db.close();
console.log('PASS public invite transaction: tenant-derived brand, no identity takeover, browser-role denial, validation, usage limit, and complete rollback');
