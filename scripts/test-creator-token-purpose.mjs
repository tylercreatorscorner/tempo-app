/** Offline regression using real JWT signing and the production auth consumers. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { randomBytes } from 'node:crypto';
import * as jose from 'jose';
import { NextRequest, NextResponse } from 'next/server.js';
import ts from 'typescript';

const secret = 'offline-creator-token-test-secret-at-least-32-characters';
const key = new TextEncoder().encode(secret);
const jar = new Map();
function load(path, dependencies) {
  const filename = fileURLToPath(new URL(`../${path}`, import.meta.url));
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(code, {
    exports, TextEncoder, Date, URL, console,
    process: { env: { NODE_ENV: 'production', CREATOR_JWT_SECRET: secret } },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return exports;
}
const auth = load('src/lib/auth/creator-auth.ts', {
  jose, 'node:crypto': { randomBytes },
  'next/headers': { cookies: async () => ({
    get: name => jar.get(name),
    set: (name, value, options) => jar.set(name, { value, options }),
    delete: name => jar.delete(name),
  }) },
});
const identity = { creatorId: 'a8187194-5456-4a7a-8e98-3723c2749764', email: '' };
async function cookie(token) {
  jar.set('creator_session', { value: token });
  return auth.getCreatorSession();
}
const claim = await auth.generateClaimToken(identity);
const magic = await auth.generateMagicToken(identity);
const session = await auth.generateSessionToken(identity);
if (process.argv.includes('--reproduce')) {
  assert.ok(await cookie(session), 'Legitimate session works');
  assert.ok(await cookie(claim.token), 'Original claim-as-session vulnerability reproduced');
  assert.ok(await cookie(magic.token), 'Original magic-as-session vulnerability reproduced');
  console.log('REPRODUCED: both link types accepted as sessions; legitimate session also works');
} else {
  assert.ok(await cookie(session));
  assert.equal(await cookie(claim.token), null);
  assert.equal(await cookie(magic.token), null);
  console.log('PASS session cookie rejects both link types');

  async function signed(payload, ttl = 900, signingKey = key) {
    return new jose.SignJWT(payload).setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt().setExpirationTime(`${ttl}s`).sign(signingKey);
  }
  const legacySession = await signed(identity, 30 * 86400);
  const legacyMagic = await signed({ ...identity, jti: 'legacy-magic' });
  const verifiers = [auth.verifySessionToken, auth.verifyMagicToken, auth.verifyClaimToken];
  for (const [token, expected] of [[session, 0], [magic.token, 1], [claim.token, 2],
    [legacySession, 0], [legacyMagic, 1]]) {
    for (let index = 0; index < verifiers.length; index++) {
      assert.equal(Boolean(await verifiers[index](token)), index === expected);
    }
  }
  for (const fields of [
    { purpose: 'other' }, { purpose: null }, { purpose: '' }, { jti: '' }, { jti: null },
    { purpose: 'session', jti: 'link' }, { purpose: 'magic' }, { purpose: 'claim' },
    { creatorId: null }, { email: null },
  ]) {
    const token = await signed({ ...identity, ...fields });
    for (const verify of verifiers) assert.equal(await verify(token), null);
  }
  for (const token of [await signed(identity, -60),
    await signed(identity, 900, new TextEncoder().encode('wrong-secret')),
    'malformed.jwt']) {
    for (const verify of verifiers) assert.equal(await verify(token), null);
  }
  const missingExpiry = await new jose.SignJWT(identity).setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt().sign(key);
  assert.equal(await auth.verifySessionToken(missingExpiry), null);
  const cleanSession = await auth.generateSessionToken({ ...identity, purpose: 'claim', jti: 'inherited' });
  assert.ok(await cookie(cleanSession));
  assert.equal(jose.decodeJwt(cleanSession).jti, undefined);
  assert.ok(await cookie(await auth.generateSessionToken({ creatorId: 123, email: 'fixture@example.test' })));
  // Legacy signers read the clock separately for iat and exp, which can cross a second.
  for (const [fields, ttl, verify] of [
    [identity, 30 * 86400 + 1, auth.verifySessionToken],
    [{ ...identity, jti: 'boundary-magic' }, 901, auth.verifyMagicToken],
    [{ ...identity, purpose: 'claim', jti: 'boundary-claim' }, 60 * 86400 + 1, auth.verifyClaimToken],
  ]) assert.ok(await verify(await signed(fields, ttl)));
  console.log('PASS purpose matrix, legacy compatibility, malformed/expired/forged tokens and metadata stripping');

  let accesses = 0;
  let mintSigns = 0;
  const claimWrites = [];
  const tenantId = '00000000-0000-4000-8000-000000000001';
  const foreignCreatorId = '00000000-0000-4000-8000-000000000002';
  const creatorRows = [
    { id: identity.creatorId, tenant_id: tenantId, real_name: 'Fixture', contact_onboarding_at: '2026-01-01' },
    { id: foreignCreatorId, tenant_id: '00000000-0000-4000-8000-000000000003', real_name: 'Foreign fixture' },
  ];
  const usedMagic = new Set();
  const claimRows = new Map([[claim.jti, { creator_id: identity.creatorId, consumed_at: null,
    expires_at: claim.expiresAt.toISOString() }]]);
  const db = { from(table) {
    accesses++;
    if (table === 'creator_magic_link_tokens') return { insert: async ({ jti }) => {
      if (usedMagic.has(jti)) return { error: { code: '23505' } };
      usedMagic.add(jti);
      return { error: null };
    } };
    if (table === 'creators_v2') {
      const filters = [];
      const query = {
        select: () => query,
        eq: (column, value) => { filters.push([column, value]); return query; },
        maybeSingle: async () => ({
          data: creatorRows.find(row => filters.every(([column, value]) => row[column] === value)) ?? null,
          error: null,
        }),
      };
      return query;
    }
    assert.equal(table, 'creator_claim_tokens');
    let selectedJti;
    let update;
    let unconsumed = false;
    let after;
    const query = {
      insert: async row => {
        claimWrites.push(row);
        claimRows.set(row.jti, { ...row, consumed_at: null });
        return { error: null };
      },
      select: () => query,
      eq: (column, value) => { assert.equal(column, 'jti'); selectedJti = value; return query; },
      update: value => { update = value; return query; },
      is: (column, value) => {
        assert.equal(column, 'consumed_at'); assert.equal(value, null); unconsumed = true; return query;
      },
      gt: (column, value) => { assert.equal(column, 'expires_at'); after = value; return query; },
      maybeSingle: async () => {
        const row = claimRows.get(selectedJti);
        if (!row || (unconsumed && row.consumed_at) || (after && row.expires_at <= after)) return { data: null };
        if (update) Object.assign(row, update);
        return { data: { ...row }, error: null };
      },
    };
    return query;
  } };
  const database = { createAdminClient: async () => db };
  const { GET } = load('src/app/api/auth/creator/verify/route.ts', {
    'next/server': { NextResponse }, '@/lib/auth/creator-auth': auth,
    '@/lib/supabase/server': database,
  });
  const inviteAccess = load('src/lib/auth/creator-invite-access.ts', {
    '@/lib/auth/permissions': load('src/lib/auth/permissions.ts', {}),
    '@/lib/supabase/server': database,
  });
  const claims = load('src/lib/auth/creator-claim.ts', {
    './creator-auth': { ...auth, generateClaimToken: async payload => {
      mintSigns++;
      return auth.generateClaimToken(payload);
    } },
    './creator-invite-access': inviteAccess,
    '@/lib/supabase/server': database,
  });
  const inviteScope = {
    userId: '00000000-0000-4000-8000-000000000004', tenantId, role: 'admin', canViewFinance: true,
    brandScope: { kind: 'all' }, permissions: new Set(['roster:read', 'roster:write']),
  };
  for (const deniedScope of [null, { ...inviteScope, permissions: new Set(['roster:read']) },
    { ...inviteScope, brandScope: { kind: 'scoped', brandIds: [], brandSlugs: [] } },
    { ...inviteScope, impersonating: { userId: 'fixture-target' } }]) {
    const before = accesses;
    await assert.rejects(claims.mintClaimLink(deniedScope, identity.creatorId, 'https://tempo.example'),
      error => error.status === (deniedScope ? 403 : 401));
    assert.equal(accesses, before, 'Denied mint scope cannot reach creator or token records');
    assert.equal(mintSigns, 0, 'Denied mint scope cannot sign a credential');
    assert.equal(claimWrites.length, 0);
  }
  await assert.rejects(claims.mintClaimLink(inviteScope, foreignCreatorId, 'https://tempo.example'), error => error.status === 404);
  assert.equal(mintSigns, 0, 'A foreign creator cannot be issued a credential');
  assert.equal(claimWrites.length, 0);
  const minted = await claims.mintClaimLink(inviteScope, identity.creatorId, 'https://tempo.example/', 'offline-fixture');
  const mintedToken = new URL(minted.url).searchParams.get('token');
  assert.equal(mintSigns, 1);
  assert.equal(claimWrites.length, 1);
  assert.equal(claimWrites[0].creator_id, identity.creatorId);
  assert.equal(claimWrites[0].created_by, 'offline-fixture');
  assert.equal((await auth.verifyClaimToken(mintedToken)).creatorId, identity.creatorId);
  assert.equal(await cookie(mintedToken), null, 'An authorized minted claim is still not a session');
  assert.ok(await claims.peekClaimToken(mintedToken));
  assert.ok(await claims.consumeClaimToken(mintedToken));
  assert.equal(await claims.consumeClaimToken(mintedToken), null);
  console.log('PASS real scope authorization before claim signing, tenant ownership and authorized one-use minting');
  const verifyRoute = token => GET(new NextRequest(`https://tempo.example/api/auth/creator/verify?token=${token}`));
  for (const token of [claim.token, session, legacySession]) {
    const before = accesses;
    assert.match((await verifyRoute(token)).headers.get('location'), /error=invalid_token/);
    assert.equal(accesses, before, 'Wrong token category cannot reach magic redemption');
  }
  for (const token of [session, magic.token, legacyMagic]) {
    const before = accesses;
    assert.equal(await claims.peekClaimToken(token), null);
    assert.equal(await claims.consumeClaimToken(token), null);
    assert.equal(accesses, before, 'Wrong token category cannot reach claim records');
  }
  assert.ok(await claims.peekClaimToken(claim.token));
  assert.ok(await claims.peekClaimToken(claim.token), 'Preview does not consume');
  assert.ok(await claims.consumeClaimToken(claim.token));
  assert.equal(await claims.consumeClaimToken(claim.token), null);
  assert.equal(await claims.peekClaimToken(claim.token), null);
  assert.equal(await cookie(claim.token), null, 'Consumed claim cannot become a cookie');
  assert.match((await verifyRoute(claim.token)).headers.get('location'), /error=invalid_token/);
  for (const token of [magic.token, legacyMagic]) {
    assert.match((await verifyRoute(token)).headers.get('location'), /creator-dashboard$/);
    assert.ok(await auth.getCreatorSession(), 'Successful redemption issues a valid session');
    assert.equal(jar.get('creator_session').options.httpOnly, true);
    assert.equal(jar.get('creator_session').options.secure, true);
    assert.match((await verifyRoute(token)).headers.get('location'), /error=token_already_used/);
    assert.equal(await cookie(token), null, 'Consumed magic link cannot become a cookie');
  }
  console.log('PASS consumer isolation before DB access, non-consuming claim preview and one-use redemption');
}
