import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { TikTokClient, TikTokPermanentError, TikTokRateLimitError } from '../src/lib/tiktok/client';
import { fetchDailyExport } from '../src/lib/tiktok/compass';
import { compassRetryInfo, pendingCompassRetry } from '../src/lib/tiktok/compass-retry';

async function main() {
  const epoch = Date.parse('2026-09-15T06:00:00Z');
  const coded = new TikTokPermanentError({status:200,code:36009037,message:'untrusted-body',requestId:'safe-id'});
  const info = compassRetryInfo(coded,epoch)!;
  assert.equal(info.reason,'rate_limit'); assert.equal(info.notBefore,'2026-09-15T07:00:00.000Z');
  assert(!JSON.stringify(info).includes('untrusted-body'));
  assert.equal(compassRetryInfo(new Error('429 rate limit'),epoch),undefined);
  assert.equal(compassRetryInfo(new TikTokPermanentError({status:400,code:1,message:'bad parameter',requestId:null}),epoch),undefined);
  assert.equal(pendingCompassRetry(epoch).notBefore,'2026-09-15T06:01:00.000Z');
  const unsafeId = new TikTokRateLimitError({status:429,code:2,message:'quota',requestId:'bad\nrequest',retryAfterMs:7_200_000});
  assert.equal(compassRetryInfo(unsafeId,epoch)?.notBefore,'2026-09-15T08:00:00.000Z');
  assert.equal(compassRetryInfo(unsafeId,epoch)?.requestId,null);

  let mode = 'poll';
  const paths: string[] = [];
  const server = createServer((req,res)=>{
    const path = new URL(req.url!,'http://localhost').pathname; paths.push(path);
    const success = (data:unknown)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({code:0,data}));};
    if (path.endsWith('/offline_task') && mode!=='create') return success({task:{id:'saved-task'}});
    if (path.endsWith('/offline_tasks') && mode==='download') return success({tasks:[{id:'saved-task',status:'SUCCEEDED'}]});
    res.statusCode = mode==='permanent'?400:mode==='business'?200:429;
    res.setHeader('content-type','application/json');
    res.setHeader('retry-after',mode==='date'?new Date(Date.now()+3_600_000).toUTCString():mode==='business'?'7200':'0');
    res.end(JSON.stringify({code:mode==='permanent'?123:36009037,message:'test quota',request_id:'quota-request'}));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const client = new TikTokClient({accessToken:'test',appKey:'test',appSecret:'test',shopCipher:'test',maxRetries:3,
    baseUrl:`http://127.0.0.1:${(server.address() as AddressInfo).port}`});
  const resumeTask = {taskId:'saved-task',brandSlug:'test',reportDate:'2026-07-25',moduleType:'CREATOR' as const,windowType:'PAST_24H' as const,planType:'ALL'};
  try {
    for (mode of ['poll','download','create','permanent','business']) {
      paths.length=0;
      const before=Date.now();
      const result=await fetchDailyExport('test','2026-07-25','CREATOR',{client,
        ...(mode==='create'?{}:{resumeTask}),poll:{sleep:async()=>{},maxPolls:1}});
      assert.equal(result.ok,false);
      if (result.ok) throw new Error('Expected failure');
      assert.equal(paths.length,mode==='download'?2:1,'No internal retry is allowed');
      if (mode==='permanent') assert.equal(result.retry,undefined);
      else {
        assert.equal(result.retry?.upstreamStatus,mode==='business'?200:429); assert.equal(result.retry?.upstreamCode,36009037);
        assert.equal(result.retry?.requestId,'quota-request');
        assert(Date.parse(result.retry!.notBefore)>=before+(mode==='business'?7_200_000:3_600_000));
        assert.equal(result.taskId,mode==='create'?null:'saved-task');
      }
    }
    mode='date'; paths.length=0;
    await assert.rejects(client.request('GET','/test',{retry:false}),error=>{
      assert(error instanceof TikTokRateLimitError);
      assert(error.retryAfterMs!==null && error.retryAfterMs>3_590_000 && error.retryAfterMs<=3_600_000);
      return true;
    });
    assert.equal(paths.length,1);
    console.log('PASS one-request Compass failures, safe retry metadata, hourly quota floor, HTTP-date Retry-After and permanent-error refusal');
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
