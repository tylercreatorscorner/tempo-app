import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Exercise actual action handlers with isolated hook state and HTTP responses.
// No hosted requests, report writes, clipboard writes or client messages.
let state=[],index=0,pending,requests=[],failure=false,reloads=0;
const element=(type,props)=>({type,props});
const dependencies={
  react:{useState:initial=>{const slot=index++;if(!(slot in state))state[slot]=initial;return [state[slot],value=>{state[slot]=value;}];},useTransition:()=>[false,fn=>{pending=fn();}]},
  'react/jsx-runtime':{jsx:element,jsxs:element,Fragment:'fragment'},
  'lucide-react':Object.fromEntries(['Loader2','Pencil','RefreshCw','Ban','X'].map(name=>[name,name])),
  '@/components/ui/button':{Button:'button'},
  '@/components/ui/label':{Label:'label'},
  '@/components/ui/input':{Textarea:'textarea'},
};
const exports={};
runInNewContext(ts.transpileModule(readFileSync('src/app/(admin)/reporting/report-actions.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
  exports,encodeURIComponent,require:name=>{assert.ok(name in dependencies,name);return dependencies[name];},
  fetch:async(url,init)=>{requests.push({url,...init});return {ok:!failure,status:failure?409:200,json:async()=>failure?{error:'Approved figures require review'}:{token:'fixture-new-token'}};},
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
assert.equal(nodes(tree).find(n=>n.type==='a'&&text(n)==='Open new revision ↗').props.href,'/r/fixture-new-token?preview=1');
assert.equal(target.notes,'Original notes');
failure=true;button(tree,'Create revision').props.onClick();await pending;tree=render();
assert.equal(nodes(tree).find(n=>n.props?.role==='alert')?.props.children,'Approved figures require review');
assert.ok(!nodes(tree).some(n=>n.type==='a'),'A failed revision cannot leave a stale success link');
assert.equal(reloads,1);
failure=false;button(tree,'Revise notes').props.onClick();tree=render();
nodes(tree).find(n=>n.props?.id==='ra-notes').props.onChange({target:{value:'Corrected notes'}});
button(render(),'Save').props.onClick();await pending;tree=render();
assert.equal(requests.at(-1).url,'/api/client-reports/preserved-id');
assert.equal(requests.at(-1).method,'PATCH');
assert.deepEqual(JSON.parse(requests.at(-1).body),{notes:'Corrected notes',plan:'Original plan'});
assert.ok(nodes(tree).some(n=>n.type==='a'&&text(n)==='Open new revision ↗'));
assert.ok(!nodes(tree).some(n=>n.props?.role==='dialog'));
assert.equal(reloads,2);
console.log('PASS report revision actions: new link surfaced for figures and copy, original inputs preserved, failed actions visible without modal and stale success removed');
