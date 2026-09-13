import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

let actor, targets, brands, writes, impersonating, dbError, writeError, beforeWrite;
function reset() {
  actor = { user_id: 'actor', role: 'owner', tenant_id: 'tenant-a' };
  targets = [{user_id:'member',role:'manager',tenant_id:'tenant-a'}, {user_id:'foreign',role:'manager',tenant_id:'tenant-b'}, {user_id:'owner',role:'owner',tenant_id:'tenant-a'}, actor];
  brands = [{id:'brand-a',tenant_id:'tenant-a'}, {id:'brand-b',tenant_id:'tenant-b'}];
  writes=[]; impersonating=false; dbError=false; writeError=false; beforeWrite=null;
}
function query(table) {
  const filters=[]; let mutation=null, payload;
  const q={
    select(){return q;}, eq(key,value){filters.push(row=>row[key]===value);return q;},
    in(key,values){filters.push(row=>values.includes(row[key]));return q;},
    update(value){mutation='update';payload=value;return q;}, delete(){mutation='delete';return q;},
    insert(value){mutation='insert';payload=value;return q;},
    maybeSingle(){return Promise.resolve(result(true));}, single(){return Promise.resolve(result(true));},
    then(resolve,reject){return Promise.resolve(result(false)).then(resolve,reject);}
  };
  function result(single) {
    if(mutation && beforeWrite) beforeWrite();
    const rows=(table==='brands_v2'?brands:targets).filter(row=>filters.every(test=>test(row)));
    if(mutation) writes.push({table,mutation,payload,ids:rows.map(row=>row.user_id??row.id)});
    return {data:(dbError || (mutation && writeError))?null:(single?rows[0]??null:rows),error:(dbError || (mutation && writeError))?{message:'database unavailable'}:null,count:rows.length};
  }
  return q;
}
const admin={from:query,rpc:async(name,args)=>{assert.equal(name,'replace_member_brand_access');writes.push({table:'rpc',...args});return {error:dbError?{message:'failed'}:null};}};
const deps={
 '@/lib/auth/invite-workspace-member':{inviteWorkspaceMember(){throw new Error('Invitation not exercised in this fixture');}},
 '@supabase/ssr':{createServerClient(){throw new Error('Email must not be sent in this fixture');}},
 '@/lib/supabase/server':{createAdminClient:async()=>admin,createClient:async()=>({from:query,auth:{getUser:async()=>({data:{user:actor?{id:actor.user_id}:null}})}})},
 '@/lib/auth/platform-admin':{assertNotImpersonating:async()=>{if(impersonating)throw new Error('Read only');}},
 'next/cache':{revalidatePath(){}},
};
const exports={};
const reproduce=process.argv.includes('--reproduce');
const source=reproduce?execFileSync('git',['show','8a36dbca028ac3689a6115648df4376600cf0b59:src/app/actions/users.ts'],{encoding:'utf8'}):readFileSync('src/app/actions/users.ts','utf8');
runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>{assert.ok(name in deps,name);return deps[name];},process});
reset();
if(reproduce){await exports.updateUserRole('foreign','admin');assert.ok(writes.some(write=>write.ids.includes('foreign')));console.log('REPRODUCED prior action writes a foreign tenant profile');process.exit(0);}
const attempts=[()=>exports.updateUserRole('foreign','admin'),()=>exports.updateFinanceAccess('foreign',true),()=>exports.removeUser('foreign'),()=>exports.updateBrandAccess('foreign',['brand-a'],'tenant-a')];
for(const attempt of attempts){reset();await assert.rejects(attempt);assert.equal(writes.length,0);}
for(const target of ['missing','owner','actor'])for(const fn of [()=>exports.updateUserRole(target,'admin'),()=>exports.updateFinanceAccess(target,false),()=>exports.removeUser(target),()=>exports.updateBrandAccess(target,[],'tenant-a')]){reset();await assert.rejects(fn);assert.equal(writes.length,0);}
for(const setup of [()=>{actor=null;},()=>{actor.role='manager';},()=>{actor.tenant_id=null;},()=>{impersonating=true;},()=>{dbError=true;}]){reset();setup();await assert.rejects(()=>exports.updateUserRole('member','admin'));assert.equal(writes.length,0);}
for(const role of ['owner','arbitrary','creator',null]){reset();await assert.rejects(()=>exports.updateUserRole('member',role));assert.equal(writes.length,0);}
for(const ids of [['brand-b'],['brand-a','brand-b'],['missing']]){reset();await assert.rejects(()=>exports.updateBrandAccess('member',ids,'tenant-a'));assert.equal(writes.length,0);}
reset();await assert.rejects(()=>exports.updateBrandAccess('member',['brand-a'],'tenant-b'));assert.equal(writes.length,0);
for(const role of ['admin','manager','coach','brand']){reset();await exports.updateUserRole('member',role);assert.equal(writes[0].payload.role,role);assert.equal(writes[0].payload.role_id,null);assert.deepEqual(writes[0].ids,['member']);if(role==='coach')assert.equal(writes[0].payload.can_view_finance,false);}
reset();targets[0].role='coach';await assert.rejects(()=>exports.updateFinanceAccess('member',true));assert.equal(writes.length,0);
reset();await exports.updateFinanceAccess('member',false);assert.deepEqual(writes[0].ids,['member']);
reset();await exports.removeUser('member');assert.deepEqual(writes[0].ids,['member']);
reset();await exports.updateBrandAccess('member',['brand-a','brand-a'],'tenant-a');assert.equal(writes.length,1);assert.equal(writes[0].p_brand_ids.length,1);assert.equal(writes[0].p_actor_id,'actor');assert.equal(writes[0].p_user_id,'member');
reset();await exports.updateBrandAccess('member',[],'tenant-a');assert.equal(writes.length,1);
reset();actor.role='admin';await exports.updateUserRole('member','coach');assert.equal(writes[0].payload.role,'coach');
reset();await assert.rejects(()=>exports.updateFinanceAccess('member','false'));assert.equal(writes.length,0);
for(const drift of [()=>{targets[0].tenant_id='tenant-b';},()=>{targets[0].role='owner';}]){reset();beforeWrite=drift;await assert.rejects(()=>exports.updateUserRole('member','admin'));assert.deepEqual(writes[0].ids,[]);}
reset();writeError=true;await assert.rejects(()=>exports.updateUserRole('member','admin'));
console.log('PASS denied targets, owner/self protection, role validation, tenant-owned brands, and fail-closed reads');
console.log('PASS legitimate role/finance/removal/brand edits and coach finance restrictions');



