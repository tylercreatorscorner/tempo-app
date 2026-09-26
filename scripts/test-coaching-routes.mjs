import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {z} from 'zod';
import {NextRequest,NextResponse} from 'next/server.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let scope={userId:id(1),tenantId:id(10),role:'coach',permissions:new Set(['reporting:read','reporting:write']),brandScope:{kind:'scoped',brandIds:[id(20)]}},rpcCalls=[],failure=false,reads=0;
const tables={
 brands_v2:[{id:id(20),tenant_id:id(10),name:'Allowed',is_archived:false},{id:id(21),tenant_id:id(11),name:'Foreign',is_archived:false}],
 coaching_assignments:[{id:id(30),tenant_id:id(10),brand_id:id(20),coach_id:id(1),reviewer_id:id(2),active:true},{id:id(31),tenant_id:id(11),brand_id:id(21),coach_id:id(1),reviewer_id:id(2),active:true},{id:id(32),tenant_id:id(10),brand_id:id(20),coach_id:id(3),reviewer_id:id(4),active:true}],
 user_profiles:[{user_id:id(1),tenant_id:id(10),role:'coach',name:'Coach'},{user_id:id(2),tenant_id:id(10),role:'manager',name:'Reviewer'},{user_id:id(3),tenant_id:id(10),role:'coach',name:'Unassigned'}],
 coaching_weekly_reports:[{id:id(40),tenant_id:id(10),assignment_id:id(30),week_start:'2026-09-21',draft:{summary:'PRIVATE DRAFT'},version:1}],
 coaching_submissions:[{id:id(50),tenant_id:id(10),report_id:id(40),revision:1,content:{summary:'SUBMITTED'}}],coaching_reviews:[],
};
function from(table){reads++;const filters=[];const q={select:()=>q,eq:(k,v)=>{filters.push(r=>r[k]===v);return q;},in:(k,v)=>{filters.push(r=>v.includes(r[k]));return q;},order:()=>q,or:expr=>{const parts=expr.split(',').map(p=>p.split('.eq.'));filters.push(r=>parts.some(([k,v])=>r[k]===v));return q;},then:(yes,no)=>Promise.resolve({data:(tables[table]??[]).filter(r=>filters.every(f=>f(r))),error:failure?new Error('offline'):null}).then(yes,no)};return q;}
const deps={'zod':{z},'next/server':{NextRequest,NextResponse},'@/lib/auth/require-screen':{guardScreen:async()=>scope??NextResponse.json({error:'Forbidden'},{status:403})},'@/lib/supabase/server':{createAdminClient:async()=>({from,rpc:async(name,args)=>{rpcCalls.push({name,args});return {error:null};}})}};
function load(file){const exports={};runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,console,Date,Set,Map,require:name=>{assert.ok(name in deps,name);return deps[name];}});return exports;}
deps['@/lib/auth/permissions']=load('src/lib/auth/permissions.ts');
const model=load('src/lib/coaching/model.ts');deps['@/lib/coaching/model']=model;
const route=load('src/app/api/coaching/route.ts');
const get=()=>route.GET(new NextRequest('https://tempo.test/api/coaching?week=2026-09-21'));
let result=await (await get()).json();assert.equal(result.assignments.length,1);assert.equal(result.brands.length,1);assert.equal(result.people.length,2);assert.equal(result.reports[0].draft.summary,'PRIVATE DRAFT');
scope={...scope,userId:id(2),role:'manager'};result=await (await get()).json();assert.equal(result.reports[0].draft.summary,'');assert.equal(result.submissions[0].content.summary,'SUBMITTED');
scope={...scope,brandScope:{kind:'scoped',brandIds:[]}};result=await (await get()).json();assert.equal(result.assignments.length,0);assert.equal(result.reports.length,0);
scope={...scope,impersonating:{userId:id(2)}};reads=0;assert.equal((await get()).status,403);assert.equal(reads,0);
scope=null;assert.equal((await get()).status,403);
scope={userId:id(1),tenantId:id(10),role:'coach',permissions:new Set(['reporting:read','reporting:write']),brandScope:{kind:'scoped',brandIds:[id(20)]}};
const post=(body,origin='https://tempo.test')=>route.POST(new NextRequest('https://tempo.test/api/coaching',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}));
const input={action:'save',assignmentId:id(30),week:'2026-09-21',expected:1,payload:model.blankDraft()};
assert.equal((await post(input,'https://foreign.test')).status,403);
assert.equal((await post({...input,p_actor:id(2)})).status,400);
assert.equal((await post({action:'assign',brandId:id(20),coachId:id(1),reviewerId:id(2)})).status,403);
assert.equal(rpcCalls.length,0);assert.equal((await post(input)).status,200);assert.equal(rpcCalls[0].args.p_actor,id(1));assert.equal(rpcCalls[0].args.p_tenant,id(10));
scope.permissions=new Set(['reporting:read']);const before=rpcCalls.length;assert.equal((await post(input)).status,403);assert.equal(rpcCalls.length,before);
// Legacy brand IDs are PostgreSQL UUIDs without RFC version/variant bits.
const legacyBrand='b0000000-0000-0000-0000-000000000005';
const assignment={action:'assign',brandId:legacyBrand,coachId:id(1),reviewerId:id(2)};
scope={...scope,role:'owner',permissions:new Set(['reporting:read','reporting:write','reporting:configure'])};
assert.equal((await post(assignment)).status,200);
assert.equal(rpcCalls.at(-1).args.p_payload.brandId,legacyBrand);
const afterLegacy=rpcCalls.length;
for(const brandId of ['leefar','b0000000-0000-0000-0000-00000000000g',legacyBrand+'-extra']){
 assert.equal((await post({...assignment,brandId})).status,400);
}
scope={...scope,role:'coach'};
assert.equal((await post(assignment)).status,403);
assert.equal(rpcCalls.length,afterLegacy);
failure=true;assert.equal((await get()).status,503);
console.log('PASS coaching API: scoped reads, private drafts, foreign/empty brands, impersonation, origin, strict inputs, trusted actor and visible read failures');
