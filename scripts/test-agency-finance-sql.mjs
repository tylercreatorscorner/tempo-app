import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create table tenants(id uuid primary key); create table brands_v2(id uuid primary key,tenant_id uuid,parent_brand_id uuid);
create table user_profiles(user_id uuid,tenant_id uuid,role text);
insert into tenants values('${id(1)}'),('${id(2)}');
insert into user_profiles values('${id(20)}','${id(1)}','owner'),('${id(21)}','${id(2)}','owner'),('${id(22)}','${id(1)}','manager');
grant usage on schema public to service_role; grant select on all tables in schema public to service_role;
create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
for (const suffix of ['_agency_business_clients.sql', '_agency_finance_onboarding.sql', '_agency_contract_drive_references.sql']) {
  const name = readdirSync('supabase/migrations').find(n => n.endsWith(suffix));
  await db.exec(readFileSync(`supabase/migrations/${name}`, 'utf8'));
}
const write = (action, payload, tenant = id(1), actor = id(20)) => db.query('select agency_finance_write($1,$2,$3,$4) as value', [tenant, actor, action, JSON.stringify(payload)]).then(r => r.rows[0].value);
await db.exec(`insert into agency_business_client_revisions values('${id(1)}','${id(10)}',1,'${id(20)}','{}',now());`);
const settings = { managerTerms: [{ managerId: id(22) }] };
for (const role of ['anon', 'authenticated']) { await db.exec(`set role ${role}`); await assert.rejects(write('settings', {}), /permission denied/); await assert.rejects(db.query('select * from agency_contracts'), /permission denied/); await db.exec('reset role'); }
await db.exec('set role service_role');
let saved = await write('settings', { clientId: id(10), expectedRevision: 0, settings });
assert.equal(saved.revision, 1);
await assert.rejects(write('settings', { clientId: id(10), expectedRevision: 0, settings }), /conflict/);
await assert.rejects(write('settings', { clientId: id(10), expectedRevision: 0, settings }, id(2), id(21)), /Unknown/);
await assert.rejects(write('settings', { clientId: id(10), expectedRevision: 1, settings: { managerTerms: [{ managerId: id(21) }] } }), /Invalid finance manager/);
await assert.rejects(write('settings', { clientId: id(10), expectedRevision: 1, settings }, id(1), id(22)), /access denied/);
const snapshot = { clientRevision: 1, settingsRevision: 1, issuedDate: '2026-01-01', dueDate: '2026-01-31', expectedDate: '2026-01-31', billing: { netDays: 30, collectionDelayDays: 0 } };
let invoice = await write('draft', { clientId: id(10), month: '2025-12', snapshot });
await assert.rejects(write('draft', { clientId: id(10), month: '2025-12', snapshot }), /duplicate key/);
await assert.rejects(write('draft', { clientId: id(10), month: '2025-11', snapshot: { ...snapshot, settingsRevision: 2 } }), /conflict/);
await assert.rejects(write('collect', { id: invoice.id, expectedRevision: 1, date: '2026-01-05' }), /transition/);
invoice = await write('issue', { id: invoice.id, expectedRevision: 1 });
assert.equal(invoice.status, 'issued');
await assert.rejects(write('collect', { id: invoice.id, expectedRevision: 1, date: '2026-01-05' }), /conflict/);
invoice = await write('collect', { id: invoice.id, expectedRevision: 2, date: '2026-01-05' });
assert.equal(invoice.collected_on, '2026-01-05');
await assert.rejects(write('void', { id: invoice.id, expectedRevision: 3 }), /transition/);
await assert.rejects(write('pay', { id: invoice.id, expectedRevision: 3, date: '2026-01-04' }), /Invalid payment date/);
invoice = await write('pay', { id: invoice.id, expectedRevision: 3, date: '2026-01-12' });
assert.equal(invoice.manager_paid_on, '2026-01-12');
await assert.rejects(write('pay', { id: invoice.id, expectedRevision: 4, date: '2026-01-12' }), /transition/);
assert.equal((await db.query('select count(*)::int as n from agency_finance_audit')).rows[0].n, 5);
await assert.rejects(db.exec('delete from agency_finance_audit'), /permission denied/);
const sourceUrl = 'https://drive.google.com/file/d/original_private_file_123/view';
const contract = (n, storagePath, source) => db.query('insert into agency_contracts(id,tenant_id,client_id,name,storage_path,source_url,uploaded_by) values($1,$2,$3,$4,$5,$6,$7)', [id(n), id(1), id(10), 'Signed contract', storagePath, source, id(20)]);
await contract(30, `${id(1)}/${id(10)}/signed.pdf`, null);
await contract(31, null, sourceUrl);
await assert.rejects(contract(32, null, null), /agency_contracts_source_exclusive/);
await assert.rejects(contract(33, 'another.pdf', sourceUrl), /agency_contracts_source_exclusive/);
for (const badUrl of [sourceUrl.replace('https:', 'http:'), sourceUrl.replace('drive.google.com', 'drive.google.com.evil.invalid'), sourceUrl.replace('drive.google.com', 'user:pass@drive.google.com'), `${sourceUrl}?download=1`, `${sourceUrl}#fragment`, `${sourceUrl}\n`, 'https://docs.google.com/document/d/document_123/edit']) {
  await assert.rejects(contract(34, null, badUrl), /agency_contracts_drive_source_url/);
}
assert.equal((await db.query('select count(*)::int as n from agency_contracts')).rows[0].n, 2);
await db.exec('reset role');
await assert.rejects(db.exec('update agency_finance_audit set kind=kind'), /immutable/);
assert.equal((await db.query("select public from storage.buckets where id='agency-contracts'")).rows[0].public, false);
console.log('PASS agency finance SQL: tenant/actor scope, manager ownership, optimistic locking, immutable audit, invoice states, private storage and exclusive canonical Drive references');
await db.close();
