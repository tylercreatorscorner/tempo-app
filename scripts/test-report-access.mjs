import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {NextRequest,NextResponse} from 'next/server.js';
import ts from 'typescript';
import {format} from 'date-fns';
const own={userId:'actor',tenantId:'a',role:'admin',canViewFinance:true,brandScope:{kind:'all'},permissions:new Set(['reporting:read'])};
let scope=own,failure=false,truncated=false,calls=[];
const brand=(id,tenant,extra={})=>({id,slug:id,name:id,tenant_id:tenant,is_archived:false,is_umbrella:false,parent_brand_id:null,...extra});
const brands=[brand('own','a'),brand('foreign','b')];
function from(table){let filters=[],limit=null;const q={select:()=>q,order:()=>q,
  eq:(k,v)=>{filters.push(r=>r[k]===v);return q;},in:(k,v)=>{filters.push(r=>v.includes(r[k]));return q;},limit:n=>{limit=n;return q;},
  maybeSingle:()=>run(true),then:(r,j)=>Promise.resolve(run(false)).then(r,j)};
  function run(single){if(failure)return {data:null,error:{message:'fixture'},count:null};let data=(table==='brands_v2'?brands:[]).filter(r=>filters.every(f=>f(r)));const count=data.length+(truncated?1:0);if(limit)data=data.slice(0,limit);return {data:single?data[0]??null:data,error:null,count};}return q;}
const deps={'next/server':{NextRequest,NextResponse},'date-fns':{format},
  '@/lib/supabase/server':{createAdminClient:async()=>({from}),createClient:async()=>({from})},
  '@/lib/auth/workspace-scope':{getWorkspaceScope:async()=>scope,isBrandInScope:(s,b)=>s.brandScope.kind==='all'||s.brandScope.brandIds.includes(b.id)||s.brandScope.brandSlugs.includes(b.slug)},
  '@/lib/rate-limit':{throttle:()=>true}};
function load(file){const exports={};runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,console,Set,Map,Date,require:name=>{let key=name;if(name.startsWith('./')&&file.includes('/auth/'))key='@/lib/auth/'+name.slice(2);assert.ok(key in deps,key);return deps[key];}});return exports;}
deps['@/lib/auth/permissions']=load('src/lib/auth/permissions.ts');
deps['@/lib/data/brand-registry-core']=load('src/lib/data/brand-registry-core.ts');
deps['@/lib/data/brand-registry']=deps['@/lib/data/brand-registry-core'];
deps['@/lib/auth/schedule-access']=load('src/lib/auth/schedule-access.ts');
deps['@/lib/auth/report-access']=load('src/lib/auth/report-access.ts');
deps['./rpc']=Object.fromEntries(['getBrandSummary','getCreatorRankings','getVideoSummary','getDailyTrend','getAnalyticsBrandTotals','getAnalyticsCreatorRankings'].map(name=>[name,async target=>{calls.push({name,target});return [];} ]));
deps['@/lib/data/reports']=load('src/lib/data/reports.ts');
const route=load('src/app/api/reporting/route.ts');
const request=brand=>new NextRequest('https://fixture.invalid/api/reporting?type=performance-summary&brand='+brand);
scope={...own,permissions:new Set()};assert.equal((await route.GET(request('own'))).status,403);assert.equal(calls.length,0);
scope=own;assert.equal((await route.GET(request('foreign'))).status,403);assert.equal(calls.length,0);
scope={...own,brandScope:{kind:'scoped',brandIds:['own'],brandSlugs:['own']}};assert.equal((await route.GET(request('all'))).status,403);assert.equal((await route.GET(request('foreign'))).status,403);
scope=own;brands.push(brand('duplicate','b',{slug:'own'}));await assert.rejects(deps['@/lib/auth/report-access'].getReportRegistry(scope,'all','performance-summary'),/ambiguous/);assert.equal((await route.GET(request('own'))).status,403);brands.pop();
for(const broken of ['failure','truncated']){failure=broken==='failure';truncated=broken==='truncated';await assert.rejects(deps['@/lib/auth/report-access'].getReportRegistry(scope,'all','performance-summary'));}failure=false;truncated=false;
brands.push(brand('parent','b',{is_umbrella:true}),brand('child','a',{parent_brand_id:'parent'}));assert.equal((await route.GET(request('child'))).status,403);brands.splice(2);
assert.equal(calls.length,0,'Denied requests must never reach analytics');
let response=await route.GET(request('own'));assert.equal(response.status,200);assert.ok((await response.json()).text.includes('Performance Summary'));
calls=[];response=await route.GET(request('all'));assert.equal(response.status,200);assert.ok(calls.length>0);
for(const call of calls){if(Array.isArray(call.target))assert.deepEqual(Array.from(call.target),['own']);else assert.equal(call.target,'own');}
brands.push(brand('parent','a',{is_umbrella:true}),brand('child','a',{parent_brand_id:'parent'}));calls=[];response=await route.GET(request('child'));assert.equal(response.status,200);assert.ok(calls.some(c=>Array.isArray(c.target)&&c.target.includes('child')));
console.log('PASS actual report route/generator: denied capabilities, foreign brands, scoped all, duplicate slugs, query failures, truncation and foreign parent');
console.log('PASS named brand, tenant-only All brands analytics targets and deliberate child-store reporting');
