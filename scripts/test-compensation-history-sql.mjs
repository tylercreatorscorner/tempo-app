import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create table tenants(id uuid primary key);
 create table team_members(id uuid primary key,tenant_id uuid,name text,is_archived boolean default false);
 create table user_profiles(user_id uuid,tenant_id uuid,role text);
 create table brands_v2(id uuid primary key,tenant_id uuid,slug text);
 create type compensation_model_enum as enum('standard','revshare_max','commission_only','retainer_only');
 create table brand_compensation(
  id uuid primary key default gen_random_uuid(),tenant_id uuid,brand text,team_member_id uuid,
  retainer numeric default 0,product_retainer_amount numeric default 0,product_retainer_name text,
  launch_fee numeric default 0,launch_fee_name text,launch_fee_ends date,
  commission_rate numeric,revenue_share_rate numeric,marketing_commission_rate numeric default 0.02,
  compensation_model compensation_model_enum default 'standard', unique(brand,team_member_id,tenant_id)
 );
 create table invoices(id uuid primary key,total_amount numeric); create table earnings_ledger(id uuid primary key,snapshot jsonb);
 insert into invoices values('${id(90)}',1234); insert into earnings_ledger values('${id(91)}','{"total":1234}');
 insert into tenants values('${id(1)}'),('${id(2)}');
 insert into team_members values('${id(10)}','${id(1)}','Existing payee',false),('${id(11)}','${id(1)}','Other existing payee',false),('${id(12)}','${id(2)}','Foreign payee',false);
 insert into user_profiles values('${id(20)}','${id(1)}','owner'),('${id(21)}','${id(2)}','owner'),('${id(22)}','${id(1)}','manager');
 insert into brands_v2 values('${id(30)}','${id(1)}','alpha'),('${id(31)}','${id(1)}','beta'),('${id(32)}','${id(2)}','foreign');
 insert into brand_compensation(tenant_id,brand,team_member_id,retainer,commission_rate,revenue_share_rate,marketing_commission_rate,launch_fee,product_retainer_amount,product_retainer_name)
 values('${id(1)}','alpha','${id(10)}',3000,1.5,0.015,0.03,25,50,'Samples');
 grant usage on schema public to service_role;
 grant select,insert,update,delete on all tables in schema public to service_role;
`);
const migration = readdirSync('supabase/migrations').find(name => name.endsWith('_finance_compensation_history.sql'));
assert.ok(migration);
await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'));

const read = (payee = id(10), month = '2026-09', brands = ['alpha', 'beta'], tenant = id(1)) => db.query('select finance_compensation_for_month($1,$2,$3,$4) value', [tenant, payee, brands, month]).then(r => r.rows[0].value);
const write = ({ brand = 'alpha', payee = id(10), month = '2026-10', patch = {}, active = true, expected = null, actor = id(20), tenant = id(1), source = { kind: 'approved_sheet', spreadsheet: 'fixture', effectiveMonth: '2026-10' } } = {}) => db.query('select finance_compensation_write($1,$2,$3,$4,$5,$6,$7,$8,$9) value', [tenant, actor, brand, payee, month, JSON.stringify(patch), active, expected, JSON.stringify(source)]).then(r => r.rows[0].value);
const batch = changes => db.query('select finance_compensation_write_batch($1,$2,$3,$4,$5) value', [id(1), id(20), '2026-10', JSON.stringify(changes), JSON.stringify({ kind: 'atomic_fixture' })]).then(r => r.rows[0].value);

for (const role of ['anon', 'authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(read(), /permission denied/);
  await assert.rejects(write(), /permission denied/);
  await assert.rejects(batch([]), /permission denied/);
  await assert.rejects(db.query('select * from finance_compensation_history'), /permission denied/);
  await assert.rejects(db.query('select * from finance_compensation_legacy_payees'), /permission denied/);
  await db.exec('reset role');
}
await db.exec('set role service_role');
const baseline = await read();
assert.equal(baseline[0].retainer, 3000);
assert.equal(baseline[0].commission_rate, 1.5);
assert.equal(baseline[0].active, true);
assert.equal(baseline[0].effective_month, null, 'an observed baseline does not invent a contract date');
assert.equal(baseline[1].active, true, 'existing payee retains the old unconfigured-brand default behavior');
assert.equal(baseline[1].commission_rate, null);
assert.equal((await read(id(11)))[0].active, true, 'existing payees with no compensation rows retain legacy defaults');

await assert.rejects(write({ actor: id(21) }), /access denied/);
await assert.rejects(write({ actor: id(22) }), /access denied/);
await assert.rejects(write({ payee: id(12) }), /payee unavailable/);
await assert.rejects(write({ brand: 'foreign' }), /brand unavailable/);
await assert.rejects(write({ tenant: id(2), actor: id(21), payee: id(12) }), /brand unavailable/);
await assert.rejects(read(id(12)), /payee unavailable/);
await assert.rejects(read(id(10), '2026-13'), /Invalid compensation month/);
await assert.rejects(write({ month: '2026-13' }), /Invalid compensation month/);
await assert.rejects(write({ expected: 0 }), /revision conflict/);
for (const patch of [{ bad_field: 1 }, { retainer: -1 }, { retainer: 1.001 }, { commission_rate: 101 }, { revenue_share_rate: 2 }, { compensation_model: 'guess' }, { launch_fee_ends: '2026-02-30' }, { retainer: '5000' }]) await assert.rejects(write({ patch }), /Invalid|date\/time field|date out of range/);
await assert.rejects(db.exec(`update brand_compensation set retainer=999 where brand='alpha'`), /effective compensation writer/);
await assert.rejects(db.exec(`delete from brand_compensation where brand='alpha'`), /effective compensation writer/);
await assert.rejects(db.exec(`insert into brand_compensation(tenant_id,brand,team_member_id) values('${id(1)}','beta','${id(10)}')`), /effective compensation writer/);

const october = await write({ patch: { retainer: 3500, commission_rate: 2, revenue_share_rate: 0.02 }, expected: 1 });
assert.equal(october.revision, 2);
assert.equal(october.launch_fee, 25, 'unspecified launch fees survive a patch');
assert.equal(october.product_retainer_amount, 50);
assert.equal(october.product_retainer_name, 'Samples');
assert.equal(october.marketing_commission_rate, 0.03);
const septemberAfter = await read();
assert.equal(septemberAfter[0].retainer, 3000);
assert.equal(septemberAfter[0].commission_rate, 1.5);
assert.equal(septemberAfter[0].revision, 2, 'CAS uses the latest pair revision, even when viewing an older period');
assert.equal(septemberAfter[0].snapshot_revision, 1);
assert.equal((await read(id(10), '2026-10'))[0].retainer, 3500);
await assert.rejects(write({ expected: 1 }), /revision conflict/);

await db.exec('reset role');
await db.exec(`insert into team_members values('${id(13)}','${id(1)}','New financial payee',false)`);
await db.exec('set role service_role');
assert.ok((await read(id(13))).every(row => !row.active), 'new payee receives no historical default commission on any brand');
await write({ payee: id(13), patch: { retainer: 4000, commission_rate: 2, revenue_share_rate: 0.02 }, expected: 0 });
assert.ok((await read(id(13))).every(row => !row.active), 'new October arrangement does not leak into September');
const newOctober = await read(id(13), '2026-10');
assert.equal(newOctober[0].active, true);
assert.equal(newOctober[1].active, false, 'new payee has no fallback on unconfigured brands');
const tombstone = await write({ active: false, expected: 2 });
assert.equal(tombstone.revision, 3);
assert.equal((await read(id(10), '2026-10'))[0].active, false, 'explicit inactivity lets the consumer suppress creator overrides too');
assert.equal((await read())[0].active, true);
assert.equal((await read())[0].retainer, 3000);
const compatibilityBeforeFuture = (await db.query('select retainer,commission_rate,compensation_model from brand_compensation where brand=$1 and team_member_id=$2', ['alpha', id(10)])).rows[0];
const futureMonth = `${new Date().getUTCFullYear() + 1}-12`;
await write({ month: futureMonth, patch: { retainer: 9876 }, active: true, expected: 3 });
assert.deepEqual((await db.query('select retainer,commission_rate,compensation_model from brand_compensation where brand=$1 and team_member_id=$2', ['alpha', id(10)])).rows[0], compatibilityBeforeFuture, 'a future arrangement must not overwrite the current physical projection');
assert.equal((await read(id(10), futureMonth))[0].retainer, 9876);
assert.equal((await read(id(10), '2026-10'))[0].active, false);

const countBefore = (await db.query('select count(*)::int count from finance_compensation_history')).rows[0].count;
await assert.rejects(batch([
  { brand: 'beta', team_member_id: id(10), patch: { retainer: 100 }, expected_revision: 0 },
  { brand: 'alpha', team_member_id: id(12), patch: { retainer: 100 } },
]), /payee unavailable/);
assert.equal((await db.query('select count(*)::int count from finance_compensation_history')).rows[0].count, countBefore, 'a failed batch rolls back its earlier entries');
const savedBatch = await batch([
  { brand: 'beta', team_member_id: id(10), patch: { retainer: 100 }, expected_revision: 0 },
  { brand: 'beta', team_member_id: id(11), patch: { retainer: 200 }, expected_revision: 0 },
]);
assert.equal(savedBatch.length, 2);
await db.exec('reset role');
await assert.rejects(db.exec('update finance_compensation_history set active=true'), /immutable/);
await assert.rejects(db.exec('delete from finance_compensation_history'), /immutable/);
await assert.rejects(db.exec('delete from finance_compensation_legacy_payees'), /immutable/);
assert.equal((await db.query('select total_amount from invoices')).rows[0].total_amount, '1234');
assert.deepEqual((await db.query('select snapshot from earnings_ledger')).rows[0].snapshot, { total: 1234 });
const audited = (await db.query('select actor_id,source,financials from finance_compensation_history where effective_month is not null and brand=$1 and team_member_id=$2 order by revision limit 1', ['alpha', id(10)])).rows[0];
assert.equal(audited.actor_id, id(20));
assert.equal(audited.source.kind, 'approved_sheet');
assert.equal(audited.financials.product_retainer_amount, 50);
await db.exec(`insert into brands_v2 values('${id(33)}','${id(2)}','alpha')`);
await db.exec('set role service_role');
await assert.rejects(read(), /brand unavailable/);
await assert.rejects(write(), /brand unavailable/);
await db.close();
console.log('PASS effective compensation SQL: observed baselines, September preservation, October upsert/tombstone, new payee isolation, atomic batches, complete snapshots, actor/tenant/CAS checks, immutable audit and unchanged invoice/ledger data');
