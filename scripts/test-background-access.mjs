import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { NextRequest, NextResponse } from 'next/server.js';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';
import crypto from 'node:crypto';

const initial = {userId:'actor',email:'actor@example.invalid',tenantId:'a',role:'admin',canViewFinance:true,
  brandScope:{kind:'all'},permissions:new Set(['integrations:read','integrations:write','integrations:configure','automations:read','automations:write','messages:read','messages:write'])};
let scope=initial, failure='', effects=[], creatorDenied=false, registryFailure=false;
const fixtureEnv={DISCORD_BOT_TOKEN:'fixture-only',RESEND_API_KEY:'fixture-only',CRON_SECRET:'fixture-only',AUTH_SECRET:'fixture-only',SLACK_CLIENT_ID:'fixture-client',SLACK_CLIENT_SECRET:'fixture-only'};
const rows={
  user_profiles:[{user_id:'actor',tenant_id:'a',email:'actor@example.invalid'}],
  brands_v2:[{id:'brand',tenant_id:'a',discord_guild_id:'123456789012345678'}, {id:'other',tenant_id:'b',discord_guild_id:'223456789012345678'}],
  integrations:[{id:'own',tenant_id:'a',brand_id:'brand',type:'discord',config:{guild_id:'123456789012345678'}},
    {id:'foreign',tenant_id:'b',brand_id:'other',type:'discord',config:{guild_id:'223456789012345678'}}],
  automations:[{id:'job',tenant_id:'a',brand_id:'brand',enabled:true,execution_user_id:'actor',steps:[],run_count:0},
    {id:'foreign-job',tenant_id:'b',brand_id:'other',enabled:true,execution_user_id:'actor'}],
  automation_runs:[],creator_contacts:[],creator_messages:[],broadcasts:[],broadcast_recipients:[],
  brand_sessions:[],
};
function from(table){
  let op='read', payload, filters=[];
  const q={select:()=>q,order:()=>q,limit:()=>q,not:()=>q,
    eq:(k,v)=>{filters.push(r=>r[k]===v);return q;},
    in:(k,v)=>{filters.push(r=>v.includes(r[k]));return q;},
    insert:v=>{op='insert';payload=v;return q;},update:v=>{op='update';payload=v;return q;},delete:()=>{op='delete';return q;},
    maybeSingle:()=>run(true),single:()=>run(true),then:(resolve,reject)=>Promise.resolve(run(false)).then(resolve,reject)};
  function run(single){
    if(failure===table)return {data:null,count:null,error:{message:'fixture failure'}};
    const data=(rows[table]??[]).filter(r=>filters.every(f=>f(r)));
    if(op!=='read')effects.push({table,op,payload});
    if(op==='insert')return {data:{id:'inserted',...payload},error:null};
    return {data:single?data[0]??null:data,count:data.length,error:null};
  }return q;
}
const admin={from};
const deps={
  'next/server':{NextRequest,NextResponse},
  '@/lib/supabase/server':{createAdminClient:async()=>admin},
  '@/lib/auth/workspace-scope':{getWorkspaceScope:async()=>scope,getWorkspaceScopeForUser:async id=>scope&&id===scope.userId?scope:null,
    isBrandInScope:(s,b)=>s.brandScope.kind==='all'||s.brandScope.brandIds.includes(b.id)},
  '@/lib/auth/authorize-creator':{authorizeCreator:async()=>creatorDenied?NextResponse.json({}, {status:403}):null},
  '@/lib/integrations/actions/registry':{findAction:()=>({handler:async()=>{effects.push('delivery');return {ok:true};}})},
};
function load(file, extra={}){const exports={};runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {exports,console,Set,Date,Buffer,URL,AbortSignal,process:{env:fixtureEnv},fetch:async()=>{effects.push('http-post');return {ok:true,json:async()=>({id:'fixture-channel'})};},
    require:name=>{const key=name.startsWith('./')&&file.includes('/auth/')?'@/lib/auth/'+name.slice(2):name;const value=extra[key]??deps[key];assert.ok(value,`Unexpected dependency ${key}`);return value;}});return exports;}
deps['@/lib/auth/permissions']=load('src/lib/auth/permissions.ts');
deps['@/lib/auth/background-access']=load('src/lib/auth/background-access.ts');
const dispatch=load('src/lib/automations/dispatch.ts').dispatch;
const execute=(integrationId='own',extra={})=>dispatch({actorId:'actor',integrationId,triggeredBy:'manual:actor',steps:[{action:'send_message',params:{}}],...extra});
for(const invalid of [null,{...initial,permissions:new Set()},{...initial,tenantId:'b'}, {...initial,brandScope:{kind:'scoped',brandIds:[]}}]){
  scope=invalid;effects=[];assert.equal((await execute()).status,'failed');assert.equal(effects.length,0);
}

// Historical email-only rows may resolve, but a stored deleted UUID must never fall back.
scope=initial;
assert.equal(await deps['@/lib/auth/background-access'].resolveJobActor('00000000-0000-4000-8000-000000000001','a'),null);
const oauthDeps={'node:crypto':{default:crypto},'@/lib/integrations/actions/slack':{exchangeSlackOAuthCode:async()=>{effects.push('oauth-exchange');return {ok:false,error:'fixture-stop'};}}};
const oauthStart=load('src/app/api/integrations/slack/oauth/start/route.ts',oauthDeps);
const oauthCallback=load('src/app/api/integrations/slack/oauth/callback/route.ts',oauthDeps);
const signedState=(user='actor',tenant='a',brand='brand')=>{const data=Buffer.from(JSON.stringify({user_id:user,tenant_id:tenant,brand_id:brand,issued_at:Date.now(),nonce:'fixture'})).toString('base64url');return data+'.'+crypto.createHmac('sha256',fixtureEnv.AUTH_SECRET).update(data).digest('base64url');};
for(const invalid of [{...initial,permissions:new Set()}, {...initial,impersonating:{userId:'other'}},{...initial,userId:'replacement'}]){
  scope=invalid;effects=[];
  const response=await oauthCallback.GET(new NextRequest('https://fixture.invalid/api/callback?code=fixture&state='+signedState()));
  assert.ok(response.headers.get('location').includes('access_changed'));assert.equal(effects.length,0);
}
scope={...initial,permissions:new Set()};assert.equal((await oauthStart.GET(new NextRequest('https://fixture.invalid/api/start'))).status,403);
scope=initial;effects=[];assert.equal((await oauthStart.GET(new NextRequest('https://fixture.invalid/api/start?brand_id=other'))).status,403);
const malformed=await oauthCallback.GET(new NextRequest('https://fixture.invalid/api/callback?code=fixture&state=a.b'));assert.ok(malformed.headers.get('location').includes('invalid_or_expired_state'));
await oauthCallback.GET(new NextRequest('https://fixture.invalid/api/callback?code=fixture&state='+signedState()));assert.ok(effects.includes('oauth-exchange'));

const catalog={TYPE_LABELS:{discord:'Discord'},INTEGRATION_TYPE_CATALOG:[]};
rows.brands_v2[0].slug='shared';rows.brands_v2[0].is_archived=false;rows.brands_v2[1].slug='shared';rows.brands_v2[1].is_archived=false;
rows.brand_sessions=[{tenant_id:'a',brand_slug:'shared',status:'own-status'}, {tenant_id:'b',brand_slug:'shared',status:'foreign-status'}];
const integrationsList=load('src/lib/data/integrations.ts',{'./integration-catalog':catalog});
const listed=await integrationsList.listIntegrations();assert.ok(!JSON.stringify(listed).includes('foreign-status'));
scope=initial;
for(const integrationId of ['foreign','legacy:discord:other','legacy:discord:brand:extra']){effects=[];assert.equal((await execute(integrationId)).status,'failed');assert.equal(effects.length,0);}
effects=[];assert.equal((await execute('own',{automationId:'foreign-job'})).status,'failed');assert.equal(effects.length,0);
rows.automations[0].execution_user_id=null;effects=[];assert.equal((await execute('own',{automationId:'job',triggeredBy:'cron'})).status,'failed');assert.equal(effects.length,0);
rows.automations[0].execution_user_id='actor';assert.equal((await execute('own',{automationId:'job',triggeredBy:'cron'})).status,'success');assert.ok(effects.includes('delivery'));
rows.integrations[0].config.guild_id='223456789012345678';effects=[];assert.equal((await execute()).status,'failed');assert.equal(effects.length,0);rows.integrations[0].config.guild_id='123456789012345678';
effects=[];assert.equal((await execute('legacy:resend:tenant')).status,'success');assert.equal(effects.find(e=>e.table==='integrations'&&e.op==='insert').payload.tenant_id,'a');
scope={...initial,brandScope:{kind:'scoped',brandIds:['brand']}};effects=[];assert.equal((await execute('legacy:resend:tenant')).status,'failed');assert.equal(effects.length,0);scope=initial;

const recipient={id:'recipient',broadcast_id:'broadcast',creator_id:'creator',channel:'discord_dm',contact_value:'123456789012345678',resolved_body:'fixture'};
const send=load('src/lib/comms/send.ts').sendToRecipient;
for(const [ctx,denied] of [[{sentBy:null,tenantId:'a'},false],[{sentBy:'actor@example.invalid',tenantId:'b'},false],[{sentBy:'actor@example.invalid',tenantId:'a'},true]]){
  effects=[];creatorDenied=denied;assert.equal((await send(recipient,ctx)).status,'blocked');assert.equal(effects.length,0);
}
creatorDenied=false;failure='creator_contacts';effects=[];assert.equal((await send(recipient,{sentBy:'actor@example.invalid',tenantId:'a'})).status,'blocked');assert.equal(effects.length,0);failure='';
rows.creator_contacts.push({id:'opt-out',creator_id:'creator',channel:'discord',consent_status:'opted_out'});assert.equal((await send(recipient,{sentBy:'actor@example.invalid',tenantId:'a'})).status,'blocked');rows.creator_contacts=[];
effects=[];assert.equal((await send(recipient,{sentBy:'actor@example.invalid',tenantId:'a'})).status,'delivered');assert.equal(effects.filter(e=>e==='http-post').length,2);
const registry=load('src/lib/integrations/actions/registry.ts',{
  './discord':{sendDiscordMessage:async()=>{effects.push('discord-send');return {ok:true};},listDiscordChannels:async()=>({ok:!registryFailure,channels:[{id:'allowed'}]})},
  './slack':{},'./resend':{},'./twilio':{},'./anthropic':{},
});
const handler=registry.findAction('discord','send_message').handler;
effects=[];assert.equal((await handler({config:{guild_id:'123456789012345678'}},{channel_id:'foreign',content:'fixture'})).ok,false);assert.equal(effects.length,0);
registryFailure=true;assert.equal((await handler({config:{}},{channel_id:'allowed',content:'fixture'})).ok,false);registryFailure=false;
assert.equal((await handler({config:{}},{channel_id:'allowed',content:'fixture'})).ok,true);assert.ok(effects.includes('discord-send'));

// Actual route entry points reject view-as and missing capabilities before dispatch.
deps['@/lib/automations/dispatch']={dispatch:async()=>{throw new Error('Unauthorized dispatch reached');}};
for(const [file,methods] of [['src/app/api/automations/route.ts',['GET','POST']],['src/app/api/automations/[id]/route.ts',['GET','PATCH','DELETE']],['src/app/api/automations/[id]/run/route.ts',['POST']],['src/app/api/integrations/[id]/test-send/route.ts',['POST']],['src/app/api/integrations/[id]/channels/route.ts',['GET']]]){
  const route=load(file);
  for(const method of methods){scope={...initial,permissions:new Set()};const request=new NextRequest('https://fixture.invalid/api/test',{method});assert.equal((await route[method](request,{params:Promise.resolve({id:'job'})})).status,403);
    if(method!=='GET'){scope={...initial,impersonating:{userId:'someone'}};assert.equal((await route[method](request,{params:Promise.resolve({id:'job'})})).status,403);}}
}

const db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE automations(id uuid);CREATE TABLE integrations(id uuid);CREATE TABLE broadcasts(id uuid);CREATE TABLE broadcast_recipients(id uuid);
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;GRANT UPDATE(id) ON automations TO authenticated;`);
const migration=readdirSync('supabase/migrations').find(n=>n.endsWith('_automation_execution_authority.sql'));
await db.exec(readFileSync(`supabase/migrations/${migration}`,'utf8'));
await db.exec("INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001'); INSERT INTO broadcasts(id,execution_user_id) VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001'); DELETE FROM auth.users;");
assert.equal((await db.query('SELECT execution_user_id FROM broadcasts')).rows[0].execution_user_id,'00000000-0000-4000-8000-000000000001');
for(const role of ['anon','authenticated']){await db.exec(`SET ROLE ${role}`);await assert.rejects(db.query('SELECT * FROM integrations'),/permission denied/);await assert.rejects(db.query('UPDATE automations SET id=NULL'),/permission denied/);await db.exec('RESET ROLE');}
await db.close();
console.log('PASS current actor, tenant, brand, legacy integration, schedule owner, route capability and view-as boundaries');
console.log('PASS destination guild/channel restrictions, consent failures/opt-out, legacy actor lookup and legitimate fixture delivery');
console.log('PASS actual migration closes table and column grants without external side effects');
