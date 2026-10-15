import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import ts from 'typescript';

function load(file, dependencies={}) {
  const exports={};
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(code,{exports,Date,Set,Map,console,require:name=>{assert.ok(name in dependencies,`Unexpected import: ${name}`);return dependencies[name];}});
  return exports;
}
const guard=load('src/lib/upload/source-replacement.ts');
assert.equal(guard.sourceFileRowCount(12000,5000,3),12000);
assert.equal(guard.sourceFileRowCount(undefined,5000,3),null);
assert.equal(guard.sourceFileRowCount(undefined,2,1),2);
for(const bad of [-1,1,NaN,Infinity,2.5,'3']) assert.throws(()=>guard.sourceFileRowCount(bad,2,1));

let profile={name:'Fixture',email:'fixture@example.invalid'};
let calls=[],writes=[];
const admin={
  from(table){
    const q={};
    for(const method of ['select','eq','gte','neq','order','limit','is']) q[method]=()=>q;
    for(const method of ['insert','update','upsert','delete']) q[method]=payload=>{writes.push({table,method,payload});return q;};
    q.maybeSingle=()=>Promise.resolve({data:null,error:null});
    q.then=(resolve,reject)=>Promise.resolve({data:table==='ingestion_runs'?[{id:'fixture-run'}]:[],count:3,error:null}).then(resolve,reject);
    return q;
  },
  async rpc(name,args){
    calls.push({name,args});
    if(name==='upload_source_checked_atomic' && args.p_overwrite && (args.p_file_rows==null || args.p_file_rows<3)) {
      return {data:{blocked:true,existingRows:3,fileRows:args.p_file_rows},error:null};
    }
    return {data:{upserted:args.p_records.length,deleted:args.p_overwrite?3:0},error:null};
  },
};
const route=load('src/app/api/upload/run/route.ts',{
  'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status??200})}},
  crypto:{createHash},
  '@/lib/supabase/server':{createAdminClient:async()=>admin},
  '@/lib/auth/require-admin':{requireAdmin:async()=>profile},
  '@/lib/upload/video-identities':{deriveVideoIdentities:()=>[],dropScheduledRows:records=>({kept:records,dropped:0})},
  '@/lib/upload/source-replacement':guard,
});
const records=[1,2].map(i=>({brand:'fixture',report_date:'2026-10-12',creator_name:`fixture-${i}`,gmv:10,orders:1}));
async function run(extra={}){
  calls=[];writes=[];
  return route.POST({json:async()=>({table:'creator_performance',brand:'fixture',reportDate:'2026-10-12',records,overwrite:true,...extra})});
}
let result=await run();
assert.equal(result.status,409);
assert.equal(result.body.sourceReplacementBlocked.existingRows,3);
assert.match(result.body.error,/Existing data was kept/);
assert.ok(!writes.some(w=>w.table==='upload_idempotency'||w.table==='activity_log'),'Rejected source must not get success/idempotency evidence');
assert.equal(calls[0].name,'upload_source_checked_atomic');
assert.equal(calls[0].args.p_file_rows,2);

result=await run({chunkIndex:0,chunkCount:3,fileTotals:{gmv:20,orders:2,rows:12000}});
assert.equal(result.status,200);
assert.equal(calls[0].args.p_file_rows,12000,'First-chunk length must not replace whole-file evidence');
result=await run({overwrite:false,chunkIndex:1,chunkCount:3,fileTotals:{gmv:20,orders:2,rows:12000}});
assert.equal(result.status,200);
assert.equal(calls[0].args.p_overwrite,false);
result=await run({chunkIndex:0,chunkCount:3});
assert.equal(result.status,409,'Unknown multi-chunk file size must not authorize deletion');
assert.equal(calls[0].args.p_file_rows,null);
result=await run({fileTotals:{gmv:20,orders:2,rows:1}});
assert.equal(result.status,400);
assert.equal(calls.length,0);
result=await run({table:'video_performance'});
assert.equal(result.status,409);
assert.equal(calls[0].args.p_table,'video_performance');
result=await run({table:'product_performance'});
assert.equal(result.status,200);
assert.equal(calls[0].name,'upload_product_performance_atomic');
profile=null;
result=await run();
assert.equal(result.status,403);
assert.equal(calls.length,0);
console.log('PASS source replacement: route rejects smaller files, preserves whole-file chunk totals, handles stale clients, keeps product writes and requires admin access');
