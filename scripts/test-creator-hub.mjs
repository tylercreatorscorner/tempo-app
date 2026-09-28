import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { getCreatorHubCompletion } from '../src/lib/creator-hub/completion.ts';

const base = { item_id: 'item', item_version_id: 'version', required: true,
  kind: 'acknowledgement', completed_at: null, accepted_at: null };
const finalized = '2026-09-28T00:00:00Z';
assert.equal(getCreatorHubCompletion('complete', finalized, []).canUnlock, false);
assert.equal(getCreatorHubCompletion('complete', null, [{ ...base, accepted_at: finalized }]).canUnlock, false);
assert.equal(getCreatorHubCompletion('complete', finalized, [{ ...base, completed_at: finalized }]).canUnlock, false);
assert.equal(getCreatorHubCompletion('in_progress', finalized, [{ ...base, accepted_at: finalized }]).canUnlock, false);
assert.equal(getCreatorHubCompletion('complete', finalized, [{ ...base, accepted_at: finalized },
  { ...base, item_id: 'optional', required: false, accepted_at: null }]).canUnlock, true);

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create table auth.users(id uuid primary key);
  create table public.tenants(id uuid primary key);
  create table public.brands_v2(id uuid primary key, tenant_id uuid, is_archived boolean default false);
  create table public.user_profiles(user_id uuid,tenant_id uuid,role text,role_id uuid);
  create table public.roles(id uuid,tenant_id uuid,key text);
  create table public.role_permissions(role_id uuid,screen text,level text);
  create table public.user_brand_access(user_id uuid,brand_id uuid,tenant_id uuid);
  create table public.brand_manager_assignments(brand_id uuid,manager_user_id uuid);
`);
await db.exec(readFileSync(new URL('../supabase/migrations/20260927221852_creator_application_intake_additive.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20260928021919_creator_hub_additive.sql', import.meta.url), 'utf8'));

const tenant = '00000000-0000-4000-8000-000000000001';
const brand = '00000000-0000-4000-8000-000000000002';
const manager = '00000000-0000-4000-8000-000000000003';
const form = '00000000-0000-4000-8000-000000000004';
const application = '00000000-0000-4000-8000-000000000005';
const enrollment = '00000000-0000-4000-8000-000000000006';
const item = '00000000-0000-4000-8000-000000000007';
const version = '00000000-0000-4000-8000-000000000008';
const snapshotItem = '00000000-0000-4000-8000-000000000009';
const discordId = '123456789012345678';
await db.exec(`
  insert into tenants values ('${tenant}');
  insert into brands_v2(id,tenant_id) values ('${brand}','${tenant}');
  insert into auth.users values ('${manager}');
  insert into creator_application_forms(id,tenant_id,brand_id,created_by) values ('${form}','${tenant}','${brand}','${manager}');
  insert into creator_application_submissions(id,tenant_id,brand_id,form_id,form_version,questions_snapshot,full_name,email,tiktok_handle,status,discord_user_id)
    values ('${application}','${tenant}','${brand}','${form}',1,'[]','Creator','c@example.com','creator','approved','${discordId}');
  insert into creator_hub_items(id,tenant_id,brand_id,kind) values ('${item}','${tenant}','${brand}','acknowledgement');
  insert into creator_hub_item_versions(id,item_id,version,title,content) values ('${version}','${item}',1,'Payment terms','{"text":"I accept"}');
  update creator_hub_items set current_version_id='${version}' where id='${item}';
  insert into creator_hub_enrollments(id,application_id,tenant_id,brand_id,discord_user_id)
    values ('${enrollment}','${application}','${tenant}','${brand}','${discordId}');
  insert into creator_hub_enrollment_items(id,enrollment_id,tenant_id,brand_id,item_id,item_version_id,kind,required)
    values ('${snapshotItem}','${enrollment}','${tenant}','${brand}','${item}','${version}','acknowledgement',true);
`);
await assert.rejects(db.exec(`update creator_hub_item_versions set title='Changed' where id='${version}'`), /immutable/);
await assert.rejects(db.exec(`update creator_hub_enrollments set status='complete', completed_at=now() where id='${enrollment}'`), /not complete/);
await db.exec(`update creator_hub_enrollments set snapshot_finalized_at=now() where id='${enrollment}'`);
await assert.rejects(db.exec(`update creator_hub_enrollments set status='complete', completed_at=now() where id='${enrollment}'`), /not complete/);
await db.exec(`update creator_hub_enrollment_items set accepted_at=now() where id='${snapshotItem}'`);
assert.equal((await db.query('select creator_hub_required_complete($1) as ready', [enrollment])).rows[0].ready, true);
await db.exec(`update creator_hub_enrollments set status='complete', completed_at=now() where id='${enrollment}'`);
await db.exec(`insert into creator_hub_provisioning(enrollment_id,tenant_id,brand_id) values ('${enrollment}','${tenant}','${brand}')`);
await assert.rejects(db.exec(`update creator_hub_enrollment_items set accepted_at=null where id='${snapshotItem}'`), /immutable/);
await assert.rejects(db.exec(`delete from creator_hub_enrollment_items where id='${snapshotItem}'`), /finalized/);
const secondApplication = '00000000-0000-4000-8000-000000000010';
await db.exec(`insert into creator_application_submissions(id,tenant_id,brand_id,form_id,form_version,questions_snapshot,full_name,email,tiktok_handle,status,discord_user_id)
  values ('${secondApplication}','${tenant}','${brand}','${form}',1,'[]','Second Creator','second@example.com','second','approved','${discordId}')`);
const enrolled = (await db.query('select id,snapshot_finalized_at from create_creator_hub_enrollment($1)', [secondApplication])).rows[0];
assert.ok(enrolled.snapshot_finalized_at);
assert.equal((await db.query('select id from create_creator_hub_enrollment($1)', [secondApplication])).rows[0].id, enrolled.id);
const assigned = (await db.query('select id,item_version_id from creator_hub_enrollment_items where enrollment_id=$1', [enrolled.id])).rows[0];
assert.equal(assigned.item_version_id, version);
await assert.rejects(db.query('select status from record_creator_hub_completion($1,$2,$3,$4)',
  [enrolled.id, '999999999999999999', assigned.id, true]), /unavailable/);
await assert.rejects(db.query('select status from record_creator_hub_completion($1,$2,$3,$4)',
  [enrolled.id, discordId, assigned.id, false]), /explicit acceptance/);
assert.equal((await db.query('select status from record_creator_hub_completion($1,$2,$3,$4)',
  [enrolled.id, discordId, assigned.id, true])).rows[0].status, 'complete');
assert.equal((await db.query('select status from record_creator_hub_completion($1,$2,$3,$4)',
  [enrolled.id, discordId, assigned.id, true])).rows[0].status, 'complete');
const publish = (itemId, expectedVersion, title) => db.query(
  'select * from publish_creator_hub_item($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
  [tenant, brand, itemId, 'video', title, JSON.stringify({ url: 'https://example.com/video' }),
    false, true, 5, expectedVersion],
);
const published = (await publish(null, null, 'Welcome video')).rows[0];
assert.equal(published.published_version, 1);
const republished = (await publish(published.published_item_id, 1, 'Updated welcome video')).rows[0];
assert.equal(republished.published_version, 2);
await assert.rejects(publish(published.published_item_id, 1, 'Stale update'), /version changed/);
assert.equal((await db.query('select title from creator_hub_item_versions where id=$1',
  [published.published_version_id])).rows[0].title, 'Welcome video');
const grants = await db.query(`select
  has_table_privilege('anon','public.creator_hub_enrollments','select') anon_read,
  has_table_privilege('authenticated','public.creator_hub_enrollments','select') staff_read,
  has_function_privilege('authenticated','public.creator_hub_required_complete(uuid)','execute') staff_gate,
  has_function_privilege('authenticated','public.create_creator_hub_enrollment(uuid)','execute') staff_enroll,
  has_function_privilege('authenticated','public.record_creator_hub_completion(uuid,text,uuid,boolean)','execute') staff_complete,
  has_function_privilege('authenticated','public.publish_creator_hub_item(uuid,uuid,uuid,text,text,jsonb,boolean,boolean,integer,integer)','execute') staff_publish`);
assert.deepEqual(Object.values(grants.rows[0]), [false, false, false, false, false, false]);
const thirdApplication = '00000000-0000-4000-8000-000000000011';
const managerRole = '00000000-0000-4000-8000-000000000012';
await db.exec(`
  insert into user_profiles(user_id,tenant_id,role,role_id) values ('${manager}','${tenant}','manager','${managerRole}');
  insert into roles(id,tenant_id,key) values ('${managerRole}','${tenant}','manager');
  insert into role_permissions(role_id,screen,level) values ('${managerRole}','roster','write');
  insert into user_brand_access(user_id,brand_id,tenant_id) values ('${manager}','${brand}','${tenant}');
  insert into brand_manager_assignments(brand_id,manager_user_id) values ('${brand}','${manager}');
  insert into creator_application_submissions(id,tenant_id,brand_id,form_id,form_version,questions_snapshot,full_name,email,tiktok_handle,status,discord_user_id)
    values ('${thirdApplication}','${tenant}','${brand}','${form}',1,'[]','Third Creator','third@example.com','third','pending','${discordId}');
`);
const approved = (await db.query('select status from approve_creator_application_with_hub($1,$2,$3,$4,$5)',
  [thirdApplication, tenant, manager, 'pending', null])).rows[0];
assert.equal(approved.status, 'approved');
assert.equal((await db.query('select count(*)::int as n from creator_hub_enrollments where application_id=$1',
  [thirdApplication])).rows[0].n, 1);
assert.equal((await db.query('select kind,status from creator_application_notifications where submission_id=$1',
  [thirdApplication])).rows[0].kind, 'approved');
assert.equal((await db.query('select status from creator_application_notifications where submission_id=$1',
  [thirdApplication])).rows[0].status, 'pending');
const claimed = (await db.query('select lease_token,attempt_count from claim_creator_hub_provisioning($1)',
  [enrolled.id])).rows[0];
assert.equal(claimed.attempt_count, 1);
assert.ok(claimed.lease_token);
assert.equal((await db.query('select lease_token from claim_creator_hub_provisioning($1)',
  [enrolled.id])).rows[0].lease_token, null);
await db.close();
console.log('creator hub snapshot, acceptance, and unlock gate: passed');
