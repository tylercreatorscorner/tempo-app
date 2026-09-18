import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
let slots=[],index=0,effects=[],dirty=false,requests=[],resolvePreview,reloads=0;
const node=(type,props)=>({type,props});
const hooks={
 useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;dirty=true;}];},
 useRef(value){const i=index++;return slots[i]??(slots[i]={current:value});},
 useMemo(fn){const i=index++;return slots[i]??(slots[i]=fn());},
 useEffect(fn,deps){const i=index++;if(!slots[i]||deps.some((v,n)=>v!==slots[i][n])){slots[i]=deps;effects.push(fn);}},
};
const dependencies={react:hooks,'react/jsx-runtime':{jsx:node,jsxs:node,Fragment:'fragment'},
 'lucide-react':Object.fromEntries(['Check','Clipboard','Link2','Loader2','Wand2','ExternalLink'].map(x=>[x,x])),
 '@/lib/utils/format':{formatCurrency:n=>String(n)},
 '@/components/ui/card':{Card:'card'},'@/components/ui/button':{Button:'button'},
 '@/components/ui/choice-menu':{ChoiceMenu:'choice'},'@/components/creators/brand-identity':{BrandIdentity:'identity'},
 '@/components/ui/select':{Select:'select'},'@/components/ui/input':{Input:'input',Textarea:'textarea'},
 '@/components/ui/label':{Label:'label'},'@/components/ui/segmented':{SegmentedControl:'segmented'},
 './use-report-brands':{useBrandSelect:()=>({brand:'fixture',setBrand(){},options:[],error:false}),BrandListWarning:'warning'}};
const exports={};
runInNewContext(ts.transpileModule(readFileSync('src/app/(admin)/reporting/create-panel.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>{assert.ok(name in dependencies,name);return dependencies[name];},Date,Number,Error,setTimeout:()=>0,clearTimeout(){},navigator:{clipboard:{writeText:async()=>{}}},fetch:async(url,init)=>{requests.push({url,body:JSON.parse(init.body)});if(url.endsWith('/preview'))return new Promise(resolve=>{resolvePreview=()=>resolve({ok:true,json:async()=>({periodLabel:'Fixture period',headline:{gmv:100},draftNotes:'Fixture notes'})});});return {ok:true,json:async()=>({url:'https://example.invalid/r/fixture'})};}});
const nodes=t=>!t||typeof t!=='object'?[]:Array.isArray(t)?t.flatMap(nodes):[t,...nodes(t.props?.children)];
const text=t=>t==null||typeof t==='boolean'?'':typeof t!=='object'?String(t):Array.isArray(t)?t.map(text).join(''):text(t.props?.children);
const form=nodes(exports.CreatePanel({lockedBrand:'fixture',lockedBrandName:'Fixture',onSent:()=>reloads++})).find(n=>typeof n.type==='function');
function render(){let tree;do{dirty=false;index=0;effects=[];tree=form.type(form.props);const pending=effects;effects=[];pending.forEach(fn=>fn());}while(dirty);return tree;}
const find=(tree,type,label)=>{const n=nodes(tree).find(n=>n.type===type&&(text(n)===label||n.props.ariaLabel===label||n.props.label===label));assert.ok(n,`${type} ${label}`);return n;};
let tree=render();let pending=find(tree,'button','Prepare preview').props.onClick();resolvePreview();await pending;tree=render();assert.ok(nodes(tree).some(n=>n.props?.id==='cr-notes'));
find(tree,'segmented','Report type').props.onValueChange('monthly');tree=render();assert.ok(!nodes(tree).some(n=>n.props?.id==='cr-notes'),'Report type change clears the prior preview');
pending=find(tree,'button','Prepare preview').props.onClick();tree=render();const month=find(tree,'choice','Reporting month');month.props.onChange(month.props.options[2].value);tree=render();assert.equal(find(tree,'button','Prepare preview').props.disabled,false,'Changing month resets pending preview state');resolvePreview();await pending;tree=render();assert.ok(!nodes(tree).some(n=>n.props?.id==='cr-notes'),'A late old-month response must not restore preview');
pending=find(tree,'button','Prepare preview').props.onClick();resolvePreview();await pending;tree=render();await find(tree,'button','Create link + copy').props.onClick();tree=render();assert.equal(requests.at(-1).body.period.start,month.props.options[2].value+'-01');assert.equal(requests.at(-1).body.reportType,'monthly');assert.equal(reloads,1);assert.ok(text(tree).includes('No message has been sent'));assert.ok(nodes(tree).some(n=>n.type==='a'&&n.props.href==='https://example.invalid/r/fixture?preview=1'));
console.log('PASS report preparation: type/month invalidate previews, late responses discarded, pending state recovers, created report uses reviewed month and exposes saved link');

assert.deepEqual(JSON.parse(JSON.stringify(exports.reportingWeek(new Date('2026-09-21T12:00:00Z')))), {start:'2026-09-14',end:'2026-09-20'});
assert.deepEqual(JSON.parse(JSON.stringify(exports.reportingWeek(new Date('2026-09-20T12:00:00Z')))), {start:'2026-09-07',end:'2026-09-13'});
assert.deepEqual(JSON.parse(JSON.stringify(exports.reportingWeek(new Date('2026-01-01T12:00:00Z')))), {start:'2025-12-22',end:'2025-12-28'});
assert.deepEqual(JSON.parse(JSON.stringify(exports.reportingWeek(new Date('2026-09-21T12:00:00Z'), true))), {start:'2026-09-21',end:'2026-09-21'});
find(tree,'segmented','Report type').props.onValueChange('performance');tree=render();
const dates=nodes(tree).filter(n=>n.type==='input'&&n.props.type==='date');
dates[0].props.onChange({target:{value:'2026-08-03'}});dates[1].props.onChange({target:{value:'2026-08-19'}});tree=render();
pending=find(tree,'button','Prepare preview').props.onClick();resolvePreview();await pending;tree=render();await find(tree,'button','Create link + copy').props.onClick();
assert.equal(requests.at(-1).body.reportType,'performance');assert.equal(requests.at(-1).body.period.start,'2026-08-03');assert.equal(requests.at(-1).body.period.end,'2026-08-19');
console.log('PASS calendar weeks: Monday/Sunday/year boundaries, partial week, and explicit custom report dates');
