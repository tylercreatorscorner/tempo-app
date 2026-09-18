import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const id='11111111-1111-4111-8111-111111111111';
const foreign='22222222-2222-4222-8222-222222222222';
let scope,allowed,archived,dbError,linked,adminReads,writes;
function reset(){scope={tenantId:id,userId:id,canViewCreatorCost:true,impersonating:false};allowed=true;archived=false;dbError=false;linked=true;adminReads=0;writes=0;}
function load(file,deps){const exports={};runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date,structuredClone,require:name=>{assert.ok(name in deps,name);return deps[name];}});return exports;}
const model=load('src/lib/agreements/model.ts',{});
const api=load('src/lib/agreements/service.ts',{
 'server-only':{},'./model':model,
 '@/lib/auth/workspace-scope':{getWorkspaceScope:async()=>scope,isBrandInScope:()=>allowed},
 '@/lib/auth/platform-admin':{getActiveTenantId:async()=>null,assertNotImpersonating:async()=>{if(scope.impersonating)throw Error('Read-only');}},
 '@/lib/auth/permissions':{can:()=>allowed},
 '@/lib/supabase/server':{createAdminClient:async()=>{adminReads++;return {
  from:table=>{const filters={};const q={select:()=>q,eq:(key,value)=>{filters[key]=value;return q;},maybeSingle:async()=>{
   assert.equal(filters.tenant_id,id,'Every entity lookup is tenant constrained');
   if(dbError)return {data:null,error:{message:'fixture failure'}};
   if(table==='creator_agreement_ledgers')return {data:null,error:null};
   if(table==='brands_v2')return {data:filters.id===id?{id,tenant_id:id,slug:'fixture',is_archived:archived}:null,error:null};
   if(table==='creators_v2')return {data:filters.id===id?{id}:null,error:null};
   if(table==='creator_brands')return {data:linked && filters.creator_id===id && filters.brand_id===id?{id}:null,error:null};
   throw Error(table);
  }};return q;},
  rpc:async()=>{writes++;return {data:1,error:null};}
 };}}
});
reset();await api.agreementContext(id,id,true);assert.equal(adminReads,1);
reset();scope.canViewCreatorCost=false;await assert.rejects(api.agreementContext(id,id),/denied/);assert.equal(adminReads,0);
reset();allowed=false;await assert.rejects(api.agreementContext(id,id),/denied/);assert.equal(adminReads,0);
reset();scope.impersonating=true;await assert.rejects(api.agreementContext(id,id,true),/Read-only/);assert.equal(adminReads,0);
reset();await assert.rejects(api.agreementContext(foreign,id),/denied/);
reset();await assert.rejects(api.agreementContext(id,foreign),/denied/);
reset();linked=false;await assert.rejects(api.agreementContext(id,id),/denied/);
reset();archived=true;await assert.rejects(api.agreementContext(id,id,true),/denied/);await api.agreementContext(id,id,false);
reset();dbError=true;await assert.rejects(api.agreementContext(id,id),/verified/);
reset();const day=new Date().toLocaleDateString('en-CA',{timeZone:'America/Chicago'});
const input={id,version:0,requestId:foreign,command:{action:'create',kind:'monthly',start:day,deadline:null,terms:{feeCents:10000,requiredPosts:10,renewal:'automatic',payment:'prorated_posts',priorPeriodCredits:'not_allowed'},reason:'Fixture agreement'}};
const preview=await api.writeAgreement(id,id,input,true);assert.equal(preview.state.periods.length,1);assert.equal(writes,0,'Server review never persists terms');
await api.writeAgreement(id,id,input,false);assert.equal(writes,1);
await assert.rejects(api.writeAgreement(id,id,{...input,command:{action:'advance',through:day,reason:'Not allowed'}},true),/Invalid agreement action/);
console.log('PASS agreement service: permissions, tenant/brand relationship, archived/view-as denial, failed reads, pure review and trusted advance');
