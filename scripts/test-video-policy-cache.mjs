import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const tenant = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const brand = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const second = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const user = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
await db.exec(`
create role authenticated; create role anon;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
create function get_tenant_id() returns uuid language sql stable as $$ select nullif(current_setting('test.tenant',true),'')::uuid $$;
create function get_user_role() returns text language sql stable as $$ select nullif(current_setting('test.role',true),'') $$;
create function is_platform_admin() returns boolean language sql stable as $$ select current_setting('test.platform',true)='true' $$;
create function auth_user_allowed_brand_uuids() returns uuid[] language sql stable as $$ select nullif(current_setting('test.brands',true),'')::uuid[] $$;
create table user_brand_access(user_id uuid,tenant_id uuid,brand_id uuid);
insert into user_brand_access values ('${user}','${tenant}','${brand}');
create table daily_video_product_stats(id int primary key,tenant_id uuid,brand_id uuid);
insert into daily_video_product_stats values (1,'${tenant}','${brand}'),(2,'${tenant}','${second}'),(3,'${other}','${brand}');
alter table daily_video_product_stats enable row level security;
grant usage on schema auth to authenticated,anon;
grant all on daily_video_product_stats to authenticated,anon;
grant select on user_brand_access to authenticated,anon;
create policy brand_read_access on daily_video_product_stats for select using
 (tenant_id=get_tenant_id() and get_user_role()='brand' and brand_id in (select brand_id from user_brand_access where user_id=auth.uid()));
create policy coach_scoped_access on daily_video_product_stats using
 (tenant_id=get_tenant_id() and get_user_role()='coach' and brand_id in (select brand_id from user_brand_access where user_id=auth.uid()));
create policy manager_scoped_access on daily_video_product_stats using
 (tenant_id=get_tenant_id() and get_user_role()='manager' and brand_id in (select brand_id from user_brand_access where user_id=auth.uid()));
create policy internal_full_access on daily_video_product_stats using
 (tenant_id=get_tenant_id() and get_user_role() <> all(array['brand','manager','coach']));
create policy platform_admin_bypass on daily_video_product_stats using (is_platform_admin());
create policy brand_restriction on daily_video_product_stats as restrictive to authenticated using
 (auth_user_allowed_brand_uuids() is null or brand_id=any(auth_user_allowed_brand_uuids()));
`);
const cases = [
  { role:'owner', allowed:'', visible:[1,2] },
  { role:'admin', allowed:'', visible:[1,2] },
  { role:'viewer', allowed:'', visible:[1,2] },
  { role:'manager', allowed:`{${brand}}`, visible:[1] },
  { role:'coach', allowed:`{${brand}}`, visible:[1] },
  { role:'brand', allowed:`{${brand}}`, visible:[1] },
  { role:'manager', allowed:'{}', visible:[] },
  { role:'owner', allowed:`{${second}}`, visible:[2] },
  { role:'owner', allowed:'', platform:true, visible:[1,2,3] },
  { role:'owner', allowed:`{${brand}}`, platform:true, visible:[1,3] },
  { role:'', allowed:'', anonymous:true, visible:[] },
  { role:'', allowed:'', visible:[] },
];
async function outcomes() {
  const results=[];
  for (const c of cases) {
    await db.exec(`reset role; select set_config('test.user','${c.role ? user : ''}',false),
      set_config('test.tenant','${c.role ? tenant : ''}',false),set_config('test.role','${c.role}',false),
      set_config('test.brands','${c.allowed}',false),set_config('test.platform','${!!c.platform}',false);
      set role ${c.anonymous ? 'anon' : 'authenticated'};`);
    const rows=(await db.query('select id from daily_video_product_stats order by id')).rows.map(r=>r.id);
    assert.deepEqual(rows,c.visible);
    const writes=[];
    for(const scope of [tenant,other]) for(const targetBrand of [brand,second]) {
      for(const operation of [
        `insert into daily_video_product_stats values(99,'${scope}','${targetBrand}') returning id`,
        `update daily_video_product_stats set tenant_id='${scope}',brand_id='${targetBrand}' where id=1 returning id`,
        `delete from daily_video_product_stats where tenant_id='${scope}' and brand_id='${targetBrand}' returning id`,
      ]) {
        await db.exec('begin');
        try { writes.push((await db.query(operation)).rows.map(r=>r.id)); }
        catch(e) { writes.push(e.code); }
        finally { await db.exec('rollback'); }
      }
    }
    results.push({rows,writes});
  }
  await db.exec('reset role');
  return results;
}
const metadata = () => db.query("select policyname,permissive,roles,cmd,with_check from pg_policies where tablename='daily_video_product_stats' order by policyname");
const before=await outcomes(), metaBefore=(await metadata()).rows;
const migration=readFileSync('supabase/migrations/20260914203808_video_policy_statement_cache.sql','utf8');
await db.exec(migration);
assert.deepEqual(await outcomes(),before,'Read and write decisions must be identical');
assert.deepEqual((await metadata()).rows,metaBefore,'Policy reach and WITH CHECK must be preserved');
await assert.rejects(db.exec(migration),/Unreviewed video policy/,'Unreviewed/repeated definitions must fail closed');
await db.close();
console.log('PASS video policies: identical reads/writes across roles, tenants, brands, empty scopes, platform access and anonymous callers; drift rejected');
