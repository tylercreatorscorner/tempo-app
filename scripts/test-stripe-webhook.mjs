/** Offline route regression: node scripts/test-stripe-webhook.mjs */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { NextRequest, NextResponse } from 'next/server.js';
import Stripe from 'stripe';
import ts from 'typescript';

const stripe = new Stripe('sk_test_offline_fixture');
const secret = 'whsec_offline_fixture';
const payload = JSON.stringify({
  id: 'evt_fixture',
  type: 'checkout.session.completed',
  data: { object: {
    id: 'cs_fixture', customer_email: 'owner@example.test',
    metadata: { role: 'agency' }, customer: 'cus_fixture', subscription: 'sub_fixture',
  } },
});
const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
const sourcePath = fileURLToPath(new URL('../src/app/api/webhooks/stripe/route.ts', import.meta.url));
const compiled = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadRoute(webhookSecret) {
  let databaseAccesses = 0;
  const writes = [];
  const admin = {
    from(table) {
      return {
        select() {
          return { eq() { return { async maybeSingle() {
            assert.equal(table, 'user_profiles');
            return { data: { id: 'profile_fixture', tenant_id: 'tenant_fixture' } };
          } }; } };
        },
        update(values) {
          return { async eq(key, value) {
            writes.push({ table, values, key, value });
            return { error: null };
          } };
        },
      };
    },
  };
  const exports = {};
  // Execute the actual route with real Stripe verification and an isolated DB.
  // No environment files, provider calls or production modules are loaded.
  runInNewContext(compiled, {
    exports,
    process: { env: { STRIPE_WEBHOOK_SECRET: webhookSecret } },
    console: { log() {}, warn() {}, error() {} },
    require(name) {
      if (name === 'next/server') return { NextResponse };
      if (name === '@/lib/stripe') return { stripe };
      if (name === '@/lib/supabase/server') return {
        async createAdminClient() { databaseAccesses++; return admin; },
      };
      throw new Error(`Unexpected route dependency: ${name}`);
    },
  }, { filename: sourcePath });
  assert.ok(exports.POST);
  const post = exports.POST;
  return {
    writes,
    get databaseAccesses() { return databaseAccesses; },
    run(body, header) {
      return post(new NextRequest('https://tempo.example.test/api/webhooks/stripe', {
        method: 'POST', body,
        headers: header === undefined ? {} : { 'stripe-signature': header },
      }));
    },
  };
}

async function main() {
  const rejected = [
    { name: 'missing signature with configured secret', secret, body: payload, header: undefined, status: 400 },
    { name: 'empty signature', secret, body: payload, header: '', status: 400 },
    { name: 'missing signing secret', secret: undefined, body: payload, header: signature, status: 503 },
    { name: 'invalid signature', secret, body: payload, header: 'invalid', status: 400 },
    { name: 'modified raw payload', secret, body: payload + ' ', header: signature, status: 400 },
    { name: 'expired signature', secret, body: payload, header: stripe.webhooks.generateTestHeaderString({
      payload, secret, timestamp: Math.floor(Date.now() / 1000) - 3600,
    }), status: 400 },
    { name: 'signed malformed JSON', secret, body: '{', header: stripe.webhooks.generateTestHeaderString({
      payload: '{', secret,
    }), status: 400 },
  ];
  for (const fixture of rejected) {
    const route = loadRoute(fixture.secret);
    const response = await route.run(fixture.body, fixture.header);
    assert.equal(response.status, fixture.status, fixture.name);
    assert.equal(route.databaseAccesses, 0, `${fixture.name}: must not acquire privileged DB access`);
    assert.equal(route.writes.length, 0, `${fixture.name}: must not write`);
    console.log(`PASS ${fixture.name}`);
  }
  const route = loadRoute(secret);
  const response = await route.run(payload, signature);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).received, true);
  assert.equal(route.databaseAccesses, 1);
  assert.equal(route.writes.length, 2);
  const tenant = route.writes.find(write => write.table === 'tenants');
  assert.ok(tenant);
  assert.equal(tenant.key, 'id');
  assert.equal(tenant.value, 'tenant_fixture');
  assert.equal(tenant.values.plan, 'agency');
  assert.equal(tenant.values.max_brands, 25);
  console.log('PASS valid signed checkout reaches the intended tenant update');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
