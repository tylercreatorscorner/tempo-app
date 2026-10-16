import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
function load(file,dependencies={}) {
  const exports={};
  const js=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(js,{exports,Date,Set,Map,console,require:name=>{assert.ok(name in dependencies,`Unexpected import ${name}`);return dependencies[name];}});
  return exports;
}
const helper=load('src/lib/tiktok/recovery-pages.ts');
assert.equal(helper.recoveryDateWindow('2026-02-30','2026-10-14'),null);
assert.equal(helper.recoveryDateWindow('2026-10-15','2026-10-14'),null);
assert.equal(helper.recoveryDateWindow('2024-02-29','2026-10-14').end,'2024-03-01');
let pages=[];
let result=await helper.captureRecoveryPages({rowKey:'videos',fetchPage:async token=>({data:{videos:token?[{id:'b'}]:[{id:'a'}],total_count:2,next_page_token:token?'':'next'},requestId:null}),savePage:async (...args)=>pages.push(args)});
assert.equal(result.exhausted,true);assert.equal(result.rows,2);assert.equal(pages.length,2);
await assert.rejects(helper.captureRecoveryPages({rowKey:'videos',fetchPage:async()=>({data:{videos:[{}],total_count:3,next_page_token:''},requestId:null}),savePage:async()=>{}}),/reported total/);
await assert.rejects(helper.captureRecoveryPages({rowKey:'videos',fetchPage:async()=>({data:{videos:[{}],next_page_token:'loop'},requestId:null}),savePage:async()=>{}}),/repeated/);
await assert.rejects(helper.captureRecoveryPages({rowKey:'videos',fetchPage:async()=>({data:{surprise:[]},requestId:null}),savePage:async()=>{}}),/missing videos/);
await assert.rejects(helper.captureRecoveryPages({rowKey:'orders',fetchPage:async()=>({data:{orders:[]},requestId:null}),savePage:async()=>{}}),/exhaustion/);
result=await helper.captureRecoveryPages({rowKey:'videos',maxPages:1,fetchPage:async()=>({data:{videos:[{}],next_page_token:'more'},requestId:null}),savePage:async()=>{}});
assert.equal(result.exhausted,false);
let profile={tenant_id:'tenant-fixture'},authorized=true,connectCalls=0,impersonating=false,writes=[],filters=[];
const admin={from(table){const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},maybeSingle:async()=>({data:authorized?{slug:'fixture'}:null,error:null}),insert(payload){writes.push({table,payload});return Promise.resolve({error:null});}};return q;}};
const route=load('src/app/api/tiktok/recovery/route.ts',{
  'next/server':{NextResponse:{json:(body,opt={})=>({body,status:opt.status??200})}},
  'node:crypto':{randomUUID},'date-fns-tz':{fromZonedTime:v=>new Date(`${v}Z`)},
  '@/lib/auth/require-admin':{requireAdmin:async()=>profile},
  '@/lib/auth/platform-admin':{assertNotImpersonating:async()=>{if(impersonating)throw Error('read only');}},
  '@/lib/supabase/server':{createAdminClient:async()=>admin},
  '@/lib/tiktok/connections':{getActiveConnection:async()=>{connectCalls++;return {ok:true,client:{get:async()=>({data:{videos:[{id:'fixture',gmv:999}],total_count:1,next_page_token:''},requestId:'fixture'}),post:async()=>({data:{orders:[],total_count:0,next_page_token:''},requestId:null})}};}},
  '@/lib/tiktok/compass':{marketYesterday:()=> '2026-10-14',COMPASS_MARKET_TIME_ZONE:'UTC',fetchDailyExport:async()=>({ok:false,stage:'poll',taskId:'fixture-task',message:'Still building'})},
  '@/lib/upload/read-workbook':{readUploadWorkbook:()=>{throw Error('Should not parse a pending task');}},
  '@/lib/tiktok/recovery-pages':helper,
});
const run=extra=>route.POST({json:async()=>({brand:'fixture',date:'2026-10-12',source:'video_analytics',...extra})});
result=await run();assert.equal(result.status,200);assert.equal(result.body.status,'captured');assert.equal(result.body.factsChanged,false);
assert.ok(filters.some(([k,v])=>k==='tenant_id'&&v==='tenant-fixture'));
assert.ok(writes.every(w=>w.table==='tiktok_api_captures'),'Capture must never write performance facts');
assert.ok(writes.some(w=>w.payload.response.videos?.[0].gmv===999),'Raw vendor money must be retained separately, not mapped to affiliate facts');
result=await run({source:'creator_compass'});assert.equal(result.body.status,'incomplete');assert.equal(result.body.taskId,'fixture-task');
result=await run({date:'2026-02-30'});assert.equal(result.status,400);
result=await run({orderTimeZone:'unrecognized'});assert.equal(result.status,400);
authorized=false;let before=connectCalls;result=await run();assert.equal(result.status,403);assert.equal(connectCalls,before);
authorized=true;impersonating=true;result=await run();assert.equal(result.status,403);assert.equal(connectCalls,before);
profile=null;result=await run();assert.equal(result.status,403);
console.log('PASS recovery: strict pagination, count mismatches, repeated tokens, page caps, date validity, tenant access, impersonation, pending tasks and capture-only writes');
