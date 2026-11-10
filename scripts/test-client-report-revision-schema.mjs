import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const migration = readdirSync('supabase/migrations').find(name => name.endsWith('_private_client_report_revision_drafts.sql'));
assert.ok(migration);
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    create table tenants(id uuid primary key);
    create table client_reports(id uuid primary key,tenant_id uuid not null,brand_slug text not null,
      report_type text not null,period_start date not null,period_end date not null,notes text,snapshot jsonb);
    grant select on client_reports to service_role;
    insert into tenants values('${id(1)}'),('${id(2)}');
    insert into client_reports values
      ('${id(3)}','${id(1)}','fixture','performance','2026-11-01','2026-11-08','Original notes','{"original":true}'),
      ('${id(4)}','${id(1)}','fixture','performance','2026-11-01','2026-11-08','Another original','{"original":true}');`);
  const originals = (await db.query('select * from client_reports order by id')).rows;
  await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'));
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='client_report_revision_drafts'::regclass")).rows[0].relrowsecurity, true);
  assert.equal((await db.query("select count(*)::int as count from pg_policies where tablename='client_report_revision_drafts'")).rows[0].count, 0);
  assert.equal((await db.query("select count(*)::int as count from information_schema.columns where table_name='client_report_revision_drafts' and column_name='token'")).rows[0].count, 0, 'Private drafts have no bearer token');
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('select * from client_report_revision_drafts'), /permission denied/);
    await assert.rejects(db.query("insert into client_report_revision_drafts default values"), /permission denied/);
    await assert.rejects(db.query("update client_report_revision_drafts set notes='attempt'"), /permission denied/);
    await db.exec('reset role');
    assert.equal((await db.query("select has_function_privilege($1,'validate_client_report_revision_draft_source()','execute') as allowed", [role])).rows[0].allowed, false);
  }
  await db.exec('set role service_role');
  const insert = (overrides = {}) => {
    const row = { tenant: id(1), source: id(3), brand: 'fixture', type: 'performance', start: '2026-11-01', end: '2026-11-08', snapshot: { report: {} }, ...overrides };
    return db.query(`insert into client_report_revision_drafts
      (tenant_id,source_report_id,brand_slug,brand_name,report_type,period_start,period_end,period_label,snapshot,notes,created_by)
      values($1,$2,$3,'Fixture',$4,$5,$6,'Nov 1-8',$7,'Corrected notes','fixture@example.invalid') returning id`,
    [row.tenant, row.source, row.brand, row.type, row.start, row.end, JSON.stringify(row.snapshot)]);
  };
  const draftId = (await insert()).rows[0].id;
  assert.ok(draftId, 'An eight-day custom performance correction is a valid private draft');
  await assert.rejects(insert({ tenant: id(2) }), /source does not match/);
  await assert.rejects(insert({ brand: 'other' }), /source does not match/);
  await assert.rejects(insert({ type: 'monthly' }), /source does not match/);
  await assert.rejects(insert({ end: '2026-11-09' }), /source does not match/);
  await assert.rejects(insert({ snapshot: {} }), /check constraint/);
  await assert.rejects(insert({ snapshot: { report: null } }), /check constraint/);
  await assert.rejects(insert({ snapshot: { report: {}, reconciliation: {} } }), /check constraint/);
  await assert.rejects(db.query("update client_report_revision_drafts set status='published' where id=$1", [draftId]), /check constraint/);
  await assert.rejects(db.query('update client_report_revision_drafts set source_report_id=$1 where id=$2', [id(4), draftId]), /source identity is immutable/);
  await db.query("update client_report_revision_drafts set notes='Reviewed private note' where id=$1", [draftId]);
  assert.equal((await db.query('select notes from client_report_revision_drafts where id=$1', [draftId])).rows[0].notes, 'Reviewed private note');
  assert.deepEqual((await db.query('select * from client_reports order by id')).rows, originals, 'Draft creation and edits preserve every original report field');
  console.log('PASS private report draft schema: service-only RLS, no token, valid custom period, source identity, draft-only status and original preservation');
} finally { await db.close(); }
