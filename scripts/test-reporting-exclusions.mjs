import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const exports={};
runInNewContext(ts.transpileModule(readFileSync('src/lib/data/reporting-exclusions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Set,Date});
const exclusion={month:'2026-10',handles:['@Candi'],creatorIds:['excluded-id']};
const date=new Date();const original={totalGmv:1000,managed:{gmv:250},date,reportingExclusions:exclusion,creators:[{handle:'candi',gmv:25},{creatorId:'excluded-id',name:'Other label'},{handle:'keep',gmv:250}],topVideo:{creator:'CANDI'},movers:{list:[{handle:'candi'},{handle:'keep'}]}};
const filtered=exports.filterExcludedReportCreators(original,exclusion);
assert.equal(filtered.creators.length,1);assert.equal(filtered.movers.list.length,1);assert.equal(filtered.topVideo,null);
assert.equal(filtered.totalGmv,1000);assert.equal(filtered.managed.gmv,250);assert.equal(filtered.date,date);assert.equal(original.creators.length,3);
const roster=[
  {tenant_id:'our-tenant',brand:'m3',creator_id:'invalid-id',real_name:'Invalid assignment',account_1:'@invalid',tags:['reporting-exclude:all']},
  {tenant_id:'our-tenant',brand:'m3',creator_id:'month-id',real_name:'October correction',account_1:'@october',tags:['reporting-exclude:2026-10']},
  {tenant_id:'our-tenant',brand:'m3',creator_id:'november-id',real_name:'November correction',account_1:'@november',tags:['reporting-exclude:2026-11']},
  {tenant_id:'our-tenant',brand:'m3',creator_id:'current-id',real_name:'Current creator',account_1:'@current',tags:null},
  {tenant_id:'our-tenant',brand:'m3',creator_id:'ordinary-id',real_name:'Ordinary tag',account_1:'@ordinary',tags:['elite']},
  {tenant_id:'our-tenant',brand:'other-brand',creator_id:'other-brand-id',real_name:'Other brand',account_1:'@otherbrand',tags:['reporting-exclude:all']},
  {tenant_id:'other-tenant',brand:'m3',creator_id:'other-tenant-id',real_name:'Other tenant',account_1:'@othertenant',tags:['reporting-exclude:all']},
];
const beforeRoster=JSON.stringify(roster);
let filters=[],readError=null;
const db={from:table=>{
  assert.equal(table,'managed_creators');let rows=[...roster];
  const q={select:()=>q,
    eq:(key,value)=>{filters.push([key,value]);rows=rows.filter(row=>row[key]===value);return q;},
    in:(key,value)=>{filters.push([key,value]);rows=rows.filter(row=>value.includes(row[key]));return q;},
    overlaps:(key,value)=>{filters.push([key,value]);rows=rows.filter(row=>(row[key]??[]).some(tag=>value.includes(tag)));return Promise.resolve({data:rows,error:readError});},
  };return q;
}};
for(const [end,ids] of [
  ['2026-10-31',['invalid-id','month-id']],
  ['2026-11-15',['invalid-id','november-id']],
  ['2026-09-30',['invalid-id']],
  ['2030-01-01',['invalid-id']],
]) {
  filters=[];
  const resolved=await exports.getReportingExclusions(db,'our-tenant',['m3'],end);
  assert.equal(resolved.month,end.slice(0,7));assert.deepEqual([...resolved.creatorIds],ids);
  assert.ok(resolved.handles.includes('invalid'));
  assert.ok(filters.some(([key,value])=>key==='tenant_id'&&value==='our-tenant'));
  assert.ok(filters.some(([key,value])=>key==='brand'&&value.length===1&&value[0]==='m3'));
  assert.ok(filters.some(([key,value])=>key==='tags'&&value.length===2&&value.includes('reporting-exclude:all')&&value.includes('reporting-exclude:'+end.slice(0,7))));
}
assert.deepEqual([...(await exports.getReportingExclusions(db,'our-tenant',[],'2026-11-15')).creatorIds],[]);
assert.deepEqual([...(await exports.getReportingExclusions(db,'our-tenant',['other-brand'],'2026-11-15')).creatorIds],['other-brand-id']);
assert.equal(JSON.stringify(roster),beforeRoster,'Exclusion reads must not mutate roster history');
readError={message:'failed'};
await assert.rejects(exports.getReportingExclusions(db,'our-tenant',['m3'],'2026-11-15'),/Could not verify/);
console.log('PASS report exclusion identity filtering, source immutability and preserved totals/dates');
console.log('PASS permanent/month-specific corrections across prior/current/future months, tenant/brand isolation, empty scopes, null tags and failed reads');
