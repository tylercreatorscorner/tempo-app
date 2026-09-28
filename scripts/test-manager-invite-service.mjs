import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const ids = ['nello-id', 'neurogum-id'];
let scope = { userId: 'kyle-id', tenantId: 'tenant-id', role: 'manager',
  brandScope: { kind: 'scoped', brandIds: ids } };
let accounts = [];
let target = null;
let events = [];
const admin = {
  from(table) {
    if (table === 'brands_v2') {
      const q = { select: () => q, eq: () => q, in: (_key, values) => {
        events.push('brand-check');
        return Promise.resolve({ data: values.map(id => ({ id })), error: null });
      } };
      return q;
    }
    assert.equal(table, 'user_profiles');
    const q = { select: () => q, eq: () => q, maybeSingle: async () => {
      events.push('target-check');
      return { data: target, error: null };
    } };
    return q;
  },
  auth: { admin: {
    listUsers: async () => ({ data: { users: accounts }, error: null }),
    inviteUserByEmail: async email => {
      events.push('send-invite');
      return { data: { user: { id: 'new-id', email } }, error: null };
    },
  } },
  rpc: async (name, input) => {
    events.push('provision');
    assert.equal(name, 'provision_manager_invited_member');
    assert.equal(input.p_actor_id, 'kyle-id');
    assert.deepEqual(Array.from(input.p_brand_ids), ids);
    assert.ok(['manager', 'coach', 'brand'].includes(input.p_role));
    return { error: null };
  },
};
const modules = {
  '@supabase/ssr': { createServerClient: () => ({ auth: { signInWithOtp: async () => {
    events.push('send-signin'); return { error: null };
  } } }) },
  '@/lib/supabase/server': { createAdminClient: async () => { events.push('admin-client'); return admin; } },
  '@/lib/auth/workspace-scope': { getWorkspaceScope: async () => scope },
};
const exports = {};
runInNewContext(ts.transpileModule(readFileSync('src/lib/auth/invite-manager-member.ts','utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, process: { env: {
  NEXT_PUBLIC_APP_URL: 'https://tempo.example.invalid',
  NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example.invalid',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture',
} }, require: name => { assert.ok(name in modules, name); return modules[name]; } });
const invite = exports.inviteManagerMember;

for (const input of [
  { email:'person@example.invalid', role:'admin', brandIds:ids },
  { email:'person@example.invalid', role:'coach', brandIds:['other-id'] },
  { email:'person@example.invalid', role:'coach', brandIds:[] },
  { email:'invalid', role:'coach', brandIds:ids },
]) {
  events=[]; await assert.rejects(() => invite(input));
  assert.deepEqual(events, [], 'invalid request must not reach Auth Admin or send email');
}
scope={ ...scope, role:'coach' };
events=[]; await assert.rejects(() => invite({email:'person@example.invalid',role:'coach',brandIds:ids}));
assert.deepEqual(events, []);
scope={ ...scope, role:'manager' };
accounts=[{id:'existing-id',email:'person@example.invalid'}];
target={tenant_id:'other-tenant',role:'manager',status:'active'};
events=[]; await assert.rejects(() => invite({email:'person@example.invalid',role:'manager',brandIds:ids}));
assert.ok(!events.includes('send-invite') && !events.includes('send-signin') && !events.includes('provision'));
accounts=[];target=null;events=[];
await invite({email:'person@example.invalid',role:'coach',brandIds:ids});
assert.deepEqual(events.slice(-2), ['send-invite','provision']);
accounts=[{id:'existing-id',email:'person@example.invalid'}];
target={tenant_id:'tenant-id',role:'coach',status:'active'};events=[];
await invite({email:'person@example.invalid',role:'coach',brandIds:ids});
assert.deepEqual(events.slice(-2), ['provision','send-signin']);
console.log('PASS manager invitation service: invalid/off-scope requests send no email, tenant ownership, atomic provisioning before existing-user sign-in');
