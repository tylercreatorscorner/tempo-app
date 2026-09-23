import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const env={COMMUNITY_OPS_TEMPO_TENANT_ID:'tempo-tenant',COMMUNITY_OPS_TEMPO_USER_IDS:'operator',COMMUNITY_OPS_DATABASE_URL:'https://otwssgedcnxamcglqpnn.supabase.co',COMMUNITY_OPS_DATABASE_KEY:'fixture-key',COMMUNITY_OPS_SOURCE_TENANT_ID:'ed1b9fdf-f6cb-414e-8d84-b4272e431181',NODE_ENV:'production'};
function load(path,deps={}){const exports={};runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,process:{env},URL,require:n=>{assert.ok(n in deps,n);return deps[n];}});return exports;}
const access=load('src/lib/community-ops/access.ts',{'@/lib/auth/permissions':{can:(s,screen,mode)=>s.permissions.includes(`${screen}:${mode}`)}});
const owner={userId:'operator',tenantId:'tempo-tenant',role:'owner',brandScope:{kind:'all'},permissions:['messages:read','messages:write']};
assert.equal(access.canUseOperations(owner),true);
for(const invalid of [null,{...owner,userId:'other'},{...owner,tenantId:'other'},{...owner,role:'manager'},{...owner,brandScope:{kind:'scoped',brandSlugs:['jiyu']}},{...owner,impersonating:true},{...owner,permissions:[]}])assert.equal(access.canUseOperations(invalid),false);
assert.equal(access.canUseOperations({...owner,permissions:['messages:read']},true),false);
let scope=owner,calls=0;
const server=load('src/lib/community-ops/server.ts',{'next/server':{NextResponse:{json:(body,init)=>({body,status:init?.status??200})}},'@/lib/auth/workspace-scope':{getWorkspaceScope:async()=>scope},'./access':access,'@supabase/supabase-js':{createClient:(url,key)=>{calls++;assert.equal(url,env.COMMUNITY_OPS_DATABASE_URL);assert.equal(key,'fixture-key');return {};}}});
let result=await server.opsContext(true);assert.equal(result.scope.tenantId,env.COMMUNITY_OPS_SOURCE_TENANT_ID);assert.equal(result.scope.userId,'operator');assert.equal(calls,1);
scope={...owner,userId:'other'};assert.equal((await server.opsContext()).denied.status,403);assert.equal(calls,1);
scope=null;assert.equal((await server.opsContext()).denied.status,401);
scope=owner;env.COMMUNITY_OPS_DATABASE_URL='https://elrsgxlyejlkzjcnhmak.supabase.co';assert.equal((await server.opsContext()).denied.status,503);assert.equal(calls,1);
assert.equal(server.validOpsOrigin(new Request('https://tempo.example/api/test',{headers:{origin:'https://tempo.example'}})),true);
assert.equal(server.validOpsOrigin(new Request('https://tempo.example/api/test',{headers:{origin:'https://other.example'}})),false);
assert.equal(server.validOpsOrigin(new Request('https://tempo.example/api/test')),false);
console.log('PASS operations bridge: exact operator/tenant, capabilities, impersonation, scoped-brand denial, isolated database, real audit actor and origin');

const queueState=load('src/lib/community-ops/queue-state.ts');
const daily=load('src/lib/community-ops/daily-queue.ts',{'./queue-state':queueState});
load('scripts/test-daily-queue.ts',{'node:assert/strict':{default:assert},'../src/lib/community-ops/daily-queue':daily});
console.log('PASS imported daily queue regression cases');
