import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Exercise actual action handlers with isolated hook state and HTTP responses.
// No hosted requests, report writes, clipboard writes or client messages.
let state=[],index=0,pending,requests=[],failure=false,reloads=0;
let response={token:'fixture-new-token'};
const element=(type,props)=>({type,props});
const dependencies={
  '@/components/ui/interface-icon':{InterfaceIcon:'icon'},
  react:{useState:initial=>{const slot=index++;if(!(slot in state))state[slot]=initial;return [state[slot],value=>{state[slot]=value;}];},useTransition:()=>[false,fn=>{pending=fn();}]},
  'react/jsx-runtime':{jsx:element,jsxs:element,Fragment:'fragment'},
  'lucide-react':Object.fromEntries(['Loader2','Pencil','RefreshCw','Ban','X'].map(name=>[name,name])),
  '@/components/ui/modal-overlay':{ModalOverlay:'overlay'},
  '@/components/ui/button':{Button:'button'},
  '@/components/ui/label':{Label:'label'},
  '@/components/ui/input':{Textarea:'textarea'},
};
const exports={};
runInNewContext(ts.transpileModule(readFileSync('src/app/(admin)/reporting/report-actions.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
  exports,encodeURIComponent,require:name=>{assert.ok(name in dependencies,name);return dependencies[name];},
  fetch:async(url,init)=>{requests.push({url,...init});return {ok:!failure,status:failure?409:200,json:async()=>failure?{error:'Approved figures require review'}:response};},
});
const target={id:'preserved-id',brandName:'Fixture brand',periodLabel:'August',notes:'Original notes',plan:'Original plan',viewedAt:null};
const render=()=>{index=0;return exports.ReportActions({target,onDone:()=>reloads++});};
function nodes(tree){if(tree==null||typeof tree!=='object')return [];if(Array.isArray(tree))return tree.flatMap(nodes);return [tree,...nodes(tree.props?.children)];}
function text(tree){if(tree==null||typeof tree==='boolean')return '';if(typeof tree==='string'||typeof tree==='number')return String(tree);if(Array.isArray(tree))return tree.map(text).join('');return text(tree.props?.children);}
const button=(tree,label)=>{const node=nodes(tree).find(n=>n.type==='button'&&text(n)===label);assert.ok(node,label);return node;};
button(render(),'Create revision').props.onClick();await pending;
let tree=render();
assert.equal(requests[0].url,'/api/client-reports/preserved-id/refresh');
assert.equal(requests[0].method,'POST');assert.equal(reloads,1);
assert.equal(nodes(tree).find(n=>n.type==='a'&&text(n).trim()==='Open new revision').props.href,'/r/fixture-new-token?preview=1');
assert.equal(target.notes,'Original notes');
const currentMessage='The approved report is current. No new revision was created.';
response={token:'approved/current',reused:true};
button(tree,'Create revision').props.onClick();await pending;tree=render();
assert.equal(nodes(tree).find(n=>n.type==='a'&&text(n).trim()==='Open current report').props.href,'/r/approved%2Fcurrent?preview=1');
assert.ok(text(nodes(tree).find(n=>n.props?.role==='status')).includes(currentMessage));
assert.ok(!text(tree).includes('Open new revision'),'Reusing approved figures must not claim a new revision');
assert.equal(reloads,2);
failure=true;button(tree,'Create revision').props.onClick();await pending;tree=render();
assert.equal(nodes(tree).find(n=>n.props?.role==='alert')?.props.children,'Approved figures require review');
assert.ok(!nodes(tree).some(n=>n.type==='a'),'A failed revision cannot leave a stale success link');
assert.equal(reloads,2);
response={token:'current-again',reused:true};
failure=false;button(tree,'Create revision').props.onClick();await pending;tree=render();
assert.ok(text(tree).includes(currentMessage));
// A notes revision following reuse must replace the previous success state.
response={token:'notes-revision'};
failure=false;button(tree,'Revise notes').props.onClick();tree=render();
nodes(tree).find(n=>n.props?.id==='ra-notes').props.onChange({target:{value:'Corrected notes'}});
button(render(),'Save').props.onClick();await pending;tree=render();
assert.equal(requests.at(-1).url,'/api/client-reports/preserved-id');
assert.equal(requests.at(-1).method,'PATCH');
assert.deepEqual(JSON.parse(requests.at(-1).body),{notes:'Corrected notes',plan:'Original plan'});
assert.ok(nodes(tree).some(n=>n.type==='a'&&text(n).trim()==='Open new revision'));
assert.ok(!text(tree).includes(currentMessage),'New notes must not inherit the reused-report message');
assert.ok(!nodes(tree).some(n=>n.props?.role==='dialog'));
assert.equal(reloads,4);

// Exercise SentFeed's actual load and refresh handlers, without network or timers.
const feedState=[];
let feedIndex=0,initialRender=true,feedFailure=false;
let feedResponse={token:'approved/current',reused:true};
const feedEffects=[],feedRequests=[];
const row={id:'original-id',token:'original-token',url:'/r/original-token',brandSlug:'m3',brandName:'M3',periodLabel:'October',createdAt:'2026-11-12T00:00:00Z',createdBy:null,viewedAt:null,revokedAt:null,refreshedAt:null};
const feedDependencies={
  ...dependencies,
  react:{
    useState:initial=>{const slot=feedIndex++;if(!(slot in feedState))feedState[slot]=initial;return [feedState[slot],value=>{feedState[slot]=typeof value==='function'?value(feedState[slot]):value;}];},
    useRef:initial=>({current:initial}),
    useCallback:fn=>fn,
    useEffect:fn=>{if(initialRender)feedEffects.push(fn);},
  },
  'lucide-react':Object.fromEntries(['AlertCircle','Ban','Check','Clipboard','ExternalLink','Loader2','RotateCw','Send','MoreHorizontal'].map(name=>[name,name])),
  'radix-ui':{DropdownMenu:{}},
  '@/lib/utils':{cn:(...classes)=>classes.filter(Boolean).join(' ')},
  '@/hooks/use-brand-meta':{useBrandMeta:()=>({label:slug=>slug})},
  '@/hooks/use-delayed-flag':{useDelayedFlag:value=>value},
  '@/components/ui/search-input':{SearchInput:'search'},
  '@/components/ui/badge':{Badge:'badge'},
  '@/components/ui/table':Object.fromEntries(['TableCard','Table','THead','TBody','TR','TH','TD'].map(name=>[name,name])),
  '@/components/ui/table-load-bar':{TableLoadBar:'load-bar'},
  '@/components/ui/page-skeletons':{TableSkeleton:'skeleton'},
  '@/components/ui/empty-state':{EmptyState:'empty-state'},
  '@/components/creators/brand-identity':{BrandIdentity:'brand'},
};
const feedExports={};
runInNewContext(ts.transpileModule(readFileSync('src/app/(admin)/reporting/sent-feed.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
  exports:feedExports,encodeURIComponent,setTimeout:()=>1,clearTimeout:()=>{},
  require:name=>{assert.ok(name in feedDependencies,name);return feedDependencies[name];},
  fetch:async(url,init)=>{
    feedRequests.push({url,...init});
    if(url.startsWith('/api/client-reports?page='))return {ok:true,json:async()=>({reports:[row],total:1})};
    assert.equal(url,'/api/client-reports/original-id/refresh');assert.equal(init.method,'POST');
    return {ok:!feedFailure,status:feedFailure?409:200,json:async()=>feedFailure?{error:'Approved figures require review'}:feedResponse};
  },
});
const renderFeed=()=>{feedIndex=0;const result=feedExports.SentFeed({refreshKey:0});initialRender=false;return result;};
renderFeed();for(const effect of feedEffects)effect();await new Promise(resolve=>setImmediate(resolve));
const refreshFeed=async()=>{
  const item=nodes(renderFeed()).find(n=>typeof n.props?.onRefresh==='function');
  assert.ok(item,'Report library loaded its saved report');
  await item.props.onRefresh(item.props.item);
  return renderFeed();
};
let feedTree=await refreshFeed();
assert.equal(nodes(feedTree).find(n=>n.type==='a'&&text(n).trim()==='Open current report').props.href,'/r/approved%2Fcurrent?preview=1');
assert.ok(text(feedTree).includes(currentMessage));
assert.ok(!text(feedTree).includes('New revision created.'));
assert.ok(!text(feedTree).includes('Open new revision'));
feedFailure=true;feedTree=await refreshFeed();
assert.ok(text(feedTree).includes('Approved figures require review'));
assert.ok(!text(feedTree).includes(currentMessage));
assert.ok(!nodes(feedTree).some(n=>n.type==='a'),'Failed library action clears its stale success link');
feedFailure=false;feedResponse={token:'fresh-token'};feedTree=await refreshFeed();
assert.equal(nodes(feedTree).find(n=>n.type==='a'&&text(n).trim()==='Open new revision').props.href,'/r/fresh-token?preview=1');
assert.ok(text(feedTree).includes('New revision created. The previous link is unchanged.'));
assert.ok(!text(feedTree).includes(currentMessage));
feedResponse={token:'strict-flag',reused:'true'};feedTree=await refreshFeed();
assert.ok(text(feedTree).includes('New revision created.'),'Only boolean reused=true means no revision was created');
assert.equal(feedRequests.filter(r=>r.method==='POST').length,4);
assert.equal(row.token,'original-token');
console.log('PASS report revision actions and library: approved reuse is explicit, new figures/notes remain new, original inputs preserved, failures clear stale success');
