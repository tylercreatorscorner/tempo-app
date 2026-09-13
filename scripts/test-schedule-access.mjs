import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {NextResponse,NextRequest} from 'next/server.js';
import ts from 'typescript';
function load(path,deps,baseline=false){
 const source=baseline?execFileSync('git',['show',`bab5fc53d26e17a05b8f3f4ecbffb753403312d2:${path}`],{encoding:'utf8'}):readFileSync(path,'utf8');
 const exports={};
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,console,Date,URL,process:{env:{CRON_SECRET:'fixture-cron'}},require:n=>{assert.ok(n in deps,`Unexpected dependency ${n}`);return deps[n];}});
 return exports;
}
let scope={userId:'user-a',tenantId:'tenant-a',role:'manager',canViewFinance:false,permissions:new Set(['reporting:read','reporting:write','drops:read','drops:write']),brandScope:{kind:'scoped',brandIds:['a'],brandSlugs:['alpha']}};
const brands=[{id:'a',slug:'alpha',tenant_id:'tenant-a',parent_brand_id:null,is_umbrella:false},{id:'b',slug:'beta',tenant_id:'tenant-b',parent_brand_id:null,is_umbrella:false}];
let schedules=[];let mutations=0;let generated=0;let delivered=0;
function query(table){
 let filters=[];let operation;let payload;
 const q={select:()=>q,eq:(k,v)=>{filters.push(r=>r[k]===v);return q;},lte:()=>q,order:()=>q,limit:()=>q,
 insert:v=>{operation='insert';payload=v;return q;},update:v=>{operation='update';payload=v;return q;},delete:()=>{operation='delete';return q;},
 maybeSingle:()=>Promise.resolve(run(true)),single:()=>Promise.resolve(run(true)),then:(a,b)=>Promise.resolve(run(false)).then(a,b)};
 function run(one){
  let rows=table==='brands_v2'?brands:table==='report_schedules'?schedules:[{user_id:scope?.userId,tenant_id:scope?.tenantId,role:scope?.role}];
  const selected=rows.filter(r=>filters.every(f=>f(r)));
  if(operation){mutations++;if(operation==='insert'){const row={id:'new',...payload};schedules.push(row);return {data:row,error:null};}if(operation==='update')selected.forEach(r=>Object.assign(r,payload));if(operation==='delete')schedules=schedules.filter(r=>!selected.includes(r));}
  return {data:one?(selected[0]??null):selected,error:null,count:selected.length};
 }
 return q;
}
const db={from:query};
const supabase={createAdminClient:async()=>db,createClient:async()=>({auth:{getUser:async()=>({data:{user:scope?{id:scope.userId}:null}})}})};
const permissions=load('src/lib/auth/permissions.ts',{});
const workspace={getWorkspaceScope:async()=>scope,getWorkspaceScopeForUser:async()=>scope,isBrandInScope:(s,b)=>s.brandScope.kind==='all'||s.brandScope.brandIds.includes(b.id)||s.brandScope.brandSlugs.includes(b.slug)};
const access=load('src/lib/auth/schedule-access.ts',{'@/lib/supabase/server':supabase,'./permissions':permissions,'./workspace-scope':workspace});
const deps={'next/server':{NextResponse},'@/lib/supabase/server':supabase,'@/lib/auth/workspace-scope':workspace,'@/lib/auth/schedule-access':access,'@/lib/data/schedule-frequency':{isValidFrequency:()=>true,nextRunFromLabel:()=>new Date(Date.now()+3600000)},'@/lib/messaging/webhook':{detectWebhookKind:()=> 'discord',deliverToWebhook:async()=>{delivered++;return {ok:true};}}};
const target={tenant_id:'tenant-a',brand:'alpha',source:'reporting',report_type:'performance-summary'};
const body={...target,cron_label:'Daily',webhook_url:'https://discord.com/api/webhooks/fixture/fixture'};
const request=b=>new NextRequest('https://tempo.test/api/schedules',{method:'POST',body:JSON.stringify(b)});
if (process.argv.includes('--reproduce')) {
const baseline=load('src/app/api/schedules/route.ts',deps,true);
assert.equal((await baseline.POST(request({...body,brand:'beta'}))).status,201);
assert.equal((await baseline.POST(request(body))).status,201);
console.log('REPRODUCED baseline cross-tenant schedule creation; legitimate control works');
}
schedules=[];mutations=0;
const api=load('src/app/api/schedules/route.ts',deps);
const item=load('src/app/api/schedules/[id]/route.ts',deps);
for(const brand of ['beta','all','',null,['alpha']]){
 const before=mutations;assert.equal((await api.POST(request({...body,brand}))).status,403);assert.equal(mutations,before);
}
assert.equal((await api.POST(request(body))).status,201);
for(const fields of [{tenant_id:'tenant-b'},{source:'unknown'},{report_type:'unknown'}])assert.equal(await access.canAccessSchedule(scope,{...target,...fields},'write'),false);
const saved={...scope};scope={...scope,permissions:new Set()};assert.equal((await api.POST(request(body))).status,403);scope={...saved,impersonating:{userId:'someone'}};assert.equal((await api.POST(request(body))).status,403);scope=saved;
schedules=[{id:'good',...target,created_by:'previous',cron_label:'Daily'},{id:'bad',...target,brand:'beta'}];
assert.equal((await (await api.GET()).json()).schedules.length,1);
const context=id=>({params:Promise.resolve({id})});
let before=mutations;assert.equal((await item.PATCH(request({brand:'beta'}),context('good'))).status,403);assert.equal(mutations,before);
assert.equal((await item.DELETE(request({}),context('bad'))).status,403);
assert.equal((await item.PATCH(request({channel_label:'updated'}),context('good'))).status,200);assert.equal(schedules[0].created_by,'user-a');
assert.equal((await item.DELETE(request({}),context('good'))).status,200);
console.log('PASS API source permissions, tenant/brand isolation, old+new target checks and execution ownership');
brands.push({id:'parent',slug:'parent',tenant_id:'tenant-a',is_umbrella:true,parent_brand_id:null},{id:'child',slug:'child',tenant_id:'tenant-b',parent_brand_id:'parent',is_umbrella:false});
scope={...saved,brandScope:{kind:'all'}};
assert.equal(await access.canAccessSchedule(scope,{...target,brand:'parent'},'write'),false);
brands[3].tenant_id='tenant-a';assert.equal(await access.canAccessSchedule(scope,{...target,brand:'parent'},'write'),true);assert.equal(await access.canAccessSchedule(scope,{...target,brand:'child'},'write'),true);
scope=saved;
brands.push({id:'duplicate',slug:'alpha',tenant_id:'tenant-b'});
assert.equal(await access.canAccessSchedule(scope,target,'write'),false);
brands.pop();
const cron=load('src/app/api/cron/run-schedules/route.ts',{...deps,'@/lib/data/reports':{generateReport:async()=>{generated++;return 'fixture';}},'@/lib/data/discord-posts':{},'@/lib/data/brand-registry':{getBrandRegistry:async()=>({}),brandLabel:()=> 'Alpha'}});
const cronRequest=new NextRequest('https://tempo.test/api/cron/run-schedules',{headers:{authorization:'Bearer fixture-cron'}});
for(const current of [null,{...saved,tenantId:'tenant-b'},{...saved,permissions:new Set()},{...saved,brandScope:{kind:'scoped',brandIds:[],brandSlugs:[]}}]){
 scope=current;schedules=[{id:'scheduled',...target,created_by:'user-a',active:true,cron_label:'Daily'}];
 before=delivered;const generationBefore=generated;await cron.GET(cronRequest);assert.equal(delivered,before);assert.equal(generated,generationBefore);assert.equal(schedules[0].last_run_status,'failed');
}
scope=saved;schedules=[{id:'scheduled',...target,created_by:'user-a',active:true,cron_label:'Daily'}];await cron.GET(cronRequest);assert.equal(delivered,1);assert.equal(generated,1);assert.equal(schedules[0].last_run_status,'sent');
assert.equal((await cron.GET(new NextRequest('https://tempo.test/api/cron/run-schedules'))).status,401);
console.log('PASS cron rechecks current owner, role, tenant and brand before generation/delivery; valid schedule delivers');
