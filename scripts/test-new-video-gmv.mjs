import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const compile = path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const model={}; runInNewContext(compile('src/lib/data/new-video-gmv.ts'),{exports:model});
assert.equal(model.validVideoRange('2026-02-30','2026-03-01'),false);
assert.equal(model.validVideoRange('2026-01-01','2027-12-31'),false);
assert.equal(model.validVideoRange('2026-09-20','2026-09-14'),false);
assert.equal(model.validVideoRange('2026-09-14','2026-09-20'),true);
let scope={tenantId:'ours',brandScope:{kind:'scoped',brandSlugs:['alpha']}};
let args=null,readFilters=[],fail=false;
const route={};
runInNewContext(compile('src/app/api/new-video-gmv/route.ts'),{
  exports:route,AbortSignal,console:{error(){}},
  require(path){
    if(path==='next/server')return {NextResponse:{json:(data,options={})=>({data,status:options.status??200,headers:options.headers})}};
    if(path.endsWith('/new-video-gmv'))return model;
    if(path.endsWith('/workspace-scope'))return {getWorkspaceScope:async()=>scope,isBrandInScope:(s,b)=>s.brandScope.kind==='all'||s.brandScope.brandSlugs.includes(b.slug)};
    if(path.endsWith('/data-anchor'))return {getDataAnchorDate:async()=> '2026-09-20'};
    if(path.endsWith('/date-utils'))return {resolveDateRange:(range,start,end)=>({startDate:range==='custom'?start:'2026-09-14',endDate:range==='custom'?end:'2026-09-20'})};
    if(path.endsWith('/supabase/server'))return {createAdminClient:async()=>({
      from:()=>({select(){return this;},eq(k,v){readFilters.push([k,v]);return this;},is(){return this;},then(resolve){return Promise.resolve({data:[{id:'a',slug:'alpha',tenant_id:'ours'},{id:'b',slug:'beta',tenant_id:'ours'}]}).then(resolve);}}),
      rpc:(_name,input)=>{args=input;return {abortSignal:async()=>fail?{error:{message:'timeout'}}:{data:{gmv30d:42}}};}
    })};
    throw Error(path);
  }
});
const get=query=>route.GET({nextUrl:new URL('https://test.invalid/api?'+query)});
assert.equal((await get('brand=alpha&range=custom&start=2026-09-14&end=2026-09-20')).status,200);
assert.equal(args.p_tenant_id,'ours');
assert.equal(args.p_brand_slugs.join(','),'alpha');
assert.ok(readFilters.some(([k,v])=>k==='tenant_id'&&v==='ours'));
args=null;assert.equal((await get('brand=beta')).status,403);assert.equal(args,null);
args=null;assert.equal((await get('range=custom&start=2026-02-30&end=2026-03-01')).status,400);assert.equal(args,null);
scope.brandScope.brandSlugs=[];await get('');assert.equal(args.p_brand_slugs.length,0);
scope=null;args=null;assert.equal((await get('')).status,401);assert.equal(args,null);
scope={tenantId:'ours',brandScope:{kind:'all'}};fail=true;
assert.equal((await get('')).status,503);
console.log('PASS new video endpoint: valid dates, tenant and manager scope, empty scope, unauthorized access, errors remain unavailable');

