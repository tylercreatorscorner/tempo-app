import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {NextRequest,NextResponse} from 'next/server.js';
const db=new PGlite();
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const [actorId,memberId,foreignId,ownerId,newId,tenantA,tenantB,brandA,brandB]=[1,2,3,4,5,6,7,8,9].map(id);
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE);
CREATE TABLE public.user_profiles(user_id uuid PRIMARY KEY REFERENCES auth.users(id),email text,tenant_id uuid NOT NULL,role text,role_id uuid,status text,can_view_finance boolean);
CREATE TABLE public.brands_v2(id uuid PRIMARY KEY DEFAULT '${id(10)}',tenant_id uuid NOT NULL,slug text,name text,display_name text,color text,is_archived boolean,is_umbrella boolean);
CREATE TABLE public.user_brand_access(user_id uuid REFERENCES auth.users(id),brand_id uuid REFERENCES public.brands_v2(id),tenant_id uuid,UNIQUE(user_id,brand_id));
GRANT USAGE ON SCHEMA auth TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public,auth TO service_role;`);
const migration=readdirSync('supabase/migrations').find(file=>file.endsWith('_provision_invited_member.sql'));
await db.exec(readFileSync(`supabase/migrations/${migration}`,'utf8'));
let actor,accounts,events,listError,createError,mailError,readError,impersonating,beforeRpc;
async function reset(){
 await db.exec(`RESET ROLE; TRUNCATE user_brand_access,user_profiles,brands_v2,auth.users CASCADE;
 INSERT INTO auth.users VALUES ('${actorId}','actor@example.invalid'),('${memberId}','member@example.invalid'),('${foreignId}','foreign@example.invalid'),('${ownerId}','owner@example.invalid');
 INSERT INTO user_profiles(user_id,email,tenant_id,role,role_id,status,can_view_finance) VALUES
 ('${actorId}','actor@example.invalid','${tenantA}','owner',NULL,'active',true),
 ('${memberId}','member@example.invalid','${tenantA}','manager','${id(77)}','active',true),
 ('${foreignId}','foreign@example.invalid','${tenantB}','manager',NULL,'active',true),
 ('${ownerId}','owner@example.invalid','${tenantA}','owner',NULL,'active',true);
 INSERT INTO brands_v2(id,tenant_id) VALUES ('${brandA}','${tenantA}'),('${brandB}','${tenantB}');
 SET ROLE service_role;`);
 actor={user_id:actorId,tenant_id:tenantA,role:'owner'};
 accounts=[{id:actorId,email:'actor@example.invalid'},{id:memberId,email:'member@example.invalid'},{id:foreignId,email:'foreign@example.invalid'},{id:ownerId,email:'owner@example.invalid'}];
 events=[];listError=false;createError=false;mailError=false;readError=false;impersonating=false;beforeRpc=null;
}
const identifier=name=>{assert.match(name,/^[a-z_][a-z_0-9]*$/);return `"${name}"`;};
function from(table){
 let columns='*',op='select',payload,conflict,filters=[];
 const q={select(value='*'){columns=value;return q;},eq(key,value){filters.push([key,value]);return q;},
 insert(value){op='insert';payload=value;return q;},upsert(value,opts){op='upsert';payload=value;conflict=opts.onConflict;return q;},
 update(value){op='update';payload=value;return q;},single(){return run(true);},maybeSingle(){return run(true);},then(resolve,reject){return run(false).then(resolve,reject);}};
 async function run(single){
  if(readError&&op==='select')return {data:null,error:{message:'fixture read error'}};
  const params=[];const parameter=value=>{params.push(value);return `$${params.length}`;};
  const selected=columns==='*'?'*':columns.split(',').map(s=>identifier(s.trim())).join(',');
  let sql;
  if(op==='select')sql=`SELECT ${selected} FROM ${identifier(table)}`;
  else if(op==='update')sql=`UPDATE ${identifier(table)} SET ${Object.entries(payload).map(([k,v])=>`${identifier(k)}=${parameter(v)}`).join(',')}`;
  else{const keys=Object.keys(payload);sql=`INSERT INTO ${identifier(table)} (${keys.map(identifier).join(',')}) VALUES (${keys.map(k=>parameter(payload[k])).join(',')})`;
   if(op==='upsert')sql+=` ON CONFLICT (${identifier(conflict)}) DO UPDATE SET ${keys.map(k=>`${identifier(k)}=EXCLUDED.${identifier(k)}`).join(',')}`;
  }
  if(filters.length)sql+=` WHERE ${filters.map(([k,v])=>`${identifier(k)}=${parameter(v)}`).join(' AND ')}`;
  if(op!=='select'){sql+=` RETURNING ${selected}`;events.push(`write:${table}`);}
  try{const {rows}=await db.query(sql,params);return {data:single?rows[0]??null:rows,error:null};}catch(error){return {data:null,error};}
 }
 return q;
}
const admin={from,auth:{admin:{
 listUsers:async({page=1,perPage=50}={})=>{events.push(`list:${page}`);return {data:{users:accounts.slice((page-1)*perPage,page*perPage)},error:listError?{message:'fixture lookup failure'}:null};},
 createUser:async options=>{events.push('create');assert.equal(options.email_confirm,false);if(createError)return {data:{user:null},error:{message:'fixture create failure'}};const user={id:newId,email:options.email};await db.query('INSERT INTO auth.users VALUES ($1,$2)',[user.id,user.email]);accounts.push(user);return {data:{user},error:null};},
 inviteUserByEmail:async()=>({data:{user:null},error:{message:'User already registered'}}),
}},rpc:async(name,args)=>{events.push('rpc');if(beforeRpc)await beforeRpc();assert.equal(name,'provision_invited_member');try{await db.query('SELECT provision_invited_member($1,$2,$3,$4,$5,$6)',Object.values(args));return {error:null};}catch(error){return {error};}}};
const deps={
 '@supabase/ssr':{createServerClient:()=>({auth:{signInWithOtp:async options=>{events.push('mail');assert.equal(options.options.shouldCreateUser,false);return {error:mailError?{message:'fixture mail failure'}:null};}}})},
 '@/lib/supabase/server':{createAdminClient:async()=>admin,createClient:async()=>({from,auth:{getUser:async()=>({data:{user:actor?{id:actor.user_id}:null}})}})},
 '@/lib/auth/require-admin':{requireAdmin:async()=>actor&&['owner','admin'].includes(actor.role)?actor:null},
 '@/lib/auth/platform-admin':{assertNotImpersonating:async()=>{if(impersonating)throw new Error('Read only');}},
 'next/cache':{revalidatePath(){}},'next/server':{NextRequest,NextResponse},
};
const load=(file,old=false)=>{const exports={};const source=old?execFileSync('git',['show',`f145d0b99aabbb4491c1ad4431ad9bdcc81e6d92:${file}`],{encoding:'utf8'}):readFileSync(file,'utf8');runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>{const key=name.startsWith('./')?`@/lib/auth/${name.slice(2)}`:name;assert.ok(key in deps,key);return deps[key];},process});return exports;};
const old=process.argv.includes('--reproduce');
if(!old)deps['@/lib/auth/invite-workspace-member']=load('src/lib/auth/invite-workspace-member.ts');
const actions=load('src/app/actions/users.ts',old),route=load('src/app/api/clients/route.ts',old);
const invite=(email='member@example.invalid',role='coach')=>actions.inviteUser(email,role,true);
const client=email=>route.POST(new NextRequest('https://tempo.example.invalid/api/clients',{method:'POST',body:JSON.stringify({identity:{slug:'new_brand',name:'New Brand'},contacts:[{email}]})}));
const profile=async userId=>(await db.query('SELECT * FROM user_profiles WHERE user_id=$1',[userId])).rows[0];
if(old){
 await reset();await invite('foreign@example.invalid','admin');assert.equal((await profile(foreignId)).tenant_id,tenantA);assert.ok(events.indexOf('mail')<events.indexOf('write:user_profiles'));
 await reset();await client('foreign@example.invalid');assert.equal((await profile(foreignId)).tenant_id,tenantA);console.log('REPRODUCED both prior invitation callers move a foreign account and send mail before profile ownership is checked');await db.close();process.exit(0);
}
for(const email of ['foreign@example.invalid','owner@example.invalid','actor@example.invalid']){await reset();await assert.rejects(()=>invite(email));assert.ok(!events.includes('mail'));assert.ok(!events.includes('rpc'));}
for(const setup of [()=>{actor=null;},()=>{actor.role='manager';},()=>{actor.tenant_id=null;},()=>{impersonating=true;},()=>{listError=true;},()=>{readError=true;}]){await reset();setup();await assert.rejects(()=>invite());assert.ok(!events.includes('mail'));assert.ok(!events.includes('rpc'));}
for(const role of ['owner','nonsense',null]){await reset();await assert.rejects(()=>invite('member@example.invalid',role));assert.equal(events.length,0);}
await reset();await invite(' MEMBER@example.invalid ','coach');assert.equal((await profile(memberId)).role,'coach');assert.equal((await profile(memberId)).role_id,null);assert.equal((await profile(memberId)).can_view_finance,false);assert.ok(events.indexOf('rpc')<events.indexOf('mail'));
await reset();accounts=[...Array.from({length:1000},(_,i)=>({id:id(100+i),email:`dummy${i}@example.invalid`})),accounts[1]];await invite();assert.ok(events.includes('list:2'));
await reset();await invite('new@example.invalid','brand');assert.equal((await profile(newId)).tenant_id,tenantA);assert.ok(events.indexOf('create')<events.indexOf('rpc'));assert.ok(events.indexOf('rpc')<events.indexOf('mail'));
await reset();beforeRpc=()=>db.query('UPDATE user_profiles SET tenant_id=$1 WHERE user_id=$2',[tenantB,memberId]);await assert.rejects(()=>invite());assert.equal((await profile(memberId)).tenant_id,tenantB);assert.ok(!events.includes('mail'));
await reset();beforeRpc=()=>db.query("INSERT INTO user_profiles(user_id,email,tenant_id,role) VALUES ($1,'new@example.invalid',$2,'owner')",[newId,tenantB]);await assert.rejects(()=>invite('new@example.invalid'));assert.equal((await profile(newId)).tenant_id,tenantB);assert.ok(!events.includes('mail'));
await reset();mailError=true;await assert.rejects(()=>invite(),/Access saved/);assert.equal((await profile(memberId)).role,'coach');
await reset();const denied=await(await client('foreign@example.invalid')).json();assert.equal(denied.contacts[0].status,'error');assert.equal((await profile(foreignId)).tenant_id,tenantB);assert.ok(!events.includes('mail'));
await reset();await db.query("UPDATE user_profiles SET role='brand_contact' WHERE user_id=$1",[memberId]);await db.query('INSERT INTO user_brand_access VALUES ($1,$2,$3)',[memberId,brandA,tenantA]);const added=await(await client('member@example.invalid')).json();assert.equal(added.contacts[0].status,'existing');assert.equal((await profile(memberId)).role,'brand_contact');assert.equal((await db.query('SELECT count(*)::int AS n FROM user_brand_access WHERE user_id=$1',[memberId])).rows[0].n,2);
for(const role of ['anon','authenticated']){await reset();await db.exec(`RESET ROLE; SET ROLE ${role}`);await assert.rejects(()=>db.query('SELECT provision_invited_member($1,$2,$3,$4,$5,$6)',[actorId,memberId,'member@example.invalid','brand',false,null]),/permission denied/);}
await db.close();
console.log('PASS real invitation callers and SQL: tenant/owner/self protection, lookup pagination, safe new accounts, stale role clearing, coach finance, and mail ordering');
console.log('PASS tenant/signup races preserve ownership; client onboarding preserves existing contact role and additive brand access; browser roles cannot call provisioning');


