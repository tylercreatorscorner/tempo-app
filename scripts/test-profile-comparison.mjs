import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
let values=[150,100], calls=[];
const source=readFileSync('src/components/creators/performance/profile-history.tsx','utf8');
const exports={};
const modules={
  'react/jsx-runtime':jsx,
  '@/lib/data/creator-performance-history':{getCreatorPerformanceHistory:async(...args)=>{calls.push(args);const gmv=values[calls.length-1];return {status:'ready',points:[{gmv,posts:1}]};}},
  './performance-timeline':{CreatorPerformanceTimeline:()=>null},
  './model':{total:(rows,metric)=>rows.length && rows.every(row=>row[metric]!==null)?rows.reduce((sum,row)=>sum+row[metric],0):null},
};
runInNewContext(ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:key=>modules[key]});
const render=async()=>renderToStaticMarkup(await exports.ProfilePerformanceHistory({creatorId:'fixture',start:'2026-03-01',end:'2026-03-07',brand:'alpha',label:'Alpha',compare:true}));
assert.match(await render(),/\+50.0% GMV/);
assert.equal(calls[1][1],'2026-02-22');assert.equal(calls[1][2],'2026-02-28');assert.equal(calls[1][3],'alpha');
values=[150,null];calls=[];assert.match(await render(),/Comparison unavailable/);
values=[150,0];calls=[];assert.match(await render(),/percentage comparison is not defined/);
console.log('PASS profile comparison: equal prior window, same brand scope, incomplete records and zero baseline');
