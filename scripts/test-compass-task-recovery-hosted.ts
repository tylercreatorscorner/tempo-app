import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { acquireCompassTask, patchCompassTask, type CompassRecoveryScope } from '../src/lib/tiktok/compass-task-ledger';

async function main() {
  const env = parse(readFileSync('.env.local','utf8'));
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'https://otwssgedcnxamcglqpnn.supabase.co','Hosted test project only');
  assert(env.SUPABASE_SERVICE_ROLE_KEY,'Test service role is required');
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const taskId = 'test-recovery-'+randomUUID();
  const scope: CompassRecoveryScope = {brandSlug:'jiyu-api-test',reportDate:'2026-07-25',moduleType:'CREATOR',
    windowType:'PAST_24H',planType:'ALL',connectionId:randomUUID(),shopId:'7495653723838187639',
    apiVersion:'202603',pollApiVersion:'202603',paramsIn:'body',docType:'CREATOR'};
  try {
    const initial = await acquireCompassTask(db,scope,null,{newTaskId:taskId});
    await assert.rejects(acquireCompassTask(db,scope,null,{rowId:initial.rowId}),/already being processed/);
    await patchCompassTask(db,initial,{status:'failed',error:'synthetic timeout'});
    const race = await Promise.allSettled([1,2].map(()=>acquireCompassTask(db,scope,null,{rowId:initial.rowId})));
    const winners = race.filter(result=>result.status==='fulfilled');
    assert.equal(winners.length,1,'Exactly one concurrent recovery must win');
    const winner = winners[0];
    if (winner.status !== 'fulfilled') throw new Error('No winning lease');
    await assert.rejects(patchCompassTask(db,initial,{status:'ingested'}),/no longer owns/);
    await patchCompassTask(db,winner.value,{status:'verified_dry_run'});
    const {data,error} = await db.from('tiktok_compass_tasks').select('status,error,lease_token,lease_expires_at').eq('id',initial.rowId).single();
    assert.equal(error,null); assert.deepEqual(data,{status:'verified_dry_run',error:null,lease_token:null,lease_expires_at:null});
    console.log('PASS hosted test: exclusive recovery, stale-worker refusal and lease release; no TikTok calls or fact-table writes');
  } finally {
    // Only the uniquely named synthetic evidence row created by this test.
    const {error} = await db.from('tiktok_compass_tasks').delete().eq('brand_slug','jiyu-api-test').eq('task_id',taskId);
    assert.equal(error,null,'Synthetic task cleanup failed');
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Recovery test failed');process.exitCode=1;});
