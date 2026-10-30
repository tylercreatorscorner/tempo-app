import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const legacyBrand = 'b0000000-0000-0000-0000-000000000001';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create table tenants(id uuid primary key);
create table brands_v2(id uuid primary key, tenant_id uuid, parent_brand_id uuid);
create table user_profiles(user_id uuid primary key, tenant_id uuid, role text);
insert into tenants values ('${id(1)}'),('${id(2)}');
insert into brands_v2 values ('${legacyBrand}','${id(1)}',null),('${id(10)}','${id(1)}',null),('${id(11)}','${id(2)}',null),('${id(12)}','${id(1)}',null),('${id(13)}','${id(1)}','${id(10)}');
insert into user_profiles values ('${id(20)}','${id(1)}','owner'),('${id(21)}','${id(2)}','admin'),('${id(22)}','${id(1)}','manager');
grant usage on schema public to service_role;
grant select on all tables in schema public to service_role;
grant update on brands_v2 to service_role;`);
const migration = readdirSync('supabase/migrations').find(name => name.endsWith('_agency_business_clients.sql'));
await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'));
const legacyFix = readdirSync('supabase/migrations').find(name => name.endsWith('_agency_business_legacy_brand_ids.sql'));
await db.exec(readFileSync(`supabase/migrations/${legacyFix}`, 'utf8'));
const tieredTerms = readdirSync('supabase/migrations').find(name => name.endsWith('_agency_business_tiered_terms.sql'));
await db.exec(readFileSync(`supabase/migrations/${tieredTerms}`, 'utf8'));
const save = (payload, tenant = id(1), actor = id(20)) => db.query('select agency_business_save_client($1,$2,$3) as value', [tenant, actor, JSON.stringify(payload)]).then(result => result.rows[0].value);
const list = (tenant = id(1)) => db.query('select agency_business_list_clients($1) as value', [tenant]).then(result => result.rows[0].value);
const draft = { expectedRevision: 0, name: 'Client A', brandIds: [id(10)], serviceStart: '2026-01-15', serviceEnd: null, exitReason: null, terms: [] };
for (const role of ['anon', 'authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(save(draft), /permission denied/);
  await assert.rejects(list(), /permission denied/);
  for (const query of ['select * from agency_business_client_revisions', 'delete from agency_business_client_revisions', 'update agency_business_client_revisions set revision=2', `insert into agency_business_client_revisions values('${id(1)}','${id(5)}',1,'${id(20)}','{}')`]) await assert.rejects(db.query(query), /permission denied/);
  await db.exec('reset role');
}
for (const signature of ['agency_business_list_clients(uuid)', 'agency_business_save_client(uuid,uuid,jsonb)']) {
  const row = (await db.query('select prosecdef from pg_proc where oid=$1::regprocedure', [signature])).rows[0];
  assert.equal(row.prosecdef, false);
}
await db.exec('set role service_role');
await assert.rejects(save(draft, id(1), id(21)), /Invalid agency scope/);
await assert.rejects(save(draft, id(1), id(22)), /Invalid agency scope/);
await assert.rejects(save({ ...draft, brandIds: [id(11)] }), /Invalid agency brands/);
await assert.rejects(save({ ...draft, brandIds: [id(13)] }), /Invalid agency brands/);
for (const bad of [{ ...draft, extra: true }, { ...draft, expectedRevision: 0.5 }, { ...draft, serviceStart: '2026-02-30' }, { ...draft, serviceEnd: '2025-01-01', exitReason: 'Exit' }, { ...draft, brandIds: [id(10), id(10)] }, { ...draft, terms: [{ effectiveMonth: '2026-01', feeModel: 'fixed' }] }]) await assert.rejects(save(bad), /Invalid agency/);
const first = await save(draft);
assert.equal(first.revision, 1);
assert.deepEqual(first.terms, []);
assert.deepEqual(await list(id(2)), []);
await assert.rejects(save({ ...draft, name: 'Overlapping client' }), /already belongs/);
const update = { ...draft, id: first.id, expectedRevision: 1, terms: [{ effectiveMonth: '2026-01', monthlyRetainer: 0, revSharePercent: 0, feeModel: 'fixed' }] };
const second = await save(update);
assert.equal(second.revision, 2);
assert.equal(second.terms[0].monthlyRetainer, 0);
await assert.rejects(save(update), /changed/);
await assert.rejects(save({ ...update, brandIds: [id(11)] }, id(2), id(21)), /changed/);
const competing = await Promise.allSettled([save({ ...update, expectedRevision: 2, name: 'Winner one' }), save({ ...update, expectedRevision: 2, name: 'Winner two' })]);
assert.equal(competing.filter(result => result.status === 'fulfilled').length, 1);
assert.equal(competing.filter(result => result.status === 'rejected').length, 1);
// PGlite serializes its connection; this verifies stale competing CAS, not multi-session lock scheduling.
const winner = competing.find(result => result.status === 'fulfilled').value;
const exit = await save({ ...update, expectedRevision: 3, serviceEnd: '2026-08-31', exitReason: 'Service completed' });
assert.equal(exit.revision, 4);
assert.equal((await list())[0].serviceEnd, '2026-08-31');
assert.equal((await db.query('select count(*)::int as n from agency_business_client_revisions')).rows[0].n, 4);
assert.deepEqual((await db.query('select snapshot from agency_business_client_revisions where revision=1')).rows[0].snapshot, first);
await assert.rejects(db.query('update agency_business_client_revisions set revision=99'), /permission denied/);
await assert.rejects(db.query('delete from agency_business_client_revisions'), /permission denied/);
await db.exec('reset role');
await assert.rejects(db.query('update agency_business_client_revisions set revision=99'), /immutable/);
await assert.rejects(db.query('delete from agency_business_client_revisions'), /immutable/);
assert.equal(winner.revision, 3);

console.log('PASS agency SQL: service-only invoker RPCs, tenant/actor/brand scope, strict data, CAS, unique current grouping, immutable revisions and retained exits');

await db.exec('set role service_role');
const legacyClient = await save({ ...draft, name: 'Legacy brand client', brandIds: [legacyBrand] });
assert.deepEqual(legacyClient.brandIds, [legacyBrand]);
await assert.rejects(save({ ...draft, brandIds: ['b0000000-0000-0000-0000-000000000099'] }), /Invalid agency brands/);
await assert.rejects(save({ ...draft, brandIds: [legacyBrand] }, id(2), id(21)), /Invalid agency brands/);
const tiers = [{ upToGmv: 500000, percent: 10 }, { upToGmv: 1500000, percent: 7.5 }, { upToGmv: 3500000, percent: 6.5 }, { upToGmv: null, percent: 5.5 }];
const tiered = { effectiveMonth: '2026-06', feeModel: 'tiered', monthlyRetainer: 10000, revSharePercent: 0, revShareTiers: tiers, tierCalculation: 'marginal', gmvBasis: 'agency_supported_affiliate' };
const tieredDraft = { ...draft, name: 'Tiered client', brandIds: [id(12)], terms: [tiered] };
for (const override of [
  { revSharePercent: 10 }, { tierCalculation: null }, { tierCalculation: 'automatic' }, { gmvBasis: 'all_affiliates' },
  { revShareTiers: [] }, { revShareTiers: [{ upToGmv: 10, percent: 5 }] },
  { revShareTiers: [{ upToGmv: 20, percent: 5 }, { upToGmv: 10, percent: 5 }, { upToGmv: null, percent: 5 }] },
  { revShareTiers: [{ upToGmv: null, percent: 5 }, { upToGmv: null, percent: 5 }] },
  { revShareTiers: [{ upToGmv: 0, percent: 5 }, { upToGmv: null, percent: 5 }] },
  { revShareTiers: [{ upToGmv: null, percent: 100.01 }] }, { revShareTiers: [{ upToGmv: null, percent: 1.001 }] },
  { revShareTiers: [{ upToGmv: null, percent: 5, extra: true }] },
  { revShareTiers: [{ upToGmv: null }] }, { revShareTiers: [null] },
  { revShareTiers: Array.from({ length: 21 }, (_, index) => ({ upToGmv: index === 20 ? null : index + 1, percent: 5 })) },
]) await assert.rejects(save({ ...tieredDraft, terms: [{ ...tiered, ...override }] }), /Invalid agency/);
const missingMethod = { ...tiered }; delete missingMethod.tierCalculation;
await assert.rejects(save({ ...tieredDraft, terms: [missingMethod] }), /Invalid agency tiers/);
await assert.rejects(save({ ...tieredDraft, terms: [{ effectiveMonth: '2026-06', feeModel: 'fixed', monthlyRetainer: 10000, revSharePercent: 0, gmvBasis: 'managed' }] }), /Invalid agency tiers/);
const tieredClient = await save(tieredDraft);
assert.deepEqual(tieredClient.terms, [tiered]);
await assert.rejects(save({ ...tieredDraft, name: 'Overlapping tier client' }), /already belongs/);
await assert.rejects(save({ ...tieredDraft, id: tieredClient.id, expectedRevision: 1 }, id(2), id(21)), /changed/);
assert.deepEqual((await list()).find(row => row.id === tieredClient.id).terms[0].revShareTiers, tiers);
const pending = await save({ ...tieredDraft, id: tieredClient.id, expectedRevision: 1, terms: [{ ...tiered, tierCalculation: 'unconfirmed' }] });
assert.equal(pending.revision, 2);
assert.equal(pending.terms[0].tierCalculation, 'unconfirmed');
await db.exec('reset role');

// Historical is optional for older API clients. It must never be lost on their next save.
const historicalMigration = readdirSync('supabase/migrations').find(name => name.endsWith('_agency_business_historical_clients.sql'));
assert.ok(historicalMigration);
assert.equal((await list()).find(row => row.id === first.id).historical, undefined, 'existing immutable snapshots remain unchanged');
await db.exec(readFileSync(`supabase/migrations/${historicalMigration}`, 'utf8'));
for (const role of ['anon', 'authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(save({ ...draft, historical: true }), /permission denied/);
  await db.exec('reset role');
}
await db.exec('set role service_role');
const historicalDraft = { ...draft, name: 'Past agreement', brandIds: [], serviceStart: null, historical: true };
for (const historical of [null, 'true', 'false', 0, 1, {}, []]) await assert.rejects(save({ ...historicalDraft, historical }), /Invalid agency/);
await assert.rejects(save(historicalDraft, id(1), id(22)), /Invalid agency scope/);
const archived = await save(historicalDraft);
assert.equal(archived.historical, true);
assert.equal(archived.serviceStart, null);
assert.equal(archived.serviceEnd, null);
assert.deepEqual(archived.terms, []);
const oldWriterDraft = { ...historicalDraft }; delete oldWriterDraft.historical;
const retainedArchive = await save({ ...oldWriterDraft, id: archived.id, expectedRevision: 1, name: 'Past agreement, renamed' });
assert.equal(retainedArchive.historical, true, 'an older caller cannot silently reactivate a saved historical agreement');
assert.equal(retainedArchive.revision, 2);
await assert.rejects(save({ ...oldWriterDraft, id: archived.id, expectedRevision: 1 }), /changed/);
const reactivated = await save({ ...oldWriterDraft, id: archived.id, expectedRevision: 2, historical: false });
assert.equal(reactivated.historical, false, 'explicit false is required to reactivate');
assert.equal(reactivated.serviceStart, null, 'reactivation does not invent unknown dates');
const legacyWriter = await save({ ...oldWriterDraft, name: 'Legacy writer new client' });
assert.equal(legacyWriter.historical, false, 'new clients from older callers default to current');
const legacyRevision = await save({ ...tieredDraft, id: pending.id, expectedRevision: pending.revision });
assert.equal(legacyRevision.historical, false, 'existing snapshots without the flag retain current behavior');
assert.equal((await list()).find(row => row.id === archived.id).historical, false);
await db.exec('reset role');
assert.equal((await db.query("select prosecdef from pg_proc where oid='agency_business_save_client(uuid,uuid,jsonb)'::regprocedure")).rows[0].prosecdef, false);
console.log('PASS historical agency SQL: optional strict boolean, immutable legacy snapshots, old-writer preservation, explicit reactivation, empty terms/unknown dates, scope and CAS');
// A new migration extends validation without changing any immutable prior revision.
const componentsMigration = readdirSync('supabase/migrations').find(name => name.endsWith('_agency_fee_components_manager_allocations.sql'));
// The combined migration also references the finance table row type.
await db.exec(`create table agency_client_invoices(id uuid,tenant_id uuid,client_id uuid,month text,revision integer,status text,snapshot jsonb,collected_on date,manager_paid_on date);`);
await db.exec(readFileSync(`supabase/migrations/${componentsMigration}`, 'utf8'));
await db.exec('set role service_role');
const componentTerm = { effectiveMonth: '2026-10', monthlyRetainer: 4000, revSharePercent: 2, feeModel: 'components', managerComponent: { monthlyRetainer: 6000, revSharePercent: 3, feeModel: 'minimum' } };
const componentDraft = { ...draft, name: 'Gross component client', serviceStart: '2026-10-01', brandIds: [], terms: [componentTerm] };
for (const managerComponent of [null, {}, { ...componentTerm.managerComponent, feeModel: 'fixed' }, { ...componentTerm.managerComponent, extra: true }, { ...componentTerm.managerComponent, monthlyRetainer: -1 }, { ...componentTerm.managerComponent, revSharePercent: 3.001 }]) await assert.rejects(save({ ...componentDraft, terms: [{ ...componentTerm, managerComponent }] }), /Invalid agency/);
const missingComponent = { ...componentTerm }; delete missingComponent.managerComponent;
await assert.rejects(save({ ...componentDraft, terms: [missingComponent] }), /Invalid agency/);
await assert.rejects(save({ ...componentDraft, terms: [{ ...componentTerm, feeModel: 'additive' }] }), /Invalid agency/);
await assert.rejects(save({ ...componentDraft, terms: [{ ...componentTerm, tierCalculation: 'whole' }] }), /Invalid agency/);
const componentClient = await save(componentDraft);
assert.deepEqual(componentClient.terms, [componentTerm]);
await assert.rejects(save({ ...componentDraft, id: componentClient.id, expectedRevision: 0 }), /Invalid agency/);
await assert.rejects(save(componentDraft, id(2), id(20)), /Invalid agency scope/);
assert.deepEqual((await list()).find(row => row.id === tieredClient.id).terms[0].revShareTiers, tiers, 'signed tiered terms retain their exact original bands');
assert.deepEqual((await db.query('select snapshot from agency_business_client_revisions where client_id=$1 and revision=1', [first.id])).rows[0].snapshot, first, 'old gross fee models and snapshots remain unchanged');
await db.exec('reset role');
for (const role of ['anon', 'authenticated']) { await db.exec(`set role ${role}`); await assert.rejects(save(componentDraft), /permission denied/); await db.exec('reset role'); }
assert.equal((await db.query("select prosecdef from pg_proc where oid='agency_business_save_client(uuid,uuid,jsonb)'::regprocedure")).rows[0].prosecdef, false);
console.log('PASS gross component SQL: strict component fields, old tier and snapshot preservation, scoped invoker writes and CAS');
await db.close();
