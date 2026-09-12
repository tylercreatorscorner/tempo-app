/** Offline regression: node scripts/test-billing-disabled.mjs */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { NextResponse } from 'next/server.js';
import ts from 'typescript';

function loadSource(path, dependencies) {
  const filename = fileURLToPath(new URL(`../${path}`, import.meta.url));
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return exports;
}

for (const path of ['src/app/api/checkout/route.ts', 'src/app/api/webhooks/stripe/route.ts']) {
  const { POST } = loadSource(path, { 'next/server': { NextResponse } });
  // A stale caller cannot trigger parsing, credentials, provider calls or DB access.
  const request = new Proxy({}, { get() { throw new Error('Retired route read request data'); } });
  const result = await POST(request);
  assert.equal(result.status, 410);
  assert.equal((await result.json()).error, 'Subscription billing is unavailable');
  console.log(`PASS retired ${path}`);
}

async function onboarding(tenant, authenticated = true) {
  let state;
  let effect;
  const { useOnboarding } = loadSource('src/hooks/use-onboarding.ts', {
    react: {
      useState(initial) {
        state = initial;
        return [state, update => { state = typeof update === 'function' ? update(state) : update; }];
      },
      useEffect(callback) { effect = callback; },
    },
    '@/lib/supabase/client': {
      createClient: () => ({
        auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'user_fixture' } : null } }) },
        from: () => ({ select: () => ({ eq: () => ({
          maybeSingle: async () => ({ data: { tenant_id: 'tenant_fixture' } }),
          single: async () => ({ data: tenant }),
        }) }) }),
      }),
    },
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks -- Isolated harness supplies mocked React state and effects.
  useOnboarding();
  effect();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.loading, false);
  return state;
}

for (const stripe_subscription_id of [null, 'legacy_reference']) {
  const state = await onboarding({ tiktok_connected: true, stripe_subscription_id });
  assert.equal(state.isGated, false);
  assert.equal(state.progress, 100);
  assert.ok(state.steps.every(step => step.id !== 'plan'));
}
console.log('PASS setup does not require a paid subscription');
assert.equal((await onboarding({ tiktok_connected: false })).isGated, true);
console.log('PASS existing shop setup requirement remains');
assert.equal((await onboarding({}, false)).isGated, true);
assert.equal((await onboarding(null)).isGated, true);
console.log('PASS missing identity or tenant is not granted setup completion');
