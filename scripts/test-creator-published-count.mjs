import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
class FixedDate extends Date {constructor(...args){super(...(args.length?args:['2026-09-18T12:00:00Z']));}}
const rows=[{video_id:'old',post_date:'2026-08-14',report_date:'2026-09-15',brand_id:'alpha',tiktok_username:'creator'},...Array.from({length:1001},()=>({video_id:'new',post_date:'2026-09-03',report_date:'2026-09-15',brand_id:'alpha',tiktok_username:'creator'})),{video_id:'today',post_date:'2026-09-18T14:00:00',brand_id:'alpha',tiktok_username:'creator'},{video_id:'future',post_date:'2026-09-19',brand_id:'alpha',tiktok_username:'creator'},{video_id:'other',post_date:'2026-09-03',brand_id:'beta',tiktok_username:'creator'},{video_id:'someone',post_date:'2026-09-03',brand_id:'alpha',tiktok_username:'other'},{video_id:'unknown',post_date:null,brand_id:'alpha',tiktok_username:'creator'}];
let pages=0,fail=false;
const client={from:table=>{assert.equal(table,'daily_video_product_stats');const filters=[];let start=0,end=0;const q={select:()=>q,range:(a,b)=>{start=a;end=b;return q;},in:(k,v)=>{filters.push(r=>v.includes(r[k]));return q;},gte:(k,v)=>{assert.equal(k,'post_date');filters.push(r=>r[k]!==null&&r[k]>=v);return q;},lte:(k,v)=>{assert.equal(k,'post_date');filters.push(r=>r[k]!==null&&r[k]<=v);return q;},then:(ok,no)=>{pages++;return Promise.resolve(fail?{data:null,error:Error('fixture fail')}:{data:rows.filter(r=>filters.every(f=>f(r))).slice(start,end+1),error:null}).then(ok,no);}};return q;}};
const deps={react:{cache:f=>f},'@/lib/agreements/roster-terms':{},'@/lib/supabase/server':{createAdminClient:async()=>client},'@/lib/data/brand-registry':{getBrandRegistry:async()=>({}),resolveUuids:(_,slug)=>slug?[slug]:null},'@/lib/utils/format':{}};
const api={};runInNewContext(ts.transpileModule(readFileSync('src/lib/data/creator-portal.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api,Date:FixedDate,require:n=>{assert.ok(n in deps,n);return deps[n];}});
assert.equal(await api.getMonthVideoCount(['creator'],'alpha'),2,'Exclude old earning videos, future/unknown dates, other brands/creators; deduplicate repeats');assert.equal(pages,2,'Read beyond the first page');
fail=true;await assert.rejects(api.getMonthVideoCount(['creator'],'alpha'),/fixture fail/);
console.log('PASS creator publication counts: post date not sales date, current-day timestamps, exact brand/handle scope, pagination, deduplication and unavailable reads');
