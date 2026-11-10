import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function load(path, deps) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Date, Set, Map, Promise, AbortSignal, console,
    require: name => { assert.ok(name in deps, name); return deps[name]; } });
  return exports;
}
const core = load('src/lib/data/brand-registry-core.ts', {});
const rows = [
  {id:'a', slug:'alpha', parent_brand_id:null},
  {id:'b', slug:'beta', parent_brand_id:null},
  {id:'u', slug:'umbrella', parent_brand_id:null, is_umbrella:true},
  {id:'c', slug:'child', parent_brand_id:'u'},
  {id:'z', slug:'archived', parent_brand_id:null, is_archived:true},
].map(r=>({name:r.slug,is_archived:false,is_umbrella:false,...r}));
const reg=core.buildRegistry(rows);
const registryRows = [...rows.map(r=>({...r,tenant_id:'tenant-a'})),
  ...Array.from({length:1001},(_,i)=>({id:`extra-${i}`,slug:`extra-${i}`,tenant_id:'tenant-a'})),
  {id:'foreign',slug:'foreign',tenant_id:'tenant-b'}];
let registryPages=0;
function from(table) {
  assert.equal(table,'brands_v2');
  const filters=[];
  const q={select:()=>q,order:()=>q,eq:(key,value)=>{filters.push(r=>r[key]===value);return q;},
    range:async(start,end)=>{registryPages++;return {data:registryRows.filter(r=>filters.every(f=>f(r))).slice(start,end+1),error:null};}};
  return q;
}
const scope={tenantId:'tenant-a',canViewCreatorCost:true,brandScope:{kind:'all'}};
const input={scope,reg,brand:'all',storeFilter:null,pStartDate:'2026-11-01',pEndDate:'2026-11-02',periodDays:30};
let failGmv=false, failVideos=false, failBudget=false, partial=false, zero=false, calls=[], budgetBrands;
const rpc=(name,args)=>{
  calls.push({name,args});
  assert.equal(args.p_tenant_id,'tenant-a');
  return {abortSignal: async()=> {
    assert.equal(name,'get_roster_summary_workspace','One scoped batch, no separate slow coverage scan or per-store fanout');
    assert.deepEqual([...args.p_data_slugs],['alpha','beta','child']);
    assert.deepEqual([...args.p_roster_slugs],['alpha','beta','umbrella','child']);
    assert.equal(args.p_start,'2026-11-01'); assert.equal(args.p_end,'2026-11-02');
    if(failGmv)return {data:null,error:{message:'unavailable'}};
    return {error:null,data:{managed_gmv:zero?0:300,affiliate_gmv:zero?0:3000,coverage_complete:!partial}};
  }};
};
const summary=load('src/lib/data/roster-summary-scoped.ts',{
  '@/lib/data/brand-registry-core':core,
  '@/lib/data/fetch-all-rows':load('src/lib/data/fetch-all-rows.ts',{}),
  '@/lib/supabase/server':{createAdminClient:async()=>({rpc,from})},
  '@/lib/data/roster-summary-retainer':{getRosterSummaryRetainer:async(s,b,slugs)=>{
    budgetBrands=[...slugs]; if(failBudget)throw Error('budget failed'); return s.canViewCreatorCost ? {total:450,complete:true,missingCount:0} : null;
  }},
  '@/lib/data/published-videos':{getPublishedVideoCounts:async(args)=>{
    assert.equal(args.tenantId,'tenant-a');
    assert.equal(args.start,'2026-11-01'); assert.equal(args.end,'2026-11-02');
    assert.equal(args.priorStart,args.start); assert.equal(args.priorEnd,args.end,'No unused prior-month publication scan');
    if(failVideos)throw Error('videos failed');
    // One ID appearing on several stores remains one publication in the RPC.
    return {total:zero?0:7,currentComplete:!partial};
  }},
});
const scopedRegistry=await summary.getRosterSummaryRegistry(scope);
assert.equal(scopedRegistry.rows.length,1006); assert.equal(scopedRegistry.bySlug.has('foreign'),false);
assert.equal(registryPages,2,'Registry reads page beyond 1000 and retain tenant filtering');
let result=await summary.loadRosterSummary(input);
assert.equal(result.totalGmvPeriod,300); assert.equal(result.summary.videos_published,7);
assert.equal(result.summary.total_retainer,450);
assert.equal(result.summary.gmv_complete,true);
assert.deepEqual(budgetBrands,['alpha','beta','umbrella','child'],'Active scopes once, including child-only contracts; archived scopes excluded');
assert.equal(calls.length,1,'One aggregate read handles the portfolio');
const manager={...scope,brandScope:{kind:'scoped',brandSlugs:['child']}};
const selected=summary.rosterSummarySelection(manager,reg,null,null);
assert.deepEqual([...selected.dataSlugs],['child']); assert.deepEqual([...selected.groups[0].roster],['child']);
assert.throws(()=>summary.rosterSummarySelection(manager,reg,'alpha',null),/outside/);
assert.throws(()=>summary.rosterSummarySelection(manager,reg,null,'alpha'),/outside/);
assert.throws(()=>summary.rosterSummarySelection(scope,reg,'foreign',null),/outside/);
assert.throws(()=>summary.rosterSummarySelection(scope,reg,'archived',null),/outside/);
assert.equal(summary.rosterSummarySelection({...manager,brandScope:{kind:'scoped',brandSlugs:[]}},reg,null,null).groups.length,0);
partial=true; result=await summary.loadRosterSummary(input);
assert.equal(result.totalGmvPeriod,300); assert.equal(result.summary.gmv_complete,false);
assert.equal(result.summary.videos_published,7); assert.equal(result.summary.videos_complete,false);
zero=true; result=await summary.loadRosterSummary(input);
assert.equal(result.totalGmvPeriod,null); assert.equal(result.summary.videos_published,null,'Incomplete zero is not confirmed zero activity');
partial=false; zero=true; result=await summary.loadRosterSummary(input);
assert.equal(result.totalGmvPeriod,0); assert.equal(result.summary.videos_published,0); assert.equal(result.summary.gmv_complete,true);
zero=false; failGmv=true; result=await summary.loadRosterSummary(input);
assert.equal(result.totalGmvPeriod,null); assert.equal(result.summary.videos_published,7); assert.equal(result.summary.total_retainer,450);
failGmv=false; failVideos=true; result=await summary.loadRosterSummary(input);
assert.equal(result.totalGmvPeriod,300); assert.equal(result.summary.videos_published,null);
failVideos=false; failBudget=true; result=await summary.loadRosterSummary(input);
assert.equal(result.summary.total_retainer,null); assert.equal(result.totalGmvPeriod,300);
failBudget=false;
const longWindow=await summary.loadRosterSummary({...input,pStartDate:'2025-01-01'});
assert.equal(longWindow.totalGmvPeriod,null); assert.equal(longWindow.summary.videos_published,null);
assert.equal(longWindow.summary.total_retainer,450,'Long optional windows must not break current budget or the roster');
await assert.doesNotReject(()=>summary.loadRosterSummary({...input,pStartDate:null,periodDays:366}),'Accepted inclusive legacy window must not turn summary into a500');
let registryReads=0, dataReads=0;
const query=load('src/lib/data/roster-query.ts',{
  '@/lib/roster/creator-tags':{}, '@/lib/agreements/roster-terms':{},
  '@/lib/data/brand-registry':core, '@/lib/data/date-utils':{},
  '@/lib/auth/permissions':{can:s=>s.permitted===true},
  '@/lib/supabase/server':{createAdminClient:async()=>{dataReads++;throw Error('Forbidden query reached data');}},
  '@/lib/data/roster-summary':{...summary,getRosterSummaryRegistry:async()=>{registryReads++;return reg;}},
});
assert.equal((await query.runRosterQuery(scope,new URLSearchParams())).status,403);
assert.equal(registryReads,0,'Capability denial performs no registry/data read');
assert.equal((await query.runRosterQuery({...manager,permitted:true},new URLSearchParams('brand=alpha'))).status,403);
assert.equal(registryReads,0,'Explicit foreign brand denial happens before DB reads');
assert.equal((await query.runRosterQuery({...manager,permitted:true},new URLSearchParams('store=alpha'))).status,403);
assert.equal(dataReads,0,'Forged store cannot reach performance or roster reads');
console.log('PASS roster summary: scoped store membership, tenant args, current budget scope, unique publication RPC count, independent failures, explicit partials, genuine zero, denied and empty access');
