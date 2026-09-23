import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
function load(file,deps={},extra={}){const exports={};runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,process,Date,AbortSignal,require:n=>{assert.ok(n in deps,n);return deps[n];},...extra});return exports;}
const model=load('src/lib/roster/discord-reconciliation.ts');
const row=(id,discord_id,canonicalDiscordId=null)=>({id,real_name:'Fixture',discord_id,discord_user_id:discord_id,canonicalDiscordId});
assert.equal(model.resolveIdentities([row(1,null)])[0].state,'missing_identity');
assert.equal(model.resolveIdentities([row(1,'123456789012345678','987654321098765432')])[0].state,'identity_conflict');
assert.equal(model.resolveIdentities([row(1,'invalid')])[0].state,'identity_conflict');
assert.ok(model.resolveIdentities([row(1,'123456789012345678'),row(2,'123456789012345678')]).every(r=>r.state==='identity_conflict'));
assert.ok(model.resolveIdentities([row(1,'123456789012345678','987654321098765432'),row(2,'123456789012345678')]).every(r=>r.state==='identity_conflict'));
assert.equal(model.memberState(403,[]),'unavailable');assert.equal(model.memberState(429,[]),'unavailable');assert.equal(model.memberState(404,null),'not_in_server');assert.equal(model.memberState(200,null),'unavailable');assert.equal(model.memberState(200,[]),'missing_role');assert.equal(model.memberState(200,[model.JIYU_ROLE.roleId]),'aligned');
const access=load('src/lib/roster/discord-reconciliation-access.ts',{'@/lib/auth/permissions':{can:s=>s.rosterRead},'@/lib/community-ops/access':{canUseOperations:s=>!!s?.operator},'./discord-reconciliation':model});
let scope={tenantId:model.JIYU_ROLE.tenantId,operator:true,rosterRead:true};
assert.equal(access.canReviewDiscordRoles(scope,'jiyu'),true);assert.equal(access.canReviewDiscordRoles(scope,'leefar'),false);assert.equal(access.canReviewDiscordRoles({...scope,tenantId:'foreign'},'jiyu'),false);assert.equal(access.canReviewDiscordRoles({...scope,operator:false},'jiyu'),false);assert.equal(access.canReviewDiscordRoles({...scope,rosterRead:false},'jiyu'),false);
let acquired=0,calls=0,discordStatus=200;
const fixture={...row(1,'123456789012345678'),creator_id:null,tags:['elite'],brand:'jiyu',tenant_id:scope.tenantId,archived_at:null};
const filters=[];
function query(){const q={select:()=>q,eq:(k,v)=>{filters.push([k,v]);return q;},is:(k,v)=>{filters.push([k,v]);return q;},order:()=>q,limit:async()=>({data:[fixture],error:null})};return q;}
process.env.DISCORD_TICKET_BOT_TOKEN='fixture';
const route=load('src/app/api/roster/discord-reconciliation/route.ts',{'next/server':{NextResponse:{json:(body,init)=>({body,...init})}},'@/lib/auth/workspace-scope':{getWorkspaceScope:async()=>scope},'@/lib/supabase/server':{createAdminClient:async()=>{acquired++;return {from:()=>query()};}},'@/lib/roster/discord-reconciliation-access':access,'@/lib/roster/discord-reconciliation':model,'@/lib/roster/creator-tags':{normalizeCreatorTag:s=>s.toLowerCase()}},{fetch:async(url,options)=>{calls++;assert.equal(options.method,undefined);return url.endsWith('/roles')?{ok:true,status:200,json:async()=>[{id:model.JIYU_ROLE.roleId,name:'Elites',managed:false}]}:{ok:discordStatus===200,status:discordStatus,json:async()=>({roles:[model.JIYU_ROLE.roleId]})};}});
const req=brand=>({nextUrl:new URL('https://tempo.example/api?brand='+brand)});
assert.equal((await route.GET(req('other'))).status,403);assert.equal(acquired,0);assert.equal(calls,0);
let result=await route.GET(req('jiyu'));assert.equal(result.status,200);assert.equal(result.body.rows[0].state,'aligned');assert.equal(result.headers['Cache-Control'],'private, no-store');assert.equal(result.body.reverseInventoryAvailable,false);assert.ok(filters.some(([k,v])=>k==='tenant_id'&&v===model.JIYU_ROLE.tenantId));assert.ok(filters.some(([k,v])=>k==='brand'&&v==='jiyu'));assert.ok(filters.some(([k,v])=>k==='archived_at'&&v===null));
discordStatus=403;result=await route.GET(req('jiyu'));assert.equal(result.body.rows[0].state,'unavailable');
console.log('PASS Discord reconciliation: identity conflicts, duplicates, read failures, exact pilot access, scoped queries, no mutation transport');
