import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';

const tenant='00000000-0000-0000-0000-000000000001';
const start='2026-10-01',end='2026-10-31';
const oldId='c85fae7e-c86c-4f92-a969-907647d79dc0',newId='2723ac34-042b-4fb0-8627-a9874bdc2a02';
const oldToken='original-report-token',newToken='approved-report-token';
const oldVideo='7700368396864539934',newVideo='7700368396864539935';
const videoUrl=id=>`https://www.tiktok.com/@creator/video/${id}`;
function reportRow(id,token,name,video) {
  return {id,token,tenant_id:tenant,brand_slug:'m3',brand_name:'M3',period_start:start,period_end:end,period_label:'October 2026',report_type:'monthly',revoked_at:null,
    created_at:id===oldId?'2026-11-12T00:00:00Z':'2026-11-13T00:00:00Z',viewed_at:null,notes:name,plan:null,
    snapshot:{v:1,generatedAt:'2026-11-13T00:00:00Z',weekly:[],report:{brandSlug:'m3',startDate:start,endDate:end,dailyPerformance:[],
      topVideos:[{videoUrl:videoUrl(video)}],creatorsCorner:{videos:1,topVideos:[{videoUrl:videoUrl(video)}]},
      granular:{creators:[{name,realName:name,handle:'creator',handles:['creator'],gmv:123,retainer:0,isAffiliate:true,postsPublished:1,orders:1,items:1}]}},
      publishedVideoEvidence:{v:1,capturedAt:'2026-11-13T00:00:00Z',periodStart:start,periodEnd:end,scope:'managed-published',total:1,
        videos:[{videoId:video,creatorHandle:'creator',qualifyingHandles:['creator'],publishedAt:'2026-10-15',watchUrl:videoUrl(video),title:name}]}}};
}
const original=reportRow(oldId,oldToken,'Original creator',oldVideo);
const approved=reportRow(newId,newToken,'Approved creator',newVideo);
approved.snapshot.reportCorrection={v:1,status:'approved',sourceReportId:oldId,scope:{tenantId:tenant,brandSlug:'m3',reportType:'monthly',periodStart:start,periodEnd:end}};
let rows=[],reads=[],writes=[],pdfProps=null,fail=false;
function reset(){rows=structuredClone([original,approved]);reads=[];writes=[];pdfProps=null;fail=false;}
function contains(value,desired){return desired&&typeof desired==='object'?Object.entries(desired).every(([k,v])=>contains(value?.[k],v)):value===desired;}
const db={from(table){const filters=[],orders=[];let limit=null,offset=0,columns='',patch=null;
  const q={select:c=>{columns=c;return q;},eq:(k,v)=>{filters.push(r=>r[k]===v);return q;},is:(k,v)=>{filters.push(r=>r[k]===v);return q;},
    contains:(k,v)=>{filters.push(r=>contains(r[k],v));return q;},order:(k,o)=>{orders.push([k,o.ascending]);return q;},limit:n=>{limit=n;return q;},
    range:(a,b)=>{offset=a;limit=b-a+1;return q;},update:value=>{patch=value;return q;},abortSignal:()=>q,maybeSingle:async()=>run(true),then:(yes,no)=>Promise.resolve(run(false)).then(yes,no)};
  function run(single){reads.push({table,columns});if(fail)return {data:null,error:{message:'secret database error'}};
    let data=(table==='client_reports'?rows:[]).filter(r=>filters.every(f=>f(r)));
    for(const[k,asc]of [...orders].reverse())data.sort((a,b)=>String(a[k]).localeCompare(String(b[k]))*(asc?1:-1));
    if(limit!==null)data=data.slice(offset,offset+limit);
    if(patch)for(const row of data){Object.assign(row,patch);writes.push(row.id);}
    const copy=data.map(r=>({...structuredClone(r),top_videos:r.snapshot?.report?.topVideos,managed_top_videos:r.snapshot?.report?.creatorsCorner?.topVideos,
      published_evidence:r.snapshot?.publishedVideoEvidence,correction:r.snapshot?.reportCorrection,reconciliation:r.snapshot?.reconciliation}));
    return {data:single?copy[0]??null:copy,error:null};}
  return q;},rpc(){throw Error('Public reads must never rebuild report or access live roster');}};
const redirect=location=>{const error=new Error('REDIRECT');error.location=location;throw error;};
const deps={'server-only':{},'next/server':{NextRequest,NextResponse},'next/navigation':{redirect,notFound:()=>{throw Error('NOT_FOUND');}},
  '@/lib/supabase/server':{createAdminClient:async()=>db},'lucide-react':{LockKeyhole:'lock'},
  'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'},
  './studio-report-view':{StudioReportView:'report'},'./view-beacon':{ViewBeacon:'beacon'},'./video-library':{VideoLibrary:'video-library'},
  '@/lib/data/client-reports':{reviveReportDates:r=>({...r,startDate:new Date(r.startDate),endDate:new Date(r.endDate)})},
  '@/lib/brand-logo':{brandLogoDataUri:async()=>null},'@/lib/pdf/report-artwork':{reportVideoCovers:async()=>({})},
  '@react-pdf/renderer':{renderToBuffer:async()=>new Uint8Array([37,80,68,70])},
  '@/lib/pdf/brand-client-report-pdf':{BrandClientReportPDF:p=>{pdfProps=p;return p;}},'@/lib/pdf/report-reconciliation-pdf':{ReportReconciliationPDF:()=>null},
};
function load(file){const exports={};runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
  {exports,console,Date,URL,URLSearchParams,Set,Map,AbortSignal,Response,Request,Uint8Array,require:name=>{assert.ok(name in deps,`Unknown dependency ${name}`);return deps[name];}});return exports;}
deps['./client-report-canonical']=deps['@/lib/data/client-report-canonical']=load('src/lib/data/client-report-canonical.ts');
deps['./brand-registry-core']=load('src/lib/data/brand-registry-core.ts');
deps['./published-video-evidence-types']=deps['@/lib/data/published-video-evidence-types']=load('src/lib/data/published-video-evidence-types.ts');
deps['./published-video-evidence']=load('src/lib/data/published-video-evidence.ts');
deps['@/lib/media/tiktok-video-cover']={parseTikTokVideoUrl:input=>{const match=/^https:\/\/www\.tiktok\.com\/@creator\/video\/(\d+)$/.exec(input);return match?{url:input,videoId:match[1]}:null;}};
const media=load('src/lib/data/client-report-media.ts');
const library=deps['@/lib/data/client-report-videos']=load('src/lib/data/client-report-videos.ts');
const history=deps['@/lib/data/client-report-history']=load('src/lib/data/client-report-history.ts');
const page=load('src/app/r/[token]/page.tsx'),videoPage=load('src/app/r/[token]/videos/page.tsx');
const pdf=load('src/app/api/report-pdf/[token]/route.ts'),csv=load('src/app/api/report-csv/[token]/route.ts'),videos=load('src/app/api/report-videos/[token]/route.ts');
const beacon=load('src/app/api/report-viewed/[token]/route.ts');
const ctx=token=>({params:Promise.resolve({token})});
const req=(route,token,query='')=>new NextRequest(`https://tempo.invalid/api/${route}/${token}${query}`);
const pageProps=(token,query={})=>({...ctx(token),searchParams:Promise.resolve(query)});
async function expectRedirect(task,url){await assert.rejects(task,e=>e.location===url);}

reset();const before=JSON.stringify(rows);
await expectRedirect(()=>page.default(pageProps(oldToken,{preview:'1'})),`/r/${newToken}?preview=1`);
assert.equal((await page.generateMetadata(pageProps(oldToken))).title,'M3 · Month in Review · October 2026');
let rendered=await page.default(pageProps(newToken));
assert.equal(rendered.props.children[1].props.notes,'Approved creator');
assert.equal(rendered.props.children[0].props.token,newToken);
for(const[name,handler]of [['report-pdf',pdf],['report-csv',csv],['report-videos',videos]]){
  const result=await handler.GET(req(name,oldToken,'?preview=1&creator=handle%3Acreator'),ctx(oldToken));
  assert.equal(result.status,307);assert.equal(result.headers.get('cache-control'),'private, no-store');
  assert.equal(result.headers.get('location'),`https://tempo.invalid/api/${name}/${newToken}?preview=1&creator=handle%3Acreator`);
}
assert.equal(pdfProps,null,'Old PDF URL redirects before rendering obsolete values');
assert.equal((await pdf.GET(req('report-pdf',newToken),ctx(newToken))).status,200);
assert.equal(pdfProps.notes,'Approved creator');assert.ok(pdfProps.reportUrl.endsWith(newToken));
const csvText=await(await csv.GET(req('report-csv',newToken),ctx(newToken))).text();
assert.ok(csvText.includes('Approved creator'));assert.ok(!csvText.includes('Original creator'));
let lib=await library.getClientReportVideoLibrary(oldToken);
assert.equal(lib.token,newToken);assert.equal(lib.evidence.videos[0].videoId,newVideo);
await expectRedirect(()=>videoPage.default(pageProps(oldToken,{preview:'1',q:'saved',creator:'handle:creator'})),`/r/${newToken}/videos?preview=1&q=saved&creator=handle%3Acreator`);
assert.equal(await media.getClientReportMediaUrl(oldToken,videoUrl(oldVideo),db),null,'Excluded original media is no longer authorized');
assert.equal(await media.getClientReportMediaUrl(oldToken,videoUrl(newVideo),db),videoUrl(newVideo));
assert.equal(JSON.stringify(rows),before,'All resolution and download checks preserve both snapshots');

// Explicit approval wins over a newer ordinary rerun in history, without
// altering other windows or the normal issued-link pinning behavior.
rows.push({...structuredClone(original),id:'3723ac34-042b-4fb0-8627-a9874bdc2a02',token:'newer-wrong-rerun',created_at:'2026-11-14T00:00:00Z'});
let result=await history.loadClientReportHistoryResult(db,original);
assert.equal(result.items[0].token,newToken);assert.equal(result.unavailable,false);
rows[1].revoked_at='2026-11-14T00:00:00Z';
result=await history.loadClientReportHistoryResult(db,original);
assert.equal(result.items.length,0);assert.equal(result.unavailable,true);
for(const[name,handler]of [['report-pdf',pdf],['report-csv',csv],['report-videos',videos]]){
  const response=await handler.GET(req(name,oldToken),ctx(oldToken));assert.equal(response.status,503);
  assert.ok(!(await response.text()).includes('Original creator'));
}
await assert.rejects(()=>page.default(pageProps(oldToken)),e=>e.name==='CanonicalReportUnavailableError');
assert.equal((await page.generateMetadata(pageProps(oldToken))).title,'Report · Tempo');
await assert.rejects(()=>media.getClientReportMediaUrl(oldToken,videoUrl(oldVideo),db));

reset();rows[0].revoked_at='2026-11-14T00:00:00Z';
assert.equal((await pdf.GET(req('report-pdf',oldToken),ctx(oldToken))).status,404);
assert.equal((await csv.GET(req('report-csv',oldToken),ctx(oldToken))).status,404);
assert.equal(await library.getClientReportVideoLibrary(oldToken),null);
assert.equal(await media.getClientReportMediaUrl(oldToken,videoUrl(oldVideo),db),null);
assert.ok(!reads.some(r=>r.columns.includes('created_by')),'Revoked source never looks up a correction');
reset();rows[1].snapshot.reportCorrection.scope.brandSlug='lemme';
assert.equal((await csv.GET(req('report-csv',oldToken),ctx(oldToken))).status,503,'Cross-brand approval metadata cannot redirect');
reset();rows.pop();
rendered=await page.default(pageProps(oldToken));assert.equal(rendered.props.children[1].props.notes,'Original creator');
assert.equal((await pdf.GET(req('report-pdf',oldToken),ctx(oldToken))).status,200,'Uncorrected report remains frozen as issued');
reset();
assert.equal((await beacon.POST(req('report-viewed',oldToken),ctx(oldToken))).status,204);
assert.deepEqual(writes,[newId]);assert.equal(rows[0].viewed_at,null,'Old view beacon stamps only the approved target');
reset();rows[0].revoked_at='2026-11-14T00:00:00Z';
assert.equal((await beacon.POST(req('report-viewed',oldToken),ctx(oldToken))).status,204);assert.deepEqual(writes,[]);
reset();rows[1].revoked_at='2026-11-14T00:00:00Z';
assert.equal((await beacon.POST(req('report-viewed',oldToken),ctx(oldToken))).status,204);assert.deepEqual(writes,[]);
reset();fail=true;
assert.equal((await beacon.POST(req('report-viewed',oldToken),ctx(oldToken))).status,204);assert.deepEqual(writes,[]);
console.log('PASS canonical public reports: HTML/PDF/CSV/video redirects, preview/filter preservation, corrected media/history, immutable originals, scope and revocation guards');
