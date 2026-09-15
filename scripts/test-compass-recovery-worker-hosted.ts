import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { COMPASS_TEST_PROJECT } from '../src/lib/tiktok/compass-recovery-worker';

async function main() {
  const env=parse(readFileSync('.env.local','utf8'));
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,COMPASS_TEST_PROJECT,'Hosted test database only');
  assert(env.SUPABASE_SERVICE_ROLE_KEY);
  const db=createClient(COMPASS_TEST_PROJECT,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const brand='queue-test-'+randomUUID();
  const tasks: string[]=[];
  const leases: Array<{jobId:string;leaseToken:string}>=[];
  const syntheticDue=new Date(Date.now()+3_600_000).toISOString();
  const original=await db.from('tiktok_compass_dispatch_gate').select('*').eq('id',1).single();
  assert.equal(original.error,null);
  assert.equal(original.data.lease_token,null,'Do not disturb an active worker');
  assert(original.data.not_before==='-infinity'||Date.parse(original.data.not_before)<Date.now(),'Do not override an existing cooldown');
  const claim=()=>db.rpc('claim_compass_recovery',{p_brand:brand});
  const finish=(job:{jobId:string;leaseToken:string},outcome='verified_dry_run',retry:string|null=null,rate=false)=>
    db.rpc('finish_compass_recovery',{p_job:job.jobId,p_token:job.leaseToken,p_outcome:outcome,p_retry_at:retry,p_rate_limited:rate});
  try {
    for(let n=0;n<2;n++) {
      const task=await db.from('tiktok_compass_tasks').insert({brand_slug:brand,end_day:'2026-07-25',
        module_type:'CREATOR',window_type:'PAST_24H',task_id:'synthetic-'+randomUUID()}).select('id').single();
      assert.equal(task.error,null);assert(task.data);tasks.push(task.data.id);
      const queued=await db.from('tiktok_compass_recovery_queue').insert({task_row_id:task.data.id});
      assert.equal(queued.error,null);
    }
    const race=await Promise.all([claim(),claim()]);
    for(const r of race) assert.equal(r.error,null);
    assert.equal(race.filter(r=>r.data.state==='claimed').length,1);
    assert.equal(race.filter(r=>r.data.state==='busy').length,1);
    const first=race.find(r=>r.data.state==='claimed')!.data;leases.push(first);
    assert.equal((await finish(first,'retry',syntheticDue,true)).data,'queued');
    const held=await claim(); assert.equal(held.error,null);assert.equal(held.data.state,'cooldown');
    assert((await finish(first)).error,'Stale ownership must be rejected');
    // Only clear the exact synthetic hold this test installed, never an upstream hold.
    const cleared=await db.from('tiktok_compass_dispatch_gate').update({not_before:original.data.not_before})
      .eq('id',1).eq('not_before',syntheticDue).is('lease_token',null).select('id');
    assert.equal(cleared.error,null);assert.equal(cleared.data?.length,1);
    const second=(await claim()).data;assert.equal(second.state,'claimed');leases.push(second);
    assert.equal((await finish(second)).data,'verified_dry_run');
    // Advance only our own synthetic queued job; no real retry timing is altered.
    const moved=await db.from('tiktok_compass_recovery_queue').update({next_attempt_at:new Date(Date.now()-1000).toISOString()})
      .eq('id',first.jobId).eq('status','queued');assert.equal(moved.error,null);
    const recovered=(await claim()).data;assert.equal(recovered.state,'claimed');assert.equal(recovered.attempt,2);leases.push(recovered);
    assert.equal((await finish(recovered)).data,'verified_dry_run');
    const complete=await db.from('tiktok_compass_recovery_queue').select('status,attempts').in('task_row_id',tasks);
    assert.equal(complete.error,null);assert.equal(complete.data?.length,2);
    assert(complete.data.every(r=>r.status==='verified_dry_run'));
    console.log('PASS hosted queue: competing claims, shared cooldown, stale-owner refusal and due recovery; synthetic rows only, no TikTok calls');
  } finally {
    const gate=await db.from('tiktok_compass_dispatch_gate').select('*').eq('id',1).single();
    assert.equal(gate.error,null);
    const owned=leases.find(l=>l.leaseToken===gate.data.lease_token);
    if(owned) assert.equal((await finish(owned,'needs_review')).error,null);
    if(gate.data.not_before===syntheticDue || Date.parse(gate.data.not_before)===Date.parse(syntheticDue)) {
      const clear=await db.from('tiktok_compass_dispatch_gate').update({not_before:original.data.not_before})
        .eq('id',1).eq('not_before',syntheticDue).is('lease_token',null);
      assert.equal(clear.error,null);
    }
    if(tasks.length) {
      const removed=await db.from('tiktok_compass_recovery_queue').delete().in('task_row_id',tasks);assert.equal(removed.error,null);
      const removedTasks=await db.from('tiktok_compass_tasks').delete().in('id',tasks).eq('brand_slug',brand);assert.equal(removedTasks.error,null);
    }
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Hosted queue test failed');process.exitCode=1;});
