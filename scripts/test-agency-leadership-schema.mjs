import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const migration = readdirSync('supabase/migrations').find(name => name.endsWith('_reconcile_agency_leadership_access.sql'));
assert.ok(migration, 'The fresh-install leadership schema must be versioned');
const sql = readFileSync(`supabase/migrations/${migration}`, 'utf8');
try {
  // A fresh install needs only tenants, not the unmerged legacy billing schema.
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.tenants(id uuid primary key);
    insert into public.tenants values('${id(1)}'),('${id(2)}');
    grant usage on schema public to anon,authenticated,service_role;`);
  await db.exec(sql);
  assert.equal((await db.query('select count(*)::int as count from public.agency_leadership_access')).rows[0].count, 0, 'Migration does not seed or infer access');
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.agency_leadership_access'::regclass")).rows[0].relrowsecurity, true);
  assert.equal((await db.query("select count(*)::int as count from pg_policies where schemaname='public' and tablename='agency_leadership_access'")).rows[0].count, 0);

  await db.exec('set role service_role');
  await db.query("insert into public.agency_leadership_access(tenant_id,user_id,designation) values($1,$2,'owner')", [id(1), id(3)]);
  await db.query("insert into public.agency_leadership_access(tenant_id,user_id,designation) values($1,$2,'vp')", [id(2), id(3)]);
  const before = (await db.query('select * from public.agency_leadership_access order by tenant_id')).rows;
  assert.equal(before.length, 2, 'The same user may have separate tenant-scoped designations');
  await assert.rejects(db.query("insert into public.agency_leadership_access(tenant_id,user_id,designation) values($1,$2,'vp')", [id(1), id(3)]), /duplicate key/);
  await assert.rejects(db.query("insert into public.agency_leadership_access(tenant_id,user_id,designation) values($1,$2,'admin')", [id(1), id(4)]), /check constraint/);
  await assert.rejects(db.query("insert into public.agency_leadership_access(tenant_id,user_id,designation) values($1,$2,'vp')", [id(99), id(4)]), /foreign key constraint/);
  await db.exec('reset role');

  // Reapplying to an existing populated directory preserves every designation
  // and timestamp while reasserting the browser boundary.
  await db.exec('grant select,insert,update,delete on public.agency_leadership_access to authenticated');
  await db.exec(sql);
  assert.deepEqual((await db.query('select * from public.agency_leadership_access order by tenant_id')).rows, before);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    for (const query of [
      'select * from public.agency_leadership_access',
      `insert into public.agency_leadership_access(tenant_id,user_id,designation) values('${id(1)}','${id(4)}','vp')`,
      "update public.agency_leadership_access set designation='vp'",
      'delete from public.agency_leadership_access',
    ]) await assert.rejects(db.query(query), /permission denied/, `${role} cannot read or change the allowlist directly`);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  await db.query("update public.agency_leadership_access set designation='vp' where tenant_id=$1 and user_id=$2", [id(1), id(3)]);
  await db.query('delete from public.agency_leadership_access where tenant_id=$1 and user_id=$2', [id(1), id(3)]);
  assert.equal((await db.query('select count(*)::int as count from public.agency_leadership_access')).rows[0].count, 1, 'Trusted administration retains explicit update and revoke support');
  await db.exec('reset role');
  assert.equal((await db.query("select count(*)::int as count from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'agency_%'")).rows[0].count, 0, 'This migration adds no RPC or legacy dependency');
  console.log('PASS Agency leadership schema: fresh install, idempotent populated migration, no seeded access, tenant/role constraints, RLS and denied browser reads/writes');
} finally {
  await db.close();
}
