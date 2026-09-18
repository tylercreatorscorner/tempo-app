import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {NextResponse} from 'next/server.js';
import ts from 'typescript';
function load(path,deps){const exports={};runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,console,Date,require:n=>{assert.ok(n in deps,`Unexpected ${n}`);return deps[n];}});return exports;}
const original={userId:'u',tenantId:'a',role:'manager',canViewFinance:false,permissions:new Set(['roster:read']),brandScope:{kind:'scoped',brandIds:['brand-a'],brandSlugs:['alpha']}};
let scope=original;let dbError=false;let truncate=false;let rpcCalls=[];
const brands=[{id:'brand-a',slug:'alpha',tenant_id:'a',is_umbrella:false,parent_brand_id:null},{id:'brand-b',slug:'beta',tenant_id:'b',is_umbrella:false,parent_brand_id:null}];
const tables={brands_v2:brands,creators_v2:[{id:'creator-a',tenant_id:'a'},{id:'creator-b',tenant_id:'b'}],creator_brands:[{id:'link',creator_id:'creator-a',brand_id:'brand-a'}],tiktok_accounts:[{creator_id:'creator-a',tiktok_username:'FixtureHandle'}]};
function from(table){let filters=[];const q={select:()=>q,eq:(k,v)=>{filters.push(r=>r[k]===v);return q;},in:(k,vs)=>{filters.push(r=>vs.includes(r[k]));return q;},limit:()=>q,maybeSingle:async()=>({data:run().data[0]??null}),then:(a,b)=>Promise.resolve(run()).then(a,b)};function run(){const rows=tables[table].filter(r=>filters.every(f=>f(r)));return {data:truncate?rows.slice(0,1):rows,count:rows.length,error:dbError?{message:'fixture failure'}:null};}return q;}
function client(kind){return {from,rpc:async(name,args)=>{assert.equal(kind,'admin','Privileged RPC uses server credential');assert.ok(args.p_brand_slugs?.length,'Never allow null/empty global filter');rpcCalls.push({name,args});return {data:[{posts:1,views:20,likes:3,comments:1,video_id:'v',video_title:'Fixture',brand_slug:'alpha',gmv:10}],error:null};}};}
const supabase={createAdminClient:async()=>client('admin'),createClient:async()=>client('session')};
const workspace={getWorkspaceScope:async()=>scope,isBrandInScope:(s,b)=>s.brandScope.kind==='all'||s.brandScope.brandIds.includes(b.id)||s.brandScope.brandSlugs.includes(b.slug)};
const permissions=load('src/lib/auth/permissions.ts',{});
const authorization=load('src/lib/auth/authorize-creator.ts',{'next/server':{NextResponse},'@/lib/supabase/server':supabase});
const boundary=load('src/lib/auth/creator-report-scope.ts',{'@/lib/supabase/server':supabase,'./workspace-scope':workspace,'./authorize-creator':authorization,'./permissions':permissions});
const reports=load('src/lib/data/creator-profile.ts',{'@/lib/agreements/roster-terms':{},'@/lib/auth/workspace-scope':{},'react':{cache:fn=>fn},'@/lib/supabase/server':supabase,'@/lib/auth/creator-report-scope':boundary,'@/lib/data/brand-registry':{},'@/lib/data/brand-registry-core':{}});
const slugs=async(creator='creator-a',brand)=>Array.from(await boundary.getCreatorReportBrands(creator,brand));
assert.deepEqual(await slugs(),['alpha']);assert.deepEqual(await slugs('creator-a','alpha'),['alpha']);assert.deepEqual(await slugs('creator-a','beta'),[]);assert.deepEqual(await slugs('creator-b'),[]);assert.deepEqual(await slugs('creator-a','all'),[]);
for(const denied of [null,{...original,permissions:new Set()},{...original,tenantId:'b'},{...original,brandScope:{kind:'scoped',brandIds:[],brandSlugs:[]}}]){scope=denied;assert.deepEqual(await slugs(),[]);}
scope=original;dbError=true;assert.deepEqual(await slugs(),[]);dbError=false;
brands.push({id:'duplicate',slug:'alpha',tenant_id:'b'});assert.deepEqual(await slugs(),[]);brands.pop();
brands.push({id:'parent',slug:'parent',tenant_id:'a',is_umbrella:true,parent_brand_id:null},{id:'child',slug:'child',tenant_id:'a',is_umbrella:false,parent_brand_id:'parent'});
original.brandScope.brandIds.push('parent');original.brandScope.brandSlugs.push('parent');
assert.deepEqual(await slugs('creator-a','parent'),['child']);assert.deepEqual(await slugs('creator-a','child'),['child']);
truncate=true;assert.deepEqual(await slugs(),[]);truncate=false;
const e=await reports.getCreatorEngagement('creator-a','2026-01-01','2026-01-31','alpha');assert.equal(e.views,20);
const t=await reports.getCreatorTopContent('creator-a','2026-01-01','2026-01-31',8,'alpha');assert.equal(t[0].videoId,'v');
assert.equal(rpcCalls.length,2);for(const call of rpcCalls)assert.deepEqual(Array.from(call.args.p_brand_slugs),['alpha']);
assert.equal(await reports.getCreatorEngagement('creator-b','2026-01-01','2026-01-31'),null);assert.equal((await reports.getCreatorTopContent('creator-a','2026-01-01','2026-01-31',8,'beta')).length,0);assert.equal(rpcCalls.length,2);
console.log('PASS creator ownership, capability, tenant/brand scopes, umbrella/store access, duplicate slugs and truncated/error reads');
console.log('PASS actual reporting helpers use server credentials with explicit authorized filters; rejected requests never call RPC');
