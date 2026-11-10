import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration=readFileSync('supabase/migrations/20261110181348_roster_summary_workspace.sql','utf8').replace(/\r/g,'');
assert.match(migration,/SECURITY INVOKER/);
assert.match(migration,/SET enable_mergejoin = off/);
assert.match(migration,/REVOKE ALL[\s\S]*FROM PUBLIC, anon, authenticated/);
assert.match(migration,/GRANT EXECUTE[\s\S]*TO service_role/);
assert.match(migration,/b\.tenant_id = p_tenant_id AND b\.slug = wanted\.slug/);
assert.match(migration,/cp\.tenant_id = p_tenant_id AND cp\.brand = ANY\(p_data_slugs\)/);
assert.match(migration,/t\.tenant_id = p_tenant_id AND t\.creator_id = r\.creator_id/);
assert.match(migration,/jsonb_build_array\(data_slug, handle\)/);
assert.match(migration,/m\.managed_days @> cp\.report_date/);
assert.match(migration,/managed_rows - managed_valued_rows/);
assert.doesNotMatch(migration,/\b(?:INSERT INTO|UPDATE public|DELETE FROM|SECURITY DEFINER)\b/i);

const brands=[
 {id:'a',tenant_id:'A',slug:'alpha',is_umbrella:false},
 {id:'b',tenant_id:'A',slug:'beta',is_umbrella:false},
 {id:'u',tenant_id:'A',slug:'umbrella',is_umbrella:true},
 {id:'ca',tenant_id:'A',slug:'child_a',parent_brand_id:'u',is_umbrella:false},
 {id:'cb',tenant_id:'A',slug:'child_b',parent_brand_id:'u',is_umbrella:false},
 {id:'foreign-a',tenant_id:'B',slug:'alpha',is_umbrella:false},
];
const roster=[
 {id:1,tenant_id:'A',brand:'alpha',creator_id:'alice',account_1:'Alice',reporting_start_date:'2026-10-02',archived_at:'2026-10-04T00:00:00Z'},
 {id:2,tenant_id:'A',brand:'alpha',creator_id:'alice',account_1:'alice',reporting_start_date:'2026-10-02',archived_at:'2026-10-04T00:00:00Z'},
 {id:3,tenant_id:'A',brand:'child_a',account_1:'storeonly'},
 {id:4,tenant_id:'A',brand:'umbrella',account_1:'both'},
 {id:5,tenant_id:'A',brand:'child_a',account_1:'both'},
 {id:6,tenant_id:'A',brand:'alpha',account_1:'excluded',tags:['reporting-exclude:2026-10']},
 {id:7,tenant_id:'B',brand:'alpha',account_1:'foreign'},
 {id:8,tenant_id:'A',brand:'beta',creator_id:'canonical'},
 {id:9,tenant_id:'A',brand:'alpha',account_1:'nullable'},
];
const accounts=[
 {tenant_id:'A',creator_id:'canonical',tiktok_username:'Canonical'},
 {tenant_id:'B',creator_id:'canonical',tiktok_username:'bad'},
];
const perf=[
 ['A','alpha','alice','2026-10-01',100],['A','alpha','alice','2026-10-02',10],
 ['A','alpha','alice','2026-10-03',20],['A','alpha','alice','2026-10-04',100],
 ['A','alpha','@Alice ','2026-10-02',5],['A','child_a','storeonly','2026-10-02',30],
 ['A','child_b','storeonly','2026-10-02',400],['A','child_a','both','2026-10-02',40],
 ['A','child_b','both','2026-10-02',50],['A','alpha','excluded','2026-10-02',500],
 ['B','alpha','alice','2026-10-02',900],['A','alpha','foreign','2026-10-02',700],
 ['A','beta','canonical','2026-10-02',60],['A','beta','bad','2026-10-02',600],
].map(([tenant_id,brand,creator_name,report_date,gmv])=>({tenant_id,brand,creator_name,report_date,gmv,period_type:'daily'}));
const nullable=[...perf,{tenant_id:'A',brand:'alpha',creator_name:'nullable',report_date:'2026-10-02',gmv:null,period_type:'daily'}];
const records=(name,rows,columns)=>name+" AS (SELECT * FROM jsonb_to_recordset('"+JSON.stringify(rows).replaceAll("'","''")+"'::jsonb) AS x("+columns+"))";
const prefixes=[
 records('fixture_brands',brands,'id text, tenant_id text, slug text, parent_brand_id text, is_umbrella boolean'),
 records('fixture_roster',roster,'id integer, tenant_id text, brand text, creator_id text, reporting_start_date date, archived_at timestamptz, tags text[], '+Array.from({length:10},(_,i)=>'account_'+(i+1)+' text').join(',')),
 records('fixture_accounts',accounts,'tenant_id text, creator_id text, tiktok_username text'),
 records('fixture_perf',perf,'tenant_id text, brand text, creator_name text, report_date date, gmv numeric, period_type text'),
 records('fixture_null_perf',nullable,'tenant_id text, brand text, creator_name text, report_date date, gmv numeric, period_type text'),
];
const original=migration.slice(migration.indexOf('WITH stores'),migration.indexOf('\n  );'));
function body(table='fixture_perf',child=false){
 return original.replaceAll('public.brands_v2','fixture_brands').replaceAll('public.managed_creators','fixture_roster')
  .replaceAll('public.tiktok_accounts','fixture_accounts').replaceAll('public.creator_performance',table)
  .replaceAll('p_tenant_id',"'A'").replaceAll('p_start',"'2026-10-01'::date").replaceAll('p_end',"'2026-10-04'::date")
  .replaceAll('p_data_slugs',child?"ARRAY['child_b']":"ARRAY['alpha','beta','child_a','child_b']")
  .replaceAll('p_roster_slugs',child?"ARRAY['child_b']":"ARRAY['alpha','beta','umbrella','child_a','child_b']");
}
const sql='SET LOCAL enable_mergejoin = off;\nWITH '+prefixes.join(',\n')+
 ',\nbase AS ('+body()+'),\nnullable AS ('+body('fixture_null_perf')+'),\nchild AS ('+body('fixture_perf',true)+')\n'+
 "SELECT jsonb_build_object('base_pass',b.jsonb_build_object = '{\"managed_gmv\":215,\"affiliate_gmv\":2615,\"coverage_complete\":false,\"source_days\":7,\"expected_days\":16}'::jsonb,"+
 "'nullable_pass',n.jsonb_build_object->'managed_gmv'='null'::jsonb AND n.jsonb_build_object->'affiliate_gmv'='null'::jsonb,"+
 "'child_scope_pass',(c.jsonb_build_object->>'managed_gmv')::numeric=0 AND (c.jsonb_build_object->>'affiliate_gmv')::numeric=450,"+
 "'actual',b.jsonb_build_object) AS fixture_results FROM base b CROSS JOIN nullable n CROSS JOIN child c;";
if(process.argv.includes('--sql')) console.log(sql);
else {
  const db = new PGlite();
  try {
    await db.exec("SET TIME ZONE 'UTC'");
    const results = await db.exec(sql);
    const fixture = results.at(-1).rows[0].fixture_results;
    assert.equal(fixture.base_pass, true, `Tenant/store membership, duplicate identities, reporting dates, exclusions and normalized handles must reconcile: ${JSON.stringify(fixture)}`);
    assert.equal(fixture.nullable_pass, true, 'Missing money must remain null');
    assert.equal(fixture.child_scope_pass, true, 'Child-only scope must not inherit parent or sibling membership');
    assert.deepEqual(fixture.actual, {managed_gmv:215,affiliate_gmv:2615,coverage_complete:false,source_days:7,expected_days:16});
    console.log('PASS roster summary SQL: executed exact migration-body PostgreSQL fixtures for tenant/store scope, duplicate memberships, reporting dates, exclusions, normalized handles, nullable money and coverage');
  } finally { await db.close(); }
}

