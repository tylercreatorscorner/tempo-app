import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
let signedIn=true,role='brand',writes=[];
const exports={};
const deps={
 'next/cache':{revalidatePath:()=>{}},
 '@/lib/supabase/server':{
  createClient:async()=>({auth:{getUser:async()=>({data:{user:signedIn?{id:'self'}:null}})},from:()=>({select:()=>({eq:(key,id)=>{assert.equal(key,'user_id');assert.equal(id,'self');return {maybeSingle:async()=>({data:{role}})};}})})}),
  createAdminClient:async()=>({from:table=>{assert.equal(table,'user_profiles');return {update:patch=>({eq:async(key,id)=>{writes.push({patch,key,id});return {error:null};}})};}}),
 }
};
runInNewContext(ts.transpileModule(readFileSync('src/app/actions/brand-profile.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>{assert.ok(name in deps);return deps[name];}});
for(const validRole of ['brand','brand_contact']){role=validRole;const result=await exports.updateBrandUserName('  Display name  ');assert.equal(result.name,'Display name');assert.equal(JSON.stringify(writes.at(-1)),JSON.stringify({patch:{name:'Display name'},key:'user_id',id:'self'}));}
const count=writes.length;
for(const invalidName of ['', ' '.repeat(3), 'x'.repeat(81)])await assert.rejects(()=>exports.updateBrandUserName(invalidName));
role='creator';await assert.rejects(()=>exports.updateBrandUserName('Name'));
signedIn=false;await assert.rejects(()=>exports.updateBrandUserName('Name'));
assert.equal(writes.length,count);
console.log('PASS supported self-name updates use server credentials, only update name, and constrain the current user');
console.log('PASS invalid names, wrong roles and signed-out requests cannot write');
