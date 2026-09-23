import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
function load(file,deps={}){const exports={};runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{assert.ok(n in deps,n);return deps[n];}});return exports;}
const tags=load('src/lib/roster/creator-tags.ts');
assert.equal(tags.normalizeCreatorTag('  Elite  '),'elite');
assert.equal(tags.normalizeCreatorTag('a,b'),null);
assert.equal(tags.normalizeCreatorTag('x'.repeat(41)),null);
assert.equal(tags.matchesCreatorTags(['Elite','skincare'],['elite','skincare'],'all'),true);
assert.equal(tags.matchesCreatorTags(['elite'],['elite','skincare'],'all'),false);
assert.equal(tags.matchesCreatorTags(['elite'],['elite','skincare'],'any'),true);
assert.equal(tags.matchesCreatorTags(null,['elite'],'any'),false);
let scope,rows,writes,conflict;
function reset(){scope={tenantId:'tenant-a',email:'actor@example.invalid',permissions:new Set(['roster:read','roster:write']),brandScope:{kind:'scoped',brandSlugs:['brand-a']}};rows=[{id:1,tenant_id:'tenant-a',brand:'brand-a',tags:null,archived_at:null},{id:2,tenant_id:'tenant-a',brand:'brand-a',tags:['skincare'],archived_at:null},{id:3,tenant_id:'tenant-b',brand:'brand-a',tags:null,archived_at:null},{id:4,tenant_id:'tenant-a',brand:'brand-b',tags:null,archived_at:null}];writes=[];conflict=false;}
function query(){let filters=[],patch=null,from=0,to=1000;const q={select(){return q;},eq(k,v){filters.push(r=>k==='tags'?JSON.stringify(r.tags)===JSON.stringify(JSON.parse(v.replace(/^\{/,'[').replace(/\}$/,']'))):r[k]===v);return q;},is(k,v){filters.push(r=>r[k]===v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},order(){return q;},range(a,b){from=a;to=b+1;return q;},update(v){patch=v;return q;},then(resolve){let selected=rows.filter(r=>filters.every(f=>f(r))).slice(from,to);if(patch){if(conflict){selected=[];}else for(const r of selected){writes.push({id:r.id,...patch});Object.assign(r,patch);}}return Promise.resolve({data:selected.map(r=>({...r})),error:null}).then(resolve);}};return q;}
const api=load('src/app/api/roster/tags/route.ts',{'next/server':{NextResponse:{json:(body,init)=>({body,status:init?.status??200})}},'@/lib/auth/workspace-scope':{getWorkspaceScope:async()=>scope},'@/lib/auth/permissions':{can:(s,screen,level)=>s.permissions.has(`${screen}:${level}`)},'@/lib/supabase/server':{createAdminClient:async()=>({from:t=>{assert.equal(t,'managed_creators');return query();}})},'@/lib/roster/creator-tags':tags});
const post=(ids=[1,2],extra={})=>api.POST({json:async()=>({brand:'brand-a',tag:'Elite',action:'add',ids,...extra})});
reset();let result=await post();assert.equal(result.status,200);assert.equal(JSON.stringify(rows[1].tags),'["skincare","elite"]');assert.equal(writes[0].updated_by,scope.email);
result=await post();assert.equal(result.status,200);assert.equal(writes.length,2,'repeat add is a no-op');
result=await post([2],{action:'remove'});assert.equal(result.status,200);assert.equal(JSON.stringify(rows[1].tags),'["skincare"]');
reset();assert.equal((await post([1,3])).status,409);assert.equal(writes.length,0,'foreign tenant rejects whole selection');
reset();assert.equal((await post([1,4])).status,409);assert.equal(writes.length,0,'foreign brand rejects whole selection');
reset();scope.impersonating={userId:'other'};assert.equal((await post()).status,403);
reset();scope.permissions.delete('roster:write');assert.equal((await post()).status,403);
reset();assert.equal((await post([1],{brand:'brand-b'})).status,403);
reset();conflict=true;result=await post();assert.equal(result.status,409);assert.equal(result.body.failed.length,2);assert.equal(writes.length,0);
reset();rows[1].tags=['elite'];result=await api.GET({nextUrl:new URL('https://example.invalid/api/roster/tags?brand=brand-a')});assert.equal(JSON.stringify(result.body.tags),'["elite"]');assert.equal(result.body.canWrite,true);
assert.equal((await post([0])).status,400);assert.equal((await post([1],{tag:'a,b'})).status,400);
console.log('PASS creator tags: normalization, any/all, additive/remove/idempotent writes, tenant and brand isolation, read-only impersonation, capability denial, compare-and-set conflicts and scoped catalog');
