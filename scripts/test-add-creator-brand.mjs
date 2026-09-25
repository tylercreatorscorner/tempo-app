import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
let scope={tenantId:'tenant',canViewCreatorCost:true,brandScope:{kind:'scoped',brandSlugs:['neurogum','nello']}},dbCalls=0;
const exports={};const deps={
 'next/server':{NextResponse:{json:(body,init)=>({body,status:init.status})}},
 '@/lib/auth/workspace-scope':{getWorkspaceScope:async()=>scope},
 '@/lib/supabase/server':{createAdminClient:async()=>{dbCalls++;throw Error('authorized database boundary');}},
 '@/lib/data/brand-registry':{},'@/lib/data/roster-query':{}
};
runInNewContext(ts.transpileModule(readFileSync('src/app/api/roster/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{assert.ok(n in deps,n);return deps[n];}});
const request=brand=>({json:async()=>({real_name:'Fixture',handles:[],brand})});
for(const brand of [undefined,null,'','   ','all',42]){const response=await exports.POST(request(brand));assert.equal(response.status,400);assert.equal(response.body.error,'Please select a brand.');}
assert.equal(dbCalls,0);
assert.equal((await exports.POST(request('jiyu'))).status,403);assert.equal(dbCalls,0);
for(const brand of ['neurogum','nello'])await assert.rejects(()=>exports.POST(request(brand)),/authorized database boundary/);
assert.equal(dbCalls,2);
scope=null;assert.equal((await exports.POST(request('nello'))).status,401);assert.equal(dbCalls,2);
console.log('PASS missing brand returns actionable 400 before database access; assigned brands pass scope gate; foreign brands and signed-out callers remain denied');
