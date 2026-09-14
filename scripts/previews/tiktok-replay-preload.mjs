// Test-process transport only. Not imported by application code or deployments.
import fs from 'node:fs';
const previewHost='otwssgedcnxamcglqpnn.supabase.co';
if(process.env.TIKTOK_REPLAY_TEST!=='1'||new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname!==previewHost||process.env.TIKTOK_APP_KEY!=='replay-only-app')throw Error('Replay isolation checks failed');
const captures=['captures','extra'].flatMap(part=>JSON.parse(fs.readFileSync(new URL(`../../.env.tiktok-replay-${part}.json`,import.meta.url),'utf8')).captures);
const nativeFetch=globalThis.fetch;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','X-Tempo-Test-Source':'historical-replay'}});
export async function replayFetch(input,init){
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 if(url.hostname==='open-api.tiktokglobalshop.com'){
  const method=(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
  const search=url.pathname==='/affiliate_seller/202508/sample_applications/search';
  const collaboration=url.pathname==='/affiliate_seller/202412/open_collaborations/search';
  const fulfillment=/^\/affiliate_seller\/202409\/sample_applications\/\d+\/fulfillments\/search$/.test(url.pathname);
  if(method!==(search||collaboration||fulfillment?'POST':'GET'))throw Error('Replay blocked a TikTok mutation');
  if(search&&init?.body){const body=JSON.parse(init.body);if(Object.keys(body).length)return json({code:400001,message:'Replay has no captured response for these filters'},400);}
  const token=url.searchParams.get('page_token')??'';
  const record=captures.find(c=>c.endpoint===url.pathname&&(c.page_token??'')===token);
  if(!record)return json({code:400001,message:'Historical replay exhausted or endpoint not captured; this is not a complete live result'},400);
  for(const key of ['start_date_ge','end_date_lt','currency','account_type'])if(record.request_params[key]&&url.searchParams.get(key)!==String(record.request_params[key]))return json({code:400001,message:'Replay request differs from captured reporting window'},400);
  return json({code:0,message:'Success',data:record.response,request_id:'historical-replay'});
 }
 if(url.hostname===previewHost||['127.0.0.1','localhost','[::1]'].includes(url.hostname))return nativeFetch(input,init);
 throw Error('Replay blocked external network destination');
}
globalThis.fetch=replayFetch;
