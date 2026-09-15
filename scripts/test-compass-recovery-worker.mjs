import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const exports = {};
runInNewContext(ts.transpileModule(readFileSync('src/lib/tiktok/compass-recovery-worker.ts','utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText, {exports,Date,Number,Error,require:name=>{
  assert.equal(name,'./compass-task-ledger');
  return {COMPASS_ROW_ID:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i};
}});
const pg = new PGlite();
let rpcCalls = 0;
const db = {rpc:async(name,args)=>{
  rpcCalls++;
  assert(['claim_compass_recovery','finish_compass_recovery'].includes(name));
  try {
    const result = await pg.query(`SELECT public.${name}(${Object.keys(args).map((_,i)=>'$'+(i+1)).join(',')}) AS result`,Object.values(args));
    return {data:result.rows[0].result,error:null};
  } catch(error) { return {data:null,error:{message:error.message}}; }
}};
const scope = {brandSlug:'jiyu-api-test',shopId:'7495653723838187639',connectionId:randomUUID(),reportDate:'2026-07-25',
  moduleType:'CREATOR',windowType:'PAST_24H',planType:'ALL',apiVersion:'202603',pollApiVersion:'202603',paramsIn:'body',docType:'CREATOR'};
async function enqueue(patch={}) {
  const task = (await pg.query(`INSERT INTO tiktok_compass_tasks(brand_slug,end_day,module_type,window_type,task_id,recovery_context)
    VALUES($1,'2026-07-25','CREATOR','PAST_24H',$2,$3) RETURNING id`,[scope.brandSlug,randomUUID(),{...scope,...patch}])).rows[0].id;
  const job = (await pg.query('INSERT INTO tiktok_compass_recovery_queue(task_row_id) VALUES($1) RETURNING id',[task])).rows[0].id;
  return {task,job};
}
const claim = ()=>db.rpc('claim_compass_recovery',{p_brand:scope.brandSlug});
const finish = (job,outcome='verified_dry_run',due=null,rate=false)=>db.rpc('finish_compass_recovery',{
  p_job:job.jobId,p_token:job.leaseToken,p_outcome:outcome,p_retry_at:due,p_rate_limited:rate});
const worker = fn=>exports.dispatchCompassRecovery(db,exports.COMPASS_TEST_PROJECT,fn);
const success = input=>({ok:true,stage:'done',brandSlug:input.brandSlug,reportDate:input.reportDate,moduleType:input.moduleType,
  dryRun:input.dryRun,taskRowId:input.resumeTaskRowId});
async function expire() {
  await pg.exec("UPDATE tiktok_compass_dispatch_gate SET not_before=now()-interval '1 second',lease_expires_at=now()-interval '1 second'; UPDATE tiktok_compass_recovery_queue SET next_attempt_at=now()-interval '1 second';");
}
try {
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  for (const name of ['122_tiktok_compass_tasks.sql','20260915053541_compass_task_recovery_context.sql',
    '20260915063729_compass_retry_timing.sql','20260915073618_compass_recovery_queue.sql']) {
    await pg.exec(readFileSync('supabase/migrations/'+name,'utf8'));
  }
  await assert.rejects(exports.dispatchCompassRecovery(db,'https://production.supabase.co',()=>{throw Error('must not run');}),/test project/);
  assert.equal(rpcCalls,0);
  for (const role of ['anon','authenticated']) {
    await pg.exec('SET ROLE '+role);
    await assert.rejects(pg.query("SELECT public.claim_compass_recovery('jiyu-api-test')"),/permission denied/);
    await assert.rejects(pg.query('SELECT * FROM tiktok_compass_recovery_queue'),/permission denied/);
    await pg.exec('RESET ROLE');
  }
  const first=await enqueue(); const second=await enqueue();
  const race=await Promise.all([claim(),claim()]);
  assert(race.every(r=>!r.error));
  assert.equal(race.filter(r=>r.data.state==='claimed').length,1);
  assert.equal(race.filter(r=>r.data.state==='busy').length,1);
  const owned=race.find(r=>r.data.state==='claimed').data;
  const due=new Date(Date.now()+3_600_000).toISOString();
  assert.equal((await finish(owned,'retry',due,true)).data,'queued');
  assert.equal((await claim()).data.state,'cooldown','Another ready report must respect shared hold');
  assert((await finish(owned)).error,'Stale owner must fail');
  await expire();
  let calls=0;
  const resumed=await worker(async input=>{
    calls++; assert.equal(input.dryRun,true);assert.equal(input.poll.maxPolls,1);assert(input.resumeTaskRowId);
    return success(input);
  });
  assert.equal(resumed.state,'verified_dry_run');assert.equal(calls,1);
  assert.equal((await worker(async input=>success(input))).state,'verified_dry_run');
  assert.equal((await claim()).data.state,'idle');
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM tiktok_compass_recovery_queue WHERE status=$1',['verified_dry_run'])).rows[0].n,2);
  console.log('PASS production guard, denied public access, shared serialization/cooldown, lease ownership and dry-run recovery');

  // Throttle saved by ingestion survives a crash before dispatcher finish.
  await pg.query("UPDATE tiktok_compass_tasks SET retry_reason='rate_limit',retry_not_before=now()+interval '1 hour' WHERE id=$1",[first.task]);
  assert.equal((await claim()).data.state,'cooldown');
  await pg.query('UPDATE tiktok_compass_tasks SET retry_not_before=NULL WHERE id=$1',[first.task]);
  const crash=await enqueue();
  let last;
  for(let n=1;n<=3;n++) {
    last=(await claim()).data;assert.equal(last.state,'claimed');assert.equal(last.attempt,n);
    await expire(); // synthetic crash; no finish call
  }
  assert.equal((await claim()).data.state,'idle');
  assert.equal((await pg.query('SELECT status,attempts,last_outcome FROM tiktok_compass_recovery_queue WHERE id=$1',[crash.job])).rows[0].status,'needs_review');
  assert((await finish(last)).error);
  const retries=await enqueue();
  for(let n=1;n<=3;n++) {
    const result=await worker(async input=>({...success(input),ok:false,stage:'poll',retry:{reason:'pending',notBefore:new Date().toISOString()}}));
    assert.equal(result.state,n===3?'needs_review':'queued'); assert.equal(result.attempt,n);
    if(n<3) assert.equal((await claim()).data.state,'idle','Retry must not happen immediately');
    await expire();
  }
  assert.equal((await pg.query('SELECT last_outcome FROM tiktok_compass_recovery_queue WHERE id=$1',[retries.job])).rows[0].last_outcome,'Three attempts exhausted');
  assert.equal((await claim()).data.state,'idle');
  console.log('PASS ingester throttle fallback, crash recovery, three-attempt cap and persistent review status');

  for(const patch of [{shopId:'different-shop'},{reportDate:'2026-02-30'},{reportDate:'9999-01-01'},{moduleType:'BASE'}]) {
    await enqueue(patch);let forbiddenCalls=0;
    assert.equal((await worker(async input=>{forbiddenCalls++;return success(input);})).state,'needs_review');
    assert.equal(forbiddenCalls,0,'Invalid scope must never reach ingestion');
  }
  await enqueue();
  assert.equal((await worker(async input=>({...success(input),reportDate:'2026-07-24'}))).state,'needs_review');
  const unknown=await enqueue();
  assert.equal((await worker(async()=>{throw Error('secret-must-not-be-stored');})).state,'needs_review');
  const observed=await pg.query('SELECT last_outcome FROM tiktok_compass_recovery_queue WHERE id=$1',[unknown.job]);
  assert.equal(observed.rows[0].last_outcome,'needs_review');
  await enqueue();
  const valid=(await claim()).data;
  assert((await finish(valid,'retry','infinity',true)).error);
  assert.equal((await finish(valid)).data,'verified_dry_run');
  await assert.rejects(pg.query('INSERT INTO tiktok_compass_recovery_queue(task_row_id) VALUES($1)',[second.task]),/duplicate key/);
  console.log('PASS wrong scope/result, unknown failures, finite retry validation, sanitized outcome and duplicate refusal');
} finally {await pg.close();}
