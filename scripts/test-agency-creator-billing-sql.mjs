import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const creatorModule = {};
runInNewContext(ts.transpileModule(readFileSync('src/lib/agency/creator-billing.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:creatorModule,require,Date});
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tenant = id(1), other = id(2), actor = id(20), manager = id(22);
try {
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create table tenants(id uuid primary key); create table brands_v2(id uuid primary key,tenant_id uuid,parent_brand_id uuid);
 create table user_profiles(user_id uuid,tenant_id uuid,role text);
 insert into tenants values('${tenant}'),('${other}');
 insert into user_profiles values('${actor}','${tenant}','owner'),('${id(21)}','${other}','owner'),('${manager}','${tenant}','manager');
 insert into brands_v2 values('${id(300)}','${tenant}',null),('${id(301)}','${other}',null);
 grant usage on schema public to service_role; grant select on all tables in schema public to service_role; grant update on brands_v2 to service_role;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
 for (const suffix of ['_agency_business_clients.sql','_agency_finance_onboarding.sql','_agency_contract_drive_references.sql','_agency_finance_historical_issue_guard.sql','_agency_explicit_service_periods.sql','_agency_per_creator_billing.sql']) {
  const name = readdirSync('supabase/migrations').find(n => n.endsWith(suffix)); assert.ok(name,suffix); await db.exec(readFileSync(`supabase/migrations/${name}`,'utf8'));
 }
 const save = (payload,t=tenant,a=actor) => db.query('select agency_business_save_client($1,$2,$3) as value',[t,a,JSON.stringify(payload)]).then(r=>r.rows[0].value);
 const write = (action,payload,t=tenant,a=actor) => db.query('select agency_finance_write($1,$2,$3,$4) as value',[t,a,action,JSON.stringify(payload)]).then(r=>r.rows[0].value);
 const term = {effectiveMonth:'2024-01',monthlyRetainer:0,revSharePercent:0,feeModel:'per_creator',creatorRate:{monthlyFee:500,maxCreators:50,monthlyBudgetCap:100000}};
 const draft = {expectedRevision:0,name:'Creator sourcing client',brandIds:[],serviceStart:'2024-01-15',serviceEnd:null,exitReason:null,terms:[term]};
 const creator = (n,extra={}) => ({id:id(n),handle:`creator_${n}`,activeFrom:'2024-01-01',activeThrough:null,approved:true,onboarded:true,tapAuthorized:true,tier:'L2',...extra});
 const ledger = {month:'2024-02',rosterConfirmed:true,headcountApproval:'',budgetApproval:'',creators:[creator(100,{handle:'  @@CREATOR_100  '}),creator(101,{activeFrom:'2024-02-15',tier:'L3'}),creator(102,{tapAuthorized:false,tier:'L4'})]};
 const calc = (client,terms=term,period=ledger,month='2024-02',through='2024-02-29') => db.query('select agency_creator_billing_calculate($1,$2,$3,$4,$5) as value',[JSON.stringify(client),JSON.stringify(terms),period===null?null:JSON.stringify(period),month,through]).then(r=>r.rows[0].value);
 const norm = periods => db.query('select agency_creator_periods_normalize($1) as value',[JSON.stringify(periods)]).then(r=>r.rows[0].value);
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(calc(draft),/permission denied/);await assert.rejects(norm([ledger]),/permission denied/);await assert.rejects(save(draft),/permission denied/);await db.exec('reset role');}
 await db.exec('set role service_role');
 for(const creatorRate of [null,{}, {...term.creatorRate,extra:true},{...term.creatorRate,maxCreators:0},{...term.creatorRate,maxCreators:1.5},{...term.creatorRate,monthlyFee:0.001},{...term.creatorRate,monthlyBudgetCap:-1}]) await assert.rejects(save({...draft,terms:[{...term,creatorRate}]}),/Invalid agency creator rate/);
 await assert.rejects(save({...draft,terms:[{...term,revSharePercent:22}]}),/Invalid agency creator rate/,'22 percent TAP cannot become an agency GMV fee');
 await assert.rejects(save({...draft,terms:[{...term,monthlyRetainer:500}]}),/Invalid agency creator rate/);
 await assert.rejects(save({...draft,terms:[{...term,feeModel:'fixed'}]}),/Invalid agency creator rate/);
 const client = await save(draft); assert.deepEqual(client.terms,[term]);
 await assert.rejects(save(draft,tenant,id(21)),/Invalid agency scope/);
 await assert.rejects(save({...draft,brandIds:[id(301)]}),/Invalid agency brands/);
 const normalized = (await norm([ledger]))[0]; assert.equal(normalized.creators[0].handle,'creator_100');
 for(const creators of [[creator(100),creator(101,{handle:' @@CREATOR_100 '})],[creator(100),creator(100,{handle:'different'})],[creator(100,{activeFrom:'2024-02-30'})],[creator(100,{activeThrough:'2023-12-31'})],[creator(100,{tier:'L5'})],[creator(100,{approved:'true'})],[creator(100,{extra:true})]]) await assert.rejects(norm([{...ledger,creators}]),/Invalid finance creator billing/);
 await assert.rejects(norm([ledger,ledger]),/Invalid finance creator billing period/);
 await assert.rejects(norm([{...ledger,extra:true}]),/Invalid finance creator billing period/);
 const specialIds=(await norm([{...ledger,creators:[creator(100,{id:'00000000-0000-0000-0000-000000000000'}),creator(101,{id:'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF'})]}]))[0];assert.equal(specialIds.creators[1].id,'ffffffff-ffff-ffff-ffff-ffffffffffff');
 const result = await calc(client); assert.equal(result.daysInMonth,29); assert.equal(result.eligibleCount,2); assert.equal(result.feeCents,75862); assert.equal(result.stipendCents,127586); assert.equal(result.combinedCents,203448);
 assert.equal(result.creators[0].activeDays,29); assert.equal(result.creators[1].activeDays,15); assert.equal(result.creators[1].sourceFeeCents,25862); assert.deepEqual(result.creators[2].missingRequirements,['tapAuthorized']); assert.equal(result.creators[2].sourceFeeCents,0);
 const cutoff = await calc(client,term,ledger,'2024-02','2024-02-16'); assert.equal(cutoff.creators[0].activeDays,16); assert.equal(cutoff.creators[1].activeDays,2); assert.equal(cutoff.fullMonthCombinedCents,result.fullMonthCombinedCents);
 const lifecycle = await calc({...client,serviceStart:'2024-02-20'}); assert.equal(lifecycle.creators[0].activeDays,10);
 const noRoster = await calc(client,term,null); assert.equal(noRoster.blocked,true); assert.equal(noRoster.feeCents,null);
 const unconfirmed = await calc(client,term,{...ledger,rosterConfirmed:false,creators:[]}); assert.equal(unconfirmed.feeCents,null); assert.equal(unconfirmed.eligibleCount,null);
 const zero = await calc(client,term,{...ledger,creators:[]}); assert.equal(zero.blocked,false); assert.equal(zero.feeCents,0); assert.equal(zero.eligibleCount,0);
 const unknownLife = await calc({...client,serviceStart:null}); assert.equal(unknownLife.feeCents,null); assert.equal(unknownLife.fullMonthCombinedCents,null);
 const half = await calc(client,{...term,creatorRate:{...term.creatorRate,monthlyFee:0.14}},{...ledger,month:'2025-02',creators:[creator(103,{activeFrom:'2025-02-28',activeThrough:'2025-02-28'})]},'2025-02','2025-02-28'); assert.equal(half.creators[0].sourceFeeCents,1,'Positive half-cent rounds up for each creator');
 const headcount = {...ledger,creators:Array.from({length:51},(_,n)=>creator(n+1000))}; const headHold = await calc(client,term,headcount,'2024-02','2024-02-01'); assert.equal(headHold.blocked,true); assert.equal(headHold.feeCents,null); assert.equal(headHold.eligibleCount,51); assert.equal(headHold.fullMonthCombinedCents,5100000);
 assert.equal((await calc(client,term,{...headcount,headcountApproval:'Written client approval'})).blocked,false);
 assert.equal((await calc(client,term,{...headcount,headcountApproval:'\t\n\u00a0'})).blocked,true,'Whitespace is not written approval');
 const budget = {...ledger,creators:Array.from({length:26},(_,n)=>creator(n+2000,{tier:'L4'}))}; const budgetHold = await calc(client,term,budget,'2024-02','2024-02-01'); assert.equal(budgetHold.blocked,true); assert.equal(budgetHold.fullMonthCombinedCents,10400000,'Budget checks full-month source plus stipend exposure, not just closed-day fees');
 assert.equal((await calc(client,term,{...budget,budgetApproval:'Written budget approval'})).blocked,false);
 assert.equal((await calc(client,term,{...budget,creators:budget.creators.slice(0,25)})).blocked,false,'Exactly the combined cap remains allowed');
 const parityCases = [
  {client,period:ledger}, {client,period:ledger,through:'2024-02-16'}, {client:{...client,serviceStart:'2024-02-20'},period:ledger},
  {client:{...client,serviceStart:null},period:ledger}, {client:{...client,serviceStart:'2024-02-30'},period:ledger},
  {client:{...client,serviceEnd:'2024-01-01'},period:ledger}, {client,period:null}, {client,period:{...ledger,rosterConfirmed:false}},
  {client,period:{...ledger,creators:[]}}, {client,period:headcount,through:'2024-02-01'}, {client,period:budget,through:'2024-02-01'},
  {client,period:{...budget,budgetApproval:'Written budget approval'}}, {client,period:{...headcount,headcountApproval:'Written headcount approval'}},
 ];
 for(const entry of parityCases){const month=entry.month??'2024-02',through=entry.through??'2024-02-29';const expected=JSON.parse(JSON.stringify(creatorModule.calculateCreatorBilling({client:entry.client,month,throughDate:through,rate:term.creatorRate,period:entry.period})));assert.deepEqual(await calc(entry.client,term,entry.period,month,through),expected,'SQL recomputation exactly matches the shipped TypeScript creator-billing model');}
 const omittedApprovals={month:ledger.month,rosterConfirmed:true,creators:[]};assert.deepEqual((await norm([omittedApprovals]))[0],{...omittedApprovals,headcountApproval:'',budgetApproval:''});
 const sixThousand=Array.from({length:6000},(_,n)=>creator(n+10000));
 const ceiling=[{...ledger,month:'2024-01',creators:sixThousand},{...ledger,month:'2024-02',creators:sixThousand}];
 assert.equal((await norm(ceiling)).reduce((sum,period)=>sum+period.creators.length,0),12000,'The exact global historical-ledger ceiling is supported');
 await assert.rejects(norm([ceiling[0],{...ceiling[1],creators:[...sixThousand,creator(30000)]}]),/Invalid finance creator billing periods/,'Global rows across monthly periods cannot exceed 12000');
 const pay = {effectiveMonth:'2024-01',managerId:manager,fixedMonthly:250,gmvPercent:0,payoutDays:7};
 let settings = await write('settings',{clientId:client.id,expectedRevision:0,settings:{managerTerms:[],creatorBillingPeriods:[ledger]}});
 const sourceSnapshot = {clientRevision:client.revision,settingsRevision:settings.revision,agencyTerms:term,manager:pay,gmvCents:null,feeCents:result.feeCents,managerCents:25000,issuedDate:'2024-03-01',dueDate:'2024-03-31',expectedDate:'2024-03-31',creatorBilling:{settingsRevision:settings.revision,period:normalized,result}};
 await assert.rejects(write('draft',{clientId:client.id,month:'2024-02',snapshot:sourceSnapshot}),/Invalid creator billing manager arrangement/,'Unknown manager pay cannot be silently treated as zero');
 settings = await write('settings',{clientId:client.id,expectedRevision:1,settings:{managerTerms:[pay]}}); assert.deepEqual(settings.settings.creatorBillingPeriods,[normalized],'An older settings caller cannot erase the existing actual ledger by omitting the new field');
 const snapshot = {...sourceSnapshot,settingsRevision:2,creatorBilling:{...sourceSnapshot.creatorBilling,settingsRevision:2}};
 const before = (await db.query('select count(*)::int as n from agency_finance_audit')).rows[0].n;
 for(const bad of [ {...snapshot,feeCents:result.combinedCents}, {...snapshot,managerCents:0}, {...snapshot,gmvCents:0}, {...snapshot,creatorBilling:{...snapshot.creatorBilling,result:{...result,feeCents:1}}}, {...snapshot,creatorBilling:{...snapshot.creatorBilling,period:{...normalized,rosterConfirmed:false}}}, {...snapshot,manager:{...pay,fixedMonthly:0}} ]) await assert.rejects(write('draft',{clientId:client.id,month:'2024-02',snapshot:bad}),/Invalid creator billing/);
 await assert.rejects(write('draft',{clientId:client.id,month:'2024-02',snapshot:{...snapshot,settingsRevision:1}}),/Finance revision conflict/);
 assert.equal((await db.query('select count(*)::int as n from agency_finance_audit')).rows[0].n,before,'Rejected forged invoices append no audit record');
 assert.equal((await db.query('select count(*)::int as n from agency_client_invoices')).rows[0].n,0,'Rejected forged invoices create no draft');
 const invoice = await write('draft',{clientId:client.id,month:'2024-02',snapshot}); assert.equal(invoice.snapshot.feeCents,75862); assert.equal(invoice.snapshot.managerCents,25000); assert.deepEqual(invoice.snapshot.creatorBilling.period,normalized);
 await assert.rejects(write('draft',{clientId:client.id,month:'2024-02',snapshot}),/duplicate key/);
 await assert.rejects(write('settings',{clientId:client.id,expectedRevision:1,settings:{managerTerms:[pay]}}),/conflict/);
 await assert.rejects(write('settings',{clientId:client.id,expectedRevision:2,settings:{managerTerms:[pay],creatorBillingPeriods:[ledger]}},other,id(21)),/Unknown/);
 await write('settings',{clientId:client.id,expectedRevision:2,settings:{managerTerms:[pay],creatorBillingPeriods:[{...ledger,creators:[]}]}});
 assert.deepEqual((await db.query('select snapshot from agency_client_invoices where id=$1',[invoice.id])).rows[0].snapshot,snapshot,'Later actual-ledger edits do not rewrite a frozen invoice input or calculation');
 const partialClient = await save({...draft,name:'Partial creator service',serviceStart:'2024-02-15'});
 const partialPay={...pay,effectiveMonth:'2024-02',fixedMonthly:100};
 const partialResult=await calc(partialClient);
 await write('settings',{clientId:partialClient.id,expectedRevision:0,settings:{managerTerms:[partialPay],creatorBillingPeriods:[ledger]}});
 const partialSnapshot={...snapshot,clientRevision:partialClient.revision,settingsRevision:1,manager:partialPay,feeCents:partialResult.feeCents,managerCents:10000,creatorBilling:{settingsRevision:1,period:normalized,result:partialResult}};
 const partialAudit=(await db.query('select count(*)::int as n from agency_finance_audit')).rows[0].n;
 await assert.rejects(write('draft',{clientId:partialClient.id,month:'2024-02',snapshot:partialSnapshot}),/Invalid creator billing approved manager service period/,'Partial creator service never automatically prorates or assumes full manager pay');
 assert.equal((await db.query('select count(*)::int as n from agency_finance_audit')).rows[0].n,partialAudit);
 await assert.rejects(write('settings',{clientId:partialClient.id,expectedRevision:1,settings:{managerTerms:[{...partialPay,servicePeriod:{start:'2024-02-01',end:'2024-02-29'}}]}}),/Invalid agency service period/);
 const approvedPartialPay={...partialPay,servicePeriod:{start:'2024-02-15',end:'2024-02-29'}};
 await write('settings',{clientId:partialClient.id,expectedRevision:1,settings:{managerTerms:[approvedPartialPay]}});
 const validPartialSnapshot={...partialSnapshot,settingsRevision:2,manager:approvedPartialPay,creatorBilling:{...partialSnapshot.creatorBilling,settingsRevision:2}};
 const partialInvoice=await write('draft',{clientId:partialClient.id,month:'2024-02',snapshot:validPartialSnapshot});assert.equal(partialInvoice.snapshot.managerCents,10000);assert.equal(partialInvoice.snapshot.feeCents,51724);
 await db.exec('reset role');
 const variableClient = await save({...draft,name:'Variable manager sourcing',brandIds:[id(300)]});
 const variablePay = {...pay,fixedMonthly:100,gmvPercent:1};
 let variableSettings = await write('settings',{clientId:variableClient.id,expectedRevision:0,settings:{managerTerms:[variablePay],creatorBillingPeriods:[ledger]}});
 await db.exec(`create table creator_gmv_fixture(complete boolean); insert into creator_gmv_fixture values(true); grant select on creator_gmv_fixture to service_role;
 create or replace function agency_business_range_performance(p_tenant_id uuid,p_month date,p_from date,p_through date)
 returns table(brand_id uuid,managed_gmv numeric,prior_managed_gmv numeric,recorded_days integer,prior_recorded_days integer,expected_days integer,prior_expected_days integer,recorded_through date,prior_recorded_through date,complete boolean,prior_complete boolean,latest_recorded_through date,prior_latest_recorded_through date,source_recorded_days integer,prior_source_recorded_days integer)
 language sql stable security invoker as $$ select '${id(300)}'::uuid,100000::numeric,null::numeric,p_through-p_from+1,0,p_through-p_from+1,0,p_through,null::date,f.complete,false,p_through,null::date,p_through-p_from+1,0 from creator_gmv_fixture f where p_tenant_id='${tenant}'::uuid $$;`);
 const variableSnapshot = {...snapshot,clientRevision:variableClient.revision,settingsRevision:variableSettings.revision,manager:variablePay,gmvCents:10000000,managerCents:110000,creatorBilling:{...snapshot.creatorBilling,settingsRevision:variableSettings.revision}};
 await db.exec('set role service_role');
 await assert.rejects(write('draft',{clientId:variableClient.id,month:'2024-02',snapshot:{...variableSnapshot,gmvCents:0}}),/Invalid creator billing complete manager GMV/);
 await db.exec('reset role; update creator_gmv_fixture set complete=false; set role service_role;');
 await assert.rejects(write('draft',{clientId:variableClient.id,month:'2024-02',snapshot:variableSnapshot}),/Invalid creator billing complete manager GMV/);
 await db.exec('reset role; update creator_gmv_fixture set complete=true; set role service_role;');
 const variableInvoice = await write('draft',{clientId:variableClient.id,month:'2024-02',snapshot:variableSnapshot}); assert.equal(variableInvoice.snapshot.feeCents,75862,'GMV supports manager pay only; TAP or revenue share never inflates per-creator agency fees'); assert.equal(variableInvoice.snapshot.managerCents,110000);
 await db.exec('reset role; set role service_role; begin read only;'); assert.equal((await calc(client)).feeCents,75862); await db.exec('rollback; reset role;');
 for(const signature of ['agency_creator_billing_calculate(jsonb,jsonb,jsonb,text,date)','agency_creator_periods_normalize(jsonb)','agency_creator_rate_normalize(jsonb)','agency_finance_write(uuid,uuid,text,jsonb)']) {const security=(await db.query(`select prosecdef,has_function_privilege('anon',oid,'EXECUTE') as anon,has_function_privilege('authenticated',oid,'EXECUTE') as authenticated from pg_proc where oid=$1::regprocedure`,[signature])).rows[0];assert.equal(security.prosecdef,false);assert.equal(security.anon,false);assert.equal(security.authenticated,false);}
 console.log('PASS creator billing SQL: strict normalized actual ledger, eligible lifecycle days, leap/half-cent rounding, approval exposure, confirmed-empty versus unknown and sourcing/stipend separation');
 console.log('PASS per-creator draft SQL: recomputed source fee/input/breakdown, actual manager settings and GMV, source revisions/CAS, no forged writes/audits, frozen snapshots, tenant/role/invoker isolation');
} finally { await db.close(); }
