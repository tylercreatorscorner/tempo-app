import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';
const token = 'a'.repeat(24);
const base = {tenant_id:'tenant-a',brand_slug:'brand-a',report_type:'weekly',revoked_at:null,period_label:'Sep 13–19',period_start:'2026-09-13',period_end:'2026-09-19',created_at:'2026-09-20T00:00:00Z'};
let rows=[], fail=false, selects=[];
function from(){let filters=[],start=0,end=999,fields='';const q={
 select:s=>{fields=s;selects.push(s);return q;},eq:(k,v)=>{filters.push(r=>r[k]===v);return q;},is:(k,v)=>{filters.push(r=>r[k]===v);return q;},order:()=>q,range:(s,e)=>{start=s;end=e;return q;},
 maybeSingle:async()=>({data:rows.find(r=>filters.every(f=>f(r)))??null,error:fail?{}:null}),
 then:(resolve,reject)=>Promise.resolve({data:rows.filter(r=>filters.every(f=>f(r))).slice(start,end+1).map(r=>Object.fromEntries(fields.split(',').map(k=>[k,r[k]]))),error:fail?{}:null}).then(resolve,reject)};return q;}
const exports={};runInNewContext(ts.transpileModule(readFileSync('src/app/api/report-history/[token]/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='next/server'?{NextRequest,NextResponse}:{createAdminClient:async()=>({from})}});
const call=(t=token,page='0')=>exports.GET(new NextRequest(`https://tempo.invalid/api/report-history/${t}?page=${page}`),{params:Promise.resolve({token:t})});
rows=[{...base,token,id:'anchor'}, {...base,token:'b'.repeat(24),id:'prior'}, {...base,token:'c'.repeat(24),tenant_id:'tenant-b'}, {...base,token:'d'.repeat(24),brand_slug:'brand-b'}, {...base,token:'e'.repeat(24),report_type:'monthly'}, {...base,token:'f'.repeat(24),revoked_at:'2026-10-01'}];
let response=await call();assert.equal(response.status,200);let body=await response.json();assert.deepEqual(body.reports.map(r=>r.token),[token,'b'.repeat(24)]);assert.equal(body.nextPage,null);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.ok(selects.every(s=>!s.includes('snapshot')&&!s.includes('notes')));
for(const patch of [{revoked_at:'2026-10-01'},{tenant_id:null},{brand_slug:'all'},{report_type:'performance'}]){rows[0]={...base,token,...patch};assert.equal((await call()).status,404);}
rows=[{...base,token}];assert.equal((await call('0'.repeat(24))).status,404);assert.equal((await call(token,'-1')).status,400);assert.equal((await call(token,'1.5')).status,400);assert.equal((await call(token,'10001')).status,400);assert.equal((await call('bad')).status,400);
rows=Array.from({length:35},(_,i)=>({...base,token:i===0?token:String(i).padStart(24,'0')}));body=await (await call()).json();assert.equal(body.reports.length,30);assert.equal(body.nextPage,1);body=await (await call(token,'1')).json();assert.equal(body.reports.length,5);assert.equal(body.nextPage,null);
rows[0].revoked_at='2026-10-05';assert.equal((await call()).status,404);fail=true;assert.equal((await call()).status,503);
console.log('PASS report history: tenant, exact brand, cadence, revoked/legacy/all-brand denial, metadata-only, pagination, no-cache and failures');
