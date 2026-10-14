import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner={userId:id(1),tenantId:id(2),role:'owner',canViewFinance:true,brandScope:{kind:'all'},permissions:new Set(['reporting:read','earnings:read','earnings:configure'])};
const client={id:id(3),revision:2,name:'Fixture client',brandIds:[id(4)],serviceStart:'2026-01-01',serviceEnd:null,exitReason:null,terms:[{effectiveMonth:'2026-01',monthlyRetainer:1000,revSharePercent:5,feeModel:'additive'}],updatedAt:null};
const draft={action:'review',clientId:client.id,month:'2026-09',expectedRevision:0,requestId:id(5),clientRevision:2,adjustmentCents:0,expectedCalculatedCents:150000};
let scope,events,retry,previous,gmv,sqlError;
function reset(next=owner){scope=next;events=[];retry=null;previous=null;gmv=10000;sqlError=null;}
const admin={from(table){assert.equal(table,'agency_billing_revisions');const filters={};let columns;const q={select(v){columns=v;return q;},eq(k,v){filters[k]=v;return q;},order(){return q;},limit(){return q;},async maybeSingle(){events.push({type:'read',filters,columns});assert.equal(filters.tenant_id,owner.tenantId);return {data:filters.request_id?retry:previous?{snapshot:previous}:null,error:null};}};return q;},async rpc(name,args){events.push({type:'rpc',name,args});assert.equal(args.p_tenant_id,owner.tenantId);if(name==='agency_business_list_clients')return{data:[client],error:null};if(name==='agency_business_month_performance')return{data:[{brand_id:id(4),managed_gmv:gmv,complete:gmv!==null,recorded_through:'2026-09-30'}],error:null};if(name==='agency_billing_list')return{data:{records:[],history:[]},error:sqlError};if(name==='agency_billing_append')return{data:args.p_snapshot,error:sqlError};throw new Error(name);}};
class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-04T18:00:00Z']));}static now(){return new Date('2026-10-04T18:00:00Z').getTime();}}
const deps={'node:crypto':{createHash},'next/server':{NextRequest,NextResponse},'@/lib/auth/workspace-scope':{getWorkspaceScope:async()=>scope},'@/lib/supabase/server':{createAdminClient:async()=>{events.push({type:'admin'});return admin;}}};
function load(file){const exports={};runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date:FixedDate,Intl,Set,Map,console,require(name){assert.ok(name in deps,`Missing import ${name}`);return deps[name];}});return exports;}
deps['@/lib/auth/permissions']=load('src/lib/auth/permissions.ts');
deps['@/lib/agency/access']=load('src/lib/agency/access.ts');
deps['@/lib/agency/model']=deps['./model']=load('src/lib/agency/model.ts');
deps['./billing-model']=load('src/lib/agency/billing-model.ts');
deps['@/lib/agency/billing-transitions']=load('src/lib/agency/billing-transitions.ts');
const route=load('src/app/api/agency/billing/route.ts');
const origin='https://fixture.invalid',endpoint=`${origin}/api/agency/billing`;
const post=(body=draft,headers={},raw)=>route.POST(new NextRequest(endpoint,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:raw??JSON.stringify(body)}));
const get=(query='')=>route.GET(new NextRequest(`${endpoint}${query}`));
async function status(pending,expected){const r=await pending;const body=await r.json();assert.equal(r.status,expected,JSON.stringify(body));assert.equal(r.headers.get('cache-control'),'private, no-store');return body;}
for(const s of [null,...['admin','manager','coach','brand','viewer'].map(role=>({...owner,role})),{...owner,impersonating:{userId:id(9)}},{...owner,brandScope:{kind:'scoped',brandIds:[id(4)]}},{...owner,canViewFinance:false},{...owner,permissions:new Set()}]){reset(s);await status(get(),s?403:401);await status(post(),s?403:401);assert.equal(events.length,0);}
reset({...owner,permissions:new Set(['reporting:read','earnings:read'])});await status(post(),403);assert.equal(events.length,0);assert.equal((await status(get(),200)).canEdit,false);
for(const [headers,raw,expected]of [[{origin:'https://evil.invalid'},undefined,403],[{'content-type':'text/plain'},undefined,415],[{},'{',400],[{},'x'.repeat(20001),413]]){reset();await status(post(draft,headers,raw),expected);assert.equal(events.length,0);}
for(const patch of [{tenantId:id(9)},{actorId:id(9)},{calculatedCents:1},{month:'2026-10'},{clientId:'bad'},{expectedRevision:-1}]){reset();await status(post({...draft,...patch}),400);assert.equal(events.length,0);}
reset();const reviewed=await status(post(),200);assert.equal(reviewed.record.review.reviewedCents,150000);assert.equal(reviewed.evidence.managedGmvCents,1000000);const append=events.find(e=>e.name==='agency_billing_append');assert.equal(append.args.p_actor_id,owner.userId);assert.equal(append.args.p_client_revision,2);
reset();client.serviceEnd='2026-09-15';client.exitReason='Service ended';
const manual=await status(post({...draft,expectedCalculatedCents:null,manualReviewedCents:70000,reason:'Agreed fee for partial month'}),200);
assert.equal(manual.record.review.calculatedCents,null);assert.equal(manual.record.review.reviewedCents,70000);assert.equal(manual.evidence.calculationStatus,'review_required');
reset();await status(post({...draft,expectedCalculatedCents:null,manualReviewedCents:70000}),400);assert.ok(!events.some(e=>e.name==='agency_billing_append'));
client.serviceEnd=null;client.exitReason=null;
reset();gmv=11000;await status(post(),409);assert.ok(!events.some(e=>e.name==='agency_billing_append'));
reset();gmv=null;await status(post(),400);assert.ok(!events.some(e=>e.name==='agency_billing_append'));
reset();await status(post({...draft,clientRevision:1}),409);assert.ok(!events.some(e=>e.name==='agency_billing_append'));
reset();retry={request_hash:append.args.p_request_hash,actor_id:owner.userId,snapshot:reviewed};await status(post(),200);assert.ok(!events.some(e=>e.type==='rpc'));
reset();retry={request_hash:append.args.p_request_hash,actor_id:id(90),snapshot:reviewed};await status(post(),409);
reset();previous=reviewed;const invoice=await status(post({action:'invoice',clientId:client.id,month:draft.month,expectedRevision:1,requestId:id(6),reference:'INV-1',issuedOn:'2026-10-01',dueOn:'2026-10-15'}),200);assert.equal(invoice.record.invoice.amountCents,150000);assert.ok(!events.some(e=>e.name==='agency_business_month_performance'));
reset();previous=invoice;await status(post({action:'receipt',clientId:client.id,month:draft.month,expectedRevision:2,requestId:id(7),reference:'BANK-1',receivedOn:'2026-10-04',amountCents:150001}),400);
reset();sqlError={code:'PGRST202',message:'missing'};const missing=await status(get(),200);assert.equal(missing.storageReady,false);assert.equal(missing.canEdit,false);
console.log('PASS agency billing routes: scoped access, origin, payload limits, server evidence, stale calculations, safe retries, immutable invoice amount and unavailable storage.');

for (const designation of ['owner','vp']) {reset({...owner,role:'admin',agencyLeadership:designation});await status(get(),200);}
reset({...owner,role:'manager',agencyLeadership:'vp'});await status(get(),403);await status(post(),403);assert.equal(events.length,0);
