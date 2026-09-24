import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
let scope={tenantId:'ours',email:'operator',canViewCreatorCost:false,brandScope:{kind:'scoped',brandSlugs:['m3']}},row={brand:'m3'},writes=[];
class Response {constructor(data,status=200){this.data=data;this.status=status;}static json(data,options){return new Response(data,options?.status);}}
const deps={
 'next/server':{NextResponse:Response},
 '@/lib/auth/workspace-scope':{getWorkspaceScope:async()=>scope},
 '@/lib/supabase/server':{createAdminClient:async()=>({from:table=>{
  assert.equal(table,'managed_creators');let values=null,filters={};
  const q={select(){return q;},eq(k,v){filters[k]=v;return q;},update(v){values=v;return q;},
   maybeSingle:async()=>{assert.equal(filters.tenant_id,'ours');return {data:row};},
   single:async()=>{writes.push({values,filters});return {data:{id:30},error:null};}};return q;
 }})},
};
const exports={};
runInNewContext(ts.transpileModule(readFileSync('src/app/api/roster/[id]/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{assert.ok(n in deps,n);return deps[n];},Date,Number});
const save=date=>exports.PATCH({json:async()=>({reporting_start_date:date})},{params:Promise.resolve({id:'30'})});
for(const date of ['2026-09-01','2026-10-01',null]) {assert.equal((await save(date)).status,200);assert.equal(writes.at(-1).values.reporting_start_date,date);assert.equal(writes.at(-1).filters.tenant_id,'ours');assert.equal(writes.at(-1).filters.id,'30');assert.equal(writes.at(-1).values.updated_by,'operator');}
const count=writes.length;
for(const date of ['2026-02-30','0000-01-01','09/01/2026','bad',123,{},''])assert.equal((await save(date)).status,400);
row={brand:'foreign'};assert.equal((await save('2026-09-01')).status,403);
row=null;assert.equal((await save('2026-09-01')).status,404);
scope=null;assert.equal((await save('2026-09-01')).status,401);
assert.equal(writes.length,count);
console.log('PASS reporting-date route: editable dates, null legacy basis, calendar validation, actor stamping, tenant and brand authorization');
