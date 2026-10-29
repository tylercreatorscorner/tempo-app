import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { NextRequest, NextResponse } from 'next/server.js';
import ts from 'typescript';
const own={userId:'actor',tenantId:'a',role:'admin',canViewFinance:true,brandScope:{kind:'all'},permissions:new Set(['reporting:read','reporting:write'])};
let scope=own, rpcCalls=[], writes=0, agencyPortfolio={}, clientPublishedCounts={}, publishedVideoFailure=false;
const publishedVideoCalls=[];
let publishedVideoResult={total:0,priorTotal:0,storeTotal:0,priorStoreTotal:0,currentComplete:false,priorComplete:false,brands:[]};
const brand=(id,tenant,extra={})=>({id,tenant_id:tenant,slug:id,name:id,parent_brand_id:null,is_archived:false,is_umbrella:false,...extra});
const tables={brands_v2:[brand('own','a'),brand('foreign','b')], client_reports:[
 {id:'our-report',tenant_id:'a',brand_slug:'own',token:'our-token',notes:'original',plan:'keep',period_start:'2026-08-01',period_end:'2026-08-31',revoked_at:null},
 {id:'their-report',tenant_id:'b',brand_slug:'own',token:'secret-token',notes:'secret',plan:'secret',revoked_at:null},
],report_log:[{id:'their-log',tenant_id:'b',brand_slug:'own'}]};
function from(table){let filters=[],limit=null,offset=0,patch=null,insert=null;const q={select:()=>q,order:()=>q,
 eq:(k,v)=>{filters.push(r=>r[k]===v);return q;},in:(k,v)=>{filters.push(r=>v.includes(r[k]));return q;},limit:n=>{limit=n;return q;},
 range:(start,end)=>{offset=start;limit=end-start+1;return q;},
 contains:(k,v)=>{filters.push(r=>v.every(item=>(r[k]??[]).includes(item)));return q;},
 or:expression=>{const terms=expression.split(',').map(term=>{const [column,,...pattern]=term.split('.');return [column,pattern.join('.').replace(/^%|%$/g,'').toLowerCase()];});filters.push(row=>terms.some(([column,value])=>String(row[column]??'').toLowerCase().includes(value)));return q;},
 update:v=>{patch=v;return q;},insert:v=>{insert=v;return q;},like:()=>q,
 maybeSingle:()=>run(true),single:()=>run(true),then:(r,j)=>Promise.resolve(run(false)).then(r,j)};
 function run(single){if(insert){writes++;const row={id:'new-report',token:'new-token',...insert};(tables[table]??=[]).push(row);return {data:row,error:null};}
 let data=(tables[table]??[]).filter(r=>filters.every(f=>f(r)));const count=data.length;if(limit)data=data.slice(offset,offset+limit);
 if(patch){writes+=data.length;data.forEach(r=>Object.assign(r,patch));}return {data:single?data[0]??null:data,error:null,count};}return q;}
const admin={from,rpc:async(name,args)=>{rpcCalls.push({name,args});return {data:name==='get_agency_portfolio_workspace'?agencyPortfolio:name==='get_brand_client_report_counts_workspace'?clientPublishedCounts:['get_brand_roster_weekly_workspace','get_agency_coverage_gaps_workspace','get_agency_roster_quality_workspace'].includes(name)?[]:name==='get_brand_client_report_granular_workspace'?null:{},error:null};},auth:{getUser:async()=>({data:{user:{email:'fixture@invalid'}}})}};
const deps={'next/server':{NextRequest,NextResponse},'@/lib/supabase/server':{createAdminClient:async()=>admin,createClient:async()=>admin},
 '@/lib/auth/workspace-scope':{getWorkspaceScope:async()=>scope,isBrandInScope:(s,b)=>s.brandScope.kind==='all'||s.brandScope.brandIds.includes(b.id)||s.brandScope.brandSlugs.includes(b.slug)}};
function load(file){const exports={};runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,console,Set,Map,Date,URL,Uint8Array,process:{env:{}},require:name=>{let key=name;if(name.startsWith('./')&&file.includes('/auth/'))key='@/lib/auth/'+name.slice(2);assert.ok(key in deps,key);return deps[key];}});return exports;}
deps['@/lib/auth/permissions']=load('src/lib/auth/permissions.ts');
deps['@/lib/data/brand-registry-core']=load('src/lib/data/brand-registry-core.ts');deps['@/lib/data/brand-registry']=deps['@/lib/data/brand-registry-core'];
deps['@/lib/auth/client-report-access']=load('src/lib/auth/client-report-access.ts');
deps['@/lib/agreements/renewals']={ensureAgreementPeriods:async()=>{}};
deps['./reporting-exclusions']=load('src/lib/data/reporting-exclusions.ts');
deps['@/lib/data/agency-period']=load('src/lib/data/agency-period.ts');
deps['@/lib/data/published-videos']={getPublishedVideoCounts:async args=>{publishedVideoCalls.push(args);if(publishedVideoFailure)throw new Error('fixture video count unavailable');return publishedVideoResult;}};
deps['@/lib/data/brand-client-report']=load('src/lib/data/brand-client-report.ts');
deps['@/lib/data/client-reports']=load('src/lib/data/client-reports.ts');
deps['@/lib/data/agency-report']=load('src/lib/data/agency-report.ts');
const outbox=load('src/app/api/client-reports/route.ts'),edit=load('src/app/api/client-reports/[id]/route.ts'),
 revoke=load('src/app/api/client-reports/[id]/revoke/route.ts'),refresh=load('src/app/api/client-reports/[id]/refresh/route.ts'),
 preview=load('src/app/api/client-reports/preview/route.ts'),log=load('src/app/api/report-log/route.ts'),
 overview=load('src/app/api/reporting/overview/route.ts'),agency=load('src/app/api/agency-reports/route.ts');
const req=(body,method='POST')=>new NextRequest('https://fixture.invalid/api/client-reports',{method,...(body?{body:JSON.stringify(body)}:{})});
const ctx=id=>({params:Promise.resolve({id})});
assert.equal((await outbox.GET(req(null,'GET'))).status,200);
assert.deepEqual((await (await outbox.GET(req(null,'GET'))).json()).reports.map(r=>r.token),['our-token']);
tables.client_reports.push({id:'revision-fixture',tenant_id:'a',brand_slug:'own',token:'revision-token',revision:{previousReportId:'our-report',privateNote:'do not return'},snapshot:{private:'never return'}});
let revisionResult=(await (await outbox.GET(req(null,'GET'))).json()).reports.find(r=>r.id==='revision-fixture');
assert.equal(revisionResult.isRevision,true);assert.equal(revisionResult.previousReportId,'our-report');
assert.ok(!JSON.stringify(revisionResult).includes('private'));
tables.client_reports.at(-1).revision.previousReportId='their-report';
revisionResult=(await (await outbox.GET(req(null,'GET'))).json()).reports.find(r=>r.id==='revision-fixture');
assert.equal(revisionResult.previousReportId,null,'Foreign report history never becomes a link');
tables.client_reports.at(-1).revision.previousReportId='revision-fixture';
revisionResult=(await (await outbox.GET(req(null,'GET'))).json()).reports.find(r=>r.id==='revision-fixture');
assert.equal(revisionResult.previousReportId,null,'No self-reference');
tables.client_reports.pop();
assert.equal((await (await log.GET()).json()).entries.length,0);
for(const [route,method] of [[edit,'PATCH'],[revoke,'POST'],[refresh,'POST']]) assert.equal((await route[method](req({notes:'attack'},method),ctx('their-report'))).status,404);
assert.equal(writes,0);assert.equal(rpcCalls.length,0);
for(const denied of [{...own,permissions:new Set()},{...own,permissions:new Set(['reporting:read'])},{...own,impersonating:true}]) {
 scope=denied;assert.equal((await edit.PATCH(req({notes:'attack'},'PATCH'),ctx('our-report'))).status,403);
 assert.equal((await outbox.POST(req({brand:'own',period:'7d'}))).status,403);
 assert.equal((await agency.POST(req({start:'2026-08-01',end:'2026-08-31'}))).status,403);
}
scope=own;assert.equal(writes,0);
assert.equal((await preview.POST(req({brand:'foreign',period:'7d'}))).status,403);assert.equal(rpcCalls.length,0);
scope={...own,brandScope:{kind:'scoped',brandIds:['own'],brandSlugs:['own']}};
assert.equal((await outbox.POST(req({brand:'all',period:'7d'}))).status,403);
assert.equal((await agency.POST(req({start:'2026-08-01',end:'2026-08-31'}))).status,403);
scope=own;
assert.equal((await edit.PATCH(req({notes:'changed'},'PATCH'),ctx('our-report'))).status,200);
assert.equal(tables.client_reports[0].notes,'original');assert.equal(tables.client_reports.at(-1).notes,'changed');assert.equal(tables.client_reports.at(-1).plan,'keep');
const originalToken=tables.client_reports[0].token;
const originalSnapshot=JSON.stringify(tables.client_reports[0].snapshot);
const originalCount=tables.client_reports.length;
assert.equal((await refresh.POST(req(null),ctx('our-report'))).status,200);
assert.equal(tables.client_reports.length,originalCount+1);assert.equal(JSON.stringify(tables.client_reports[0].snapshot),originalSnapshot);assert.equal(tables.client_reports.at(-1).snapshot.revision.previousReportId,'our-report');
assert.equal(tables.client_reports[0].token,originalToken);assert.equal(tables.client_reports[0].notes,'original');
assert.ok(rpcCalls.length>5);assert.ok(rpcCalls.every(c=>c.name.endsWith('_workspace')&&c.args.p_tenant_id==='a'));
rpcCalls=[];assert.equal((await outbox.POST(req({brand:'all',period:'7d'}))).status,200);
assert.equal(tables.client_reports.at(-1).tenant_id,'a');
for(const c of rpcCalls)if('p_data_slugs' in c.args)assert.deepEqual(Array.from(c.args.p_data_slugs),['own']);
tables.brands_v2.push(brand('umbrella','a',{is_umbrella:true}),brand('store','a',{parent_brand_id:'umbrella'}));
rpcCalls=[];assert.equal((await preview.POST(req({brand:'store',period:'7d'}))).status,200);
assert.ok(rpcCalls.some(c=>c.args.p_roster_slugs?.includes('umbrella')));
assert.ok(rpcCalls.filter(c=>'p_data_slugs' in c.args).every(c=>c.args.p_data_slugs.length===1&&c.args.p_data_slugs[0]==='store'));
scope={...own,brandScope:{kind:'scoped',brandIds:['umbrella'],brandSlugs:['umbrella']}};
rpcCalls=[];assert.equal((await preview.POST(req({brand:'umbrella',period:'7d'}))).status,200);
assert.ok(rpcCalls.filter(c=>'p_data_slugs' in c.args).every(c=>c.args.p_data_slugs.length===1&&c.args.p_data_slugs[0]==='store'));
scope={...own,brandScope:{kind:'scoped',brandIds:['store'],brandSlugs:['store']}};
assert.equal((await preview.POST(req({brand:'store',period:'7d'}))).status,200);
assert.equal((await preview.POST(req({brand:'umbrella',period:'7d'}))).status,403);
tables.brands_v2.push(brand('sibling','a',{parent_brand_id:'umbrella'}));
assert.equal((await preview.POST(req({brand:'sibling',period:'7d'}))).status,403);
scope=own;
const board=await (await overview.GET()).json();assert.ok(!JSON.stringify(board).includes('secret-token'));
deps['@react-pdf/renderer']={renderToBuffer:async()=>new Uint8Array([37,80,68,70])};
let logoSeen=null;
let reconciliationPdfSeen=false;
deps['@/lib/pdf/report-reconciliation-pdf']={ReportReconciliationPDF:props=>{reconciliationPdfSeen=true;return props;}};
deps['@/lib/pdf/brand-client-report-pdf']={BrandClientReportPDF:props=>props};
deps['@/lib/brand-logo']={brandLogoDataUri:async url=>{logoSeen=url;return null;}};
deps['react/jsx-runtime']={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'};
deps['./report-view']={ReportView:'report'};deps['./view-beacon']={ViewBeacon:'beacon'};
const csv=load('src/app/api/report-csv/[token]/route.ts'),pdf=load('src/app/api/report-pdf/[token]/route.ts'),page=load('src/app/r/[token]/page.tsx');
const tokenCtx={params:Promise.resolve({token:'our-token'})};
tables.brands_v2[0].logo_url='our-logo';tables.brands_v2.unshift(brand('collision','b',{slug:'own',logo_url:'foreign-logo'}));
tables.client_reports[0].snapshot=structuredClone(tables.client_reports.find(r=>r.snapshot?.revision && r.snapshot?.report)?.snapshot);
tables.client_reports[0].snapshot.report.granular={creators:[{name:'Frozen creator',handles:['frozen'],retainer:10,gmv:123,orders:1}]};
rpcCalls=[];scope=null;
assert.equal((await csv.GET(req(null,'GET'),tokenCtx)).status,200);
assert.equal((await pdf.GET(req(null,'GET'),tokenCtx)).status,200);assert.equal(logoSeen,'our-logo');
const publicView=await page.default({...tokenCtx,searchParams:Promise.resolve({preview:'1'})});
assert.equal(publicView.props.children[1].props.logoUrl,'our-logo');
assert.equal(publicView.props.children[1].props.report.granular.creators[0].gmv,123);
assert.equal(rpcCalls.length,0,'Public token readers must never regenerate data');
const frozenRow=tables.client_reports[0].snapshot.report.granular.creators[0];
frozenRow.agreement={periodStart:'2026-07-24',periodEnd:'2026-08-31',quota:30,revision:2,reportPeriodComparable:false};
frozenRow.quota=30;
frozenRow.ccStartDate='2026-07-20';
const agreementCsv=await (await csv.GET(req(null,'GET'),tokenCtx)).text();
assert.ok(agreementCsv.includes('Retainer rate,Retainer period,Agreed posts,Post commitment period,Partnership start date'));
assert.ok(agreementCsv.includes('10.00,Agreement term,30,Agreement term,2026-07-20'));
assert.ok(agreementCsv.includes('Agreement period start,Agreement period end,Agreement revision,Review required'));
assert.ok(agreementCsv.includes('2026-07-24,2026-08-31,2,Agreement period / payment rules'));
delete frozenRow.agreement;
tables.client_reports[0].snapshot.reconciliation={version:1,rows:[{name:'=formula',handle:'creator',agreement:'300 / 30',augustPosts:7,creditedPosts:'7 confirmed',invoice:70,resolution:'Confirmed'}]};
const correctedCsv=await (await csv.GET(req(null,'GET'),tokenCtx)).text();
assert.ok(correctedCsv.includes("'=formula"));assert.ok(correctedCsv.includes('7 confirmed,70'));assert.ok(!correctedCsv.includes('Frozen creator'));
assert.equal((await pdf.GET(req(null,'GET'),tokenCtx)).status,200);assert.equal(reconciliationPdfSeen,true);
scope=own;const writesBefore=writes;rpcCalls=[];
assert.equal((await refresh.POST(req(null),ctx('our-report'))).status,409);
assert.equal(writes,writesBefore);assert.equal(rpcCalls.length,0);
delete tables.client_reports[0].snapshot.reconciliation;

scope=own;
assert.equal((await revoke.POST(req(null),ctx('our-report'))).status,200);
assert.equal((await csv.GET(req(null,'GET'),tokenCtx)).status,404);
assert.equal((await pdf.GET(req(null,'GET'),tokenCtx)).status,404);
const gone=await page.default({...tokenCtx,searchParams:Promise.resolve({})});assert.notEqual(gone.type,'fragment');
assert.equal((await refresh.POST(req(null),ctx('our-report'))).status,409);
assert.equal((await edit.PATCH(req({notes:'again'},'PATCH'),ctx('our-report'))).status,409);
console.log('PASS actual report routes: foreign token/history isolation, foreign ID mutations, capability/view-as/brand denials');
console.log('PASS legitimate corrections create new links and preserve original snapshots/notes, revoked state, tenant-owned creation, all-brand and child-store SQL arguments');



console.log('PASS actual public CSV/PDF/page: anonymous frozen-token reads, tenant-specific live logo, no regeneration, revocation denial');

// Search reaches beyond the legacy 100-row window; counts and page limits are scoped.
const savedScope=scope;
scope={...own,brandScope:{kind:'scoped',brandIds:['own'],brandSlugs:['own']}};
for(let i=0;i<125;i++) tables.client_reports.push({id:`page-${i}`,tenant_id:'a',brand_slug:'own',brand_name:'Pagination fixture',period_label:'August 2026',token:`p-${i}`});
tables.client_reports.push({id:'foreign-match',tenant_id:'b',brand_slug:'own',brand_name:'Pagination fixture',token:'foreign-page'});
tables.client_reports.push({id:'wrong-brand',tenant_id:'a',brand_slug:'other',brand_name:'Pagination fixture',token:'other-page'});
let paged=await (await outbox.GET(new NextRequest('https://fixture.invalid/api/client-reports?page=6&q=Pagination'))).json();
assert.equal(paged.total,125);assert.equal(paged.reports.length,20);assert.ok(paged.reports.every(r=>r.brandSlug==='own'));
paged=await (await outbox.GET(new NextRequest('https://fixture.invalid/api/client-reports?page=7&q=Pagination'))).json();assert.equal(paged.reports.length,5);
assert.equal((await outbox.GET(new NextRequest('https://fixture.invalid/api/client-reports?page=-1'))).status,400);
scope={...own,brandScope:{kind:'scoped',brandIds:[],brandSlugs:[]}};
paged=await (await outbox.GET(new NextRequest('https://fixture.invalid/api/client-reports?page=1'))).json();assert.equal(paged.total,0);assert.equal(paged.reports.length,0);
scope=savedScope;
console.log('PASS library pagination: search beyond 100 rows, full and final pages, invalid pages, tenant/brand-scoped totals');

// Agency snapshots freeze scope-safe, portfolio-unique video counts independently of GMV.
const videoRegistry=deps['@/lib/data/brand-registry-core'].buildRegistry([
 brand('own','a'),brand('umbrella','a',{is_umbrella:true}),
 brand('store','a',{parent_brand_id:'umbrella'}),brand('retired','a',{is_archived:true}),
]);
agencyPortfolio={brands:[{slug:'own',name:'Own',storeGmv:100,rosterGmv:50,priorStoreGmv:90,priorRosterGmv:40},
 {slug:'umbrella',name:'Umbrella',storeGmv:0,rosterGmv:0,priorStoreGmv:0,priorRosterGmv:0}],totals:{storeGmv:100,rosterGmv:50,priorStoreGmv:90,priorRosterGmv:40}};
publishedVideoResult={total:3,priorTotal:1,storeTotal:5,priorStoreTotal:2,currentComplete:true,priorComplete:true,brands:[
 {slug:'own',count:2,priorCount:1,currentComplete:true,priorComplete:true},
 {slug:'umbrella',count:2,priorCount:0,currentComplete:true,priorComplete:true},
]};
const agencyBuilder=deps['@/lib/data/agency-report'].buildAgencySnapshot;
const videoSnapshot=await agencyBuilder('2026-09-14','2026-09-20',{tenantId:'a',registry:videoRegistry},'weekly');
const countArgs=publishedVideoCalls.at(-1);
assert.equal(countArgs.tenantId,'a');assert.deepEqual(Array.from(countArgs.rosterSlugs),['own','umbrella']);
assert.equal(countArgs.start,'2026-09-14');assert.equal(countArgs.end,'2026-09-20');
assert.equal(countArgs.priorStart,'2026-09-07');assert.equal(countArgs.priorEnd,'2026-09-13');
assert.equal(videoSnapshot.totals.videosPublished,3,'Portfolio count must not sum per-brand counts for shared videos');
assert.equal(videoSnapshot.totals.priorVideosPublished,1);assert.equal(videoSnapshot.totals.videoCoverageComplete,true);
assert.equal(videoSnapshot.brands[1].videosPublished,2,'Zero-GMV publishing activity is preserved');
assert.equal(videoSnapshot.brands[1].videoCoverageComplete,true,'Brand coverage stays independent of GMV');
const frozenVideoSnapshot=JSON.stringify(videoSnapshot);
publishedVideoFailure=true;
const unavailableSnapshot=await agencyBuilder('2026-09-14','2026-09-20',{tenantId:'a',registry:videoRegistry},'weekly');
assert.equal('videosPublished' in unavailableSnapshot.totals,false,'Unavailable counts are omitted, never printed as zero');
assert.equal('videosPublished' in unavailableSnapshot.brands[0],false);
assert.ok(unavailableSnapshot.caveats.some(c=>c.includes('Published-video counts could not be verified')));
assert.equal(JSON.stringify(videoSnapshot),frozenVideoSnapshot,'A later failed read cannot change a frozen snapshot');
publishedVideoFailure=false;

const agencyView=load('src/app/a/[token]/agency-view.tsx');
const elements=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(elements):[node,...elements(node.props?.children)];
const callsBeforeRender=publishedVideoCalls.length;
let rendered=agencyView.AgencyView({snapshot:videoSnapshot});
let videoStat=elements(rendered).find(node=>node.props?.label==='Videos published');
assert.equal(videoStat.props.value,'3');assert.equal(videoStat.props.delta,200);assert.equal(videoStat.props.note,'Recorded managed videos');
videoSnapshot.totals.videoCoverageComplete=false;
rendered=agencyView.AgencyView({snapshot:videoSnapshot});
videoStat=elements(rendered).find(node=>node.props?.label==='Videos published');
assert.equal(videoStat.props.delta,undefined,'Partial video coverage must withhold the relative change');
assert.ok(videoStat.props.note.includes('check coverage'));
const legacyVideoSnapshot=JSON.parse(frozenVideoSnapshot);
for(const row of [legacyVideoSnapshot.totals,...legacyVideoSnapshot.brands]) for(const key of ['videosPublished','priorVideosPublished','videoCoverageComplete','priorVideoCoverageComplete']) delete row[key];
rendered=agencyView.AgencyView({snapshot:legacyVideoSnapshot});
assert.ok(!elements(rendered).some(node=>node.props?.label==='Videos published'),'Older reports omit the new metric');
assert.equal(publishedVideoCalls.length,callsBeforeRender,'Frozen report rendering never fetches fresh counts');
console.log('PASS agency published videos: tenant/active roster scope, matched periods, unique portfolio total, zero-GMV posts, coverage gating, optional legacy fields and immutable frozen rendering');
// Newly built client reports use the same canonical IDs while keeping child-store scope.
clientPublishedCounts={rosterPosts:7,rosterPostsPrior:5,storePosts:9,storePostsPrior:6,signedPeople:1,activePeople:1,activePeoplePrior:1,newlyActivePeople:0};
const clientVideoReport=await deps['@/lib/data/brand-client-report'].getBrandClientReportData('store','Store',{start:'2026-09-14',end:'2026-09-20'},{tenantId:'a',registry:videoRegistry});
const childCountArgs=publishedVideoCalls.at(-1);
assert.deepEqual(Array.from(childCountArgs.dataSlugs),['store']);
assert.deepEqual(Array.from(childCountArgs.rosterSlugs),['store','umbrella'],'Child report retains umbrella membership but only selected store data');
assert.equal(clientVideoReport.creatorsCorner.videos,3);assert.equal(clientVideoReport.totalVideos,5);
assert.equal(clientVideoReport.creatorsCorner.priorVideos,1);assert.equal(clientVideoReport.priorTotalVideos,2);
assert.equal(clientVideoReport.videoCoverageComplete,true);assert.equal(clientVideoReport.priorVideoCoverageComplete,true);
assert.equal(clientVideoReport.totalGmv,0,'Publication counts do not replace financial facts');
publishedVideoFailure=true;
const fallbackVideoReport=await deps['@/lib/data/brand-client-report'].getBrandClientReportData('store','Store',{start:'2026-09-14',end:'2026-09-20'},{tenantId:'a',registry:videoRegistry});
assert.equal(fallbackVideoReport.creatorsCorner.videos,7);assert.equal(fallbackVideoReport.totalVideos,9,'Failed canonical lookup retains available existing counts');
assert.equal(fallbackVideoReport.videoCoverageComplete,false);assert.equal(fallbackVideoReport.priorVideoCoverageComplete,false);
assert.equal(fallbackVideoReport.creatorsCorner.videoChangePct,null);assert.equal(fallbackVideoReport.videoChangePct,null,'Fallback counts must not manufacture comparable changes');
publishedVideoFailure=false;
console.log('PASS new client report publication counts: canonical IDs, selected child data, umbrella membership, financial totals unchanged and unavailable coverage fallback');
// Web report rendering must not revive a percentage or absolute change from partial counts.
deps['@/components/ui/interface-icon']={InterfaceIcon:'interface-icon'};
deps['./reconciliation-view']={ReconciliationView:'reconciliation'};
deps['@/lib/data/delivered-spend']=load('src/lib/data/delivered-spend.ts');
deps['./creator-rows']={PaginatedCreatorRows:'creator-rows'};
const actualClientView=load('src/app/r/[token]/report-view.tsx');
const renderClientVideo=report=>actualClientView.ReportView({token:'frozen-test',report,brandName:'Store',periodLabel:'September 14-20',notes:null,plan:null,reportType:'weekly',snapshot:{v:1,generatedAt:'2026-09-21T00:00:00Z',report,views:null,priorViews:null,videoViews:{},weekly:[],lifetime:{gmv:0,bestWeek:null,firstDate:null,videos:null}}});
let clientVideoStat=elements(renderClientVideo(fallbackVideoReport)).find(node=>node.props?.label==='Videos published');
assert.equal(clientVideoStat.props.comparisonAvailable,false);assert.equal(clientVideoStat.props.pct,undefined);assert.equal(clientVideoStat.props.abs,null);
assert.ok(clientVideoStat.props.note.includes('check coverage'));
const legacyClientVideoReport={...clientVideoReport};delete legacyClientVideoReport.videoCoverageComplete;delete legacyClientVideoReport.priorVideoCoverageComplete;
clientVideoStat=elements(renderClientVideo(legacyClientVideoReport)).find(node=>node.props?.label==='Videos published');
assert.equal(clientVideoStat.props.comparisonAvailable,true);assert.equal(clientVideoStat.props.pct,200,'Legacy snapshots keep their stored comparison behavior');
console.log('PASS client frozen renderer: partial count differences stay withheld and legacy snapshots retain their existing comparison');