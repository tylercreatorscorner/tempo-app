import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const exports = {};
runInNewContext(ts.transpileModule(readFileSync('src/lib/data/dashboard-signals.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {exports});
const row = (slug,currentGmv,prevGmv,recordedDays=7,previousRecordedDays=7) => ({slug,currentGmv,prevGmv,recordedDays,previousRecordedDays});
const build = exports.buildDashboardSignals;
let result = build([row('down',700,1000),row('up',1500,1000),row('small',110,100),row('new',200,0),row('missing',0,1000,6),row('prior-gap',2000,1000,7,6)],7,true);
assert.equal(result.attention.find(r=>r.slug==='missing').kind,'coverage');
assert.equal(result.attention.find(r=>r.slug==='prior-gap').kind,'coverage');
assert.equal(result.attention[0].slug,'down');
assert.equal(result.attention[0].percent,-30);
assert.equal(result.opportunities[0].slug,'up');
assert.equal(result.opportunities.find(r=>r.slug==='new').percent,null);
assert.equal(result.opportunities.some(r=>r.slug==='small'),false);
assert.equal(build([row('zero',0,1000)],7,true).attention[0].percent,-100);
assert.equal(build([row('unauthorized-not-supplied',NaN,1000)],7,true).attention.length,0);
result=build([row('down',0,1000)],7,false);
assert.equal(result.available,false);assert.equal(result.attention.length,0);assert.equal(result.opportunities.length,0);
assert.equal(build([row('flat',0,0)],7,true).opportunities.length,0);
console.log('PASS dashboard signals: dollar materiality, separate directions, zero baseline, current/prior missing days, failed inputs, impact ordering');

const trendExports = {};
runInNewContext(ts.transpileModule(readFileSync('src/lib/data/dashboard-trend.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {exports:trendExports});
const days = ['2026-01-01','2026-01-02','2026-01-03'];
const daily = new Map([['a',new Map([[days[0],100],[days[2],0]])],['b',new Map([[days[0],50],[days[2],20]])],['outside',new Map([[days[0],9999]])]]);
const trend = trendExports.buildDashboardTrend(days,['a','b','empty','a'],daily);
assert.deepEqual(Array.from(trend, p=>p.gmv), [150,null,20]);
assert.deepEqual(Array.from(trend, p=>p.date), days);
assert.equal(trend[0].recordedBrands,2);
assert.equal(trend.reduce((sum,p)=>sum+(p.gmv??0),0),170);
assert.equal(trendExports.buildDashboardTrend(days,['empty'],daily)[0].gmv,null);
console.log('PASS dashboard trend: an empty brand does not suppress recorded totals; gaps retain calendar positions; zeros, scope, duplicate IDs and reconciliation');

// Exercise the privileged identity read with hostile requested slugs and scoped viewers.
let adminCalls = [];
let avatarCalls = [];
let permitted = true;
let scope = {brandScope:{kind:'scoped',brandSlugs:['a','b']}};
let assignmentFailed = false;
const brandRows = [{id:'a-id',slug:'a',tenant_id:'tenant-a'}, {id:'b-id',slug:'b',tenant_id:'tenant-a'}, {id:'outside-id',slug:'outside',tenant_id:'tenant-b'}];
function queryResult(table, rows, error=null) {
  const filters=[];
  const query={
    select(){return query;},
    in(key,values){filters.push(row=>values.includes(row[key]));return query;},
    eq(key,value){if(key!=='is_archived') filters.push(row=>row[key]===value);return query;},
    then(resolve,reject){return Promise.resolve({data:rows.filter(row=>filters.every(test=>test(row))),error}).then(resolve,reject);}
  };
  return query;
}
const managerExports={};
runInNewContext(ts.transpileModule(readFileSync('src/lib/data/dashboard-managers.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports:managerExports,
  require(path){
    if(path==='server-only') return {};
    if(path.endsWith('/supabase/server')) return {
      createClient:async()=>({from:()=>queryResult('brands_v2',brandRows)}),
      createAdminClient:async()=>({from(table){adminCalls.push(table); return table==='brand_manager_assignments'
        ? queryResult(table,[{brand_id:'a-id',manager_user_id:'manager-a'},{brand_id:'outside-id',manager_user_id:'other-manager'}],assignmentFailed ? {message:'failed'}:null)
        : queryResult(table,[{user_id:'manager-a',name:'Manager A',tenant_id:'tenant-a',discord_id:'123456789012345678',discord_avatar:null},{user_id:'other-manager',name:'PRIVATE',tenant_id:'tenant-b',discord_id:'999999999999999999',discord_avatar:null}]);}})
    };
    if(path.endsWith('/workspace-scope')) return {getWorkspaceScope:async()=>scope,isBrandInScope:(s,b)=>s.brandScope.kind==='all'||s.brandScope.brandSlugs.includes(b.slug)};
    if(path.endsWith('/platform-admin')) return {getActiveTenantId:async()=>null};
    if(path.endsWith('/discord/avatars')) return {fetchDiscordAvatars:async ids=>{avatarCalls.push(...ids);return {'123456789012345678':'https://cdn.discordapp.com/avatars/123456789012345678/00000000000000000000000000000000.png'};}};
    if(path.endsWith('/permissions')) return {can:()=>permitted};
    throw Error(path);
  }
});
let managers=await managerExports.getDashboardManagers(['a','b','outside']);
assert.equal(managers.length,2);
assert.equal(managers[0].name,'Manager A');
assert.deepEqual(avatarCalls,['123456789012345678']);
assert.equal(managers[0].avatar.startsWith('https://cdn.discordapp.com/avatars/123456789012345678/'),true);
assert.equal(managers[1].name,'Unassigned brands');
assert.equal(JSON.stringify(managers).includes('PRIVATE'),false);
assert.equal(managers.flatMap(m=>Array.from(m.brands)).sort().join(','),'a,b');
adminCalls=[]; avatarCalls=[]; permitted=false;
assert.equal(await managerExports.getDashboardManagers(['a']),undefined);
assert.equal(adminCalls.length,0);
assert.equal(avatarCalls.length,0);
permitted=true; scope={brandScope:{kind:'scoped',brandSlugs:[]}};
assert.equal((await managerExports.getDashboardManagers(['outside'])).length,0);
assert.equal(adminCalls.length,0);
assert.equal(avatarCalls.length,0);
scope={brandScope:{kind:'scoped',brandSlugs:['a']}}; assignmentFailed=true;
assert.equal(await managerExports.getDashboardManagers(['a']),null);
console.log('PASS manager portfolios: permission gate, explicit assignments, scoped identities, unassigned brands, fail-closed empty scope and read failures');

const contributorExports = {};
runInNewContext(ts.transpileModule(readFileSync('src/lib/data/dashboard-contributors.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {exports:contributorExports});
const contributors = contributorExports.buildContributors(
  [{handle:'@FIRST',gmv:300},{handle:'second',gmv:200},{handle:'distinct',gmv:75},{handle:'invalid',gmv:NaN}],
  [{handle:'first',gmv:100},{handle:'departed',gmv:600}],
  new Map([['first',{id:'one',name:'Same name'}],['second',{id:'one',name:'Same name'}],['distinct',{id:'two',name:'Same name'}]])
);
assert.equal(contributors.length,3);
assert.equal(contributors[0].handle,'departed');
assert.equal(contributors[0].delta,-600);
assert.equal(contributors[1].current,500);
assert.equal(contributors[1].delta,400);
assert.equal(contributors[2].id,'two');
assert.equal(contributors.reduce((sum,p)=>sum+p.delta,0),-125);
console.log('PASS contributors: normalized handles, shared identities, distinct same names, prior-only declines, finite values and reconciliation');

let identityScope = {tenantId:'home'};
let activeTenant = null;
let queriedTenant;
const identityExports = {};
runInNewContext(ts.transpileModule(readFileSync('src/app/api/workspace-identity/route.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
  exports:identityExports,
  require(path) {
    if(path==='next/server') return {NextResponse:{json:(body,options)=>({body,...options})}};
    if(path.endsWith('/workspace-scope')) return {getWorkspaceScope:async()=>identityScope};
    if(path.endsWith('/platform-admin')) return {getActiveTenantId:async()=>activeTenant};
    if(path.endsWith('/supabase/server')) return {createClient:async()=>({from:()=>({select:()=>({eq:(_key,id)=>{queriedTenant=id;return {maybeSingle:async()=>({data:id==='home'?{name:'Agency',slug:'creators-corner'}:{name:'Other workspace',slug:'other'}})};}})})})};
    throw Error(path);
  }
});
let identity = await identityExports.GET();
assert.equal(identity.body.logo,'/logo/creators-corner.png');
assert.equal(queriedTenant,'home');
assert.equal(identity.headers['Cache-Control'],'private, no-store');
activeTenant='other';
identity = await identityExports.GET();
assert.equal(identity.body.logo,null);
assert.equal(queriedTenant,'other');
identityScope=null; queriedTenant=undefined;
assert.equal((await identityExports.GET()).status,403);
assert.equal(queriedTenant,undefined);
console.log('PASS workspace identity: authenticated home scope, active workspace, tenant-specific branding and private cache');

const comparisonExports = {};
runInNewContext(ts.transpileModule(readFileSync('src/lib/data/dashboard-comparison.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {exports:comparisonExports});
const totalRow=(brand_slug,total_gmv,total_orders,total_items_sold)=>({brand_slug,total_gmv,total_orders,total_items_sold});
const compared = comparisonExports.dashboardComparison(new Set(['complete']),
 [totalRow('complete',200,8,10),totalRow('partial',9000,100,200),totalRow('outside',999,999,999)],
 [totalRow('complete',100,4,5),totalRow('partial',1000,20,30)],
 new Map([['complete',70],['partial',5000]]),new Map([['complete',40],['outside',999]]));
assert.equal(compared.current.gmv-compared.previous.gmv,100);
assert.equal(compared.current.orders-compared.previous.orders,4);
assert.equal(compared.current.units-compared.previous.units,5);
assert.equal(compared.current.managed-compared.previous.managed,30);
const emptyComparison = comparisonExports.dashboardComparison(new Set(),[totalRow('outside',99,3,5)],[],new Map(),new Map());
assert.equal(emptyComparison.current.gmv,0);
assert.equal(build([row('unrecorded',0,0,0,0)],7,true).attention[0].noData,true);
assert.equal(build([row('partial-zero',0,0,1,1)],7,true).attention[0].noData,false);
console.log('PASS comparable KPI cohort: same stores in both periods, partial/outside exclusion, orders versus units, managed scope and no-data distinction');
