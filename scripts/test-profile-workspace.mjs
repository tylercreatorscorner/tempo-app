import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

const creatorId = '11111111-1111-4111-8111-111111111111';
let canViewCreatorCost = true, editProps, postingBrand;
const profile = { id:creatorId, real_name:'Fixture Creator', status:'active', accounts:[{tiktok_username:'fixture',is_primary:true}], brands:['alpha','beta'], brandsWithData:['alpha','beta'] };
const primary = {managedId:1,brand:'alpha',retainer:7419,monthlyPostRequirement:10,retainerStartDate:'2026-01-01'};
const other = {managedId:2,brand:'beta',retainer:4019,monthlyPostRequirement:4,retainerStartDate:'2026-02-01'};
const nil = () => null;
const data = {
  getCreatorProfile:async()=>profile, getCreatorIdByHandle:async()=>creatorId,
  getCreatorContracts:async()=>({primary,others:[other]}),
  getCreatorBrandRelationship:async()=>({role:'creator',status:'active'}),
  getCreatorSummary:async()=>({total_gmv:123,total_orders:8,total_videos:2}),
  getCreatorVideos:async()=>[], getCreatorTopContent:async()=>[], getCreatorAccountBreakdown:async()=>[],
  getCreatorBrandBreakdown:async()=>[{brand:'alpha',gmv:80,videos:1},{brand:'beta',gmv:43,videos:1}],
  getCreatorLifetimeStats:async()=>({total_gmv:999,total_orders:50,first_active_date:'2026-01-01'}),
  getCreatorChangeHistory:async(ids,cost)=>{assert.deepEqual([...ids],[2]);assert.equal(cost,canViewCreatorCost);return [];},
  getPostsPublishedThisMonth:async(_,brand)=>{postingBrand=brand;return 3;},
};
const modules = {
  '@/components/creators/agreement-workspace':{AgreementWorkspace:nil},
  '@/components/creators/agreement-preview':{AgreementPreview:nil},
  '@/lib/auth/permissions':{can:()=>true},
  '@/components/creators/coaching-brief':{CoachingBrief:nil},
  '@/components/creators/profile-video-grid':{ProfileVideoGrid:nil},
  '@/components/creators/performance/profile-headline-metrics':{ProfileHeadlineMetrics:({summary})=>React.createElement('span',null,'$'+summary.total_gmv)},
  '@/components/creators/brand-identity':{BrandIdentity:({label})=>React.createElement('span',null,label)},
  '@/components/video/video-cover':{VideoCover:nil},
  react:React, 'react/jsx-runtime':jsx, 'next/link':({children,...props})=>React.createElement('a',props,children),
  'next/navigation':{notFound:()=>{throw Error('404');},redirect:()=>{throw Error('redirect');}},
  'lucide-react':{ArrowLeft:nil,ExternalLink:nil},
  '@/components/creators/creator-portrait':{CreatorPortrait:nil},
  '@/components/creators/creator-edit-panel':{CreatorEditButton:props=>{editProps=props.creator;return null;}},
  '@/components/creators/creator-change-history':{CreatorChangeHistory:nil},
  '@/components/creators/profile-sections':{ProfileSectionLink:({children})=>React.createElement('button',null,children),ProfileSections:({sections})=>React.createElement(React.Fragment,null,...sections.map(s=>s.content))},
  '@/components/creators/relationship-history':{RelationshipHistory:nil},
  '@/components/creators/performance/profile-history':{ProfilePerformanceHistory:nil},
  '@/components/creators/brand-filter':{BrandFilter:nil},
  '@/components/dashboard/date-range-picker':{DateRangePicker:nil},
  '@/components/video/video-title-button':{VideoTitleButton:nil},
  '@/components/layout/breadcrumb-context':{SetBreadcrumb:nil},
  '@/lib/auth/workspace-scope':{getWorkspaceScope:async()=>({canViewCreatorCost})},
  '@/lib/data/data-anchor':{getDataAnchorDate:async()=> '2026-09-11'},
  '@/lib/data/date-utils':{resolveDateRange:()=>({startDate:'2026-09-05',endDate:'2026-09-11',lagDays:0})},
  '@/lib/data/brand-registry':{getBrandRegistry:async()=>({}),activeBrandSlugs:()=>['alpha','beta'],brandLabel:(_,brand)=>brand,brandColor:()=> '#7439d7',slugToUuid:(_,brand)=>brand+'-id'},
  '@/lib/utils/format':{formatCurrency:n=>'$'+n,formatNumber:n=>String(n)},
  '@/lib/data/creator-profile':data,
  '@/components/creators/profile-workspace.module.css':new Proxy({},{get:(_,key)=>String(key)}),
};
const exports = {};
runInNewContext(ts.transpileModule(readFileSync('src/app/(admin)/creators/[name]/page.tsx','utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},
}).outputText,{exports,process:{env:{}},URLSearchParams,require:name=>{assert.ok(name in modules,name);return modules[name];}});
const render = async()=>renderToStaticMarkup(await exports.default({params:Promise.resolve({name:creatorId}),searchParams:Promise.resolve({brand:'beta'})}));
let html=await render();
assert.ok(html.includes('$4019'));
assert.ok(!html.includes('Across authorized brands') && !html.includes('$999') && !html.includes('$7419'),'Selected brand view excludes cross-brand performance and terms');
assert.equal(postingBrand,'beta','Posting count must follow selected agreement, not highest retainer');
assert.equal(editProps.brandId,'beta-id','Editing stays anchored to the selected brand');
assert.ok(html.includes('Not assessed') && html.includes('never projected backward'));
canViewCreatorCost=false; html=await render();
assert.ok(!html.includes('$4019') && !html.includes('$7419'),'No fees in server output for finance-blind users, including inactive sections');
assert.ok(html.includes('$123'),'Performance remains visible independently of cost permission');
console.log('PASS profile workspace: selected contract/posting/edit scope, server-side cost gating across sections, honest agreement and reliability states');


