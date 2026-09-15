import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
let missing=false, zero=false, calls=[];
const modules={
  'react/jsx-runtime':jsx,
  '../profile-workspace.module.css':new Proxy({},{get:(_,key)=>String(key)}),
  '@/lib/data/creator-performance-history':{getCreatorPerformanceHistory:async(id,start,end,brand)=>{calls.push({id,start,end,brand});return {status:'ready',points:[{gmv:missing?null:(start==='2026-03-01'?150:zero?0:100),posts:missing?null:(start==='2026-03-01'?6:zero?0:3)}]};}},
  '@/lib/data/creator-profile':{getCreatorSummary:async()=>({total_orders:zero?0:5})},
  './model':{total:(rows,key)=>rows.some(row=>row[key]===null)?null:rows.reduce((s,row)=>s+row[key],0)},
};
const exports={};
runInNewContext(ts.transpileModule(readFileSync('src/components/creators/performance/profile-headline-metrics.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:key=>modules[key]});
const render=async()=>renderToStaticMarkup(await exports.ProfileHeadlineMetrics({creatorId:'fixture',start:'2026-03-01',end:'2026-03-07',brand:'alpha',label:'Alpha',summary:{total_gmv:150,total_orders:10,total_videos:4}}));
let html=await render();
assert.match(html,/\+\$50/);assert.match(html,/50.0%/);assert.match(html,/\+5/);assert.match(html,/\+3/);
assert.equal(calls[1].start,'2026-02-22');assert.equal(calls[1].end,'2026-02-28');assert.ok(calls.every(call=>call.brand==='alpha'));
missing=true;html=await render();assert.match(html,/Comparison unavailable/);assert.ok(!html.includes('100.0%'));
missing=false;zero=true;html=await render();assert.match(html,/no percentage for a zero baseline/);assert.ok(!html.includes('Infinity'));
console.log('PASS headline metrics: scoped equal periods, GMV/order/post deltas, missing coverage and zero baselines');
