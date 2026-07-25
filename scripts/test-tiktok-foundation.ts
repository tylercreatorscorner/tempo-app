#!/usr/bin/env tsx
/**
 * Unit tests for the TikTok Shop storage/identity foundation.
 *
 * Run with: npx tsx scripts/test-tiktok-foundation.ts
 *
 * No test runner is installed in this repo, so this is a self-contained
 * assert-and-exit script in the scripts/ convention. Exits 1 on the first
 * failure so it can gate a build if wired up later.
 *
 * Covers the two pure modules that have no other safety net:
 *   - token-crypto  : AES-256-GCM round trip, key validation, tamper detection
 *   - brand-resolution : the umbrella / unknown / ambiguous hard-fails
 */
import {
  encryptToken,
  decryptToken,
  isEncryptedEnvelope,
  isTokenEncryptionConfigured,
  TOKEN_ENC_KEY_ENV_VAR,
} from '../src/lib/tiktok/token-crypto';
import {
  resolveShopToBrandSlug,
  resolveExplicitBrandSlug,
  resolveShopToBrandSlugOrThrow,
} from '../src/lib/tiktok/brand-resolution';
import { buildRegistry, type BrandRow } from '../src/lib/data/brand-registry-core';

let failures = 0;

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function throws(label: string, fn: () => unknown, expectFragment?: string): void {
  try {
    fn();
    failures += 1;
    console.error(`  FAIL ${label} — expected a throw, got none`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (expectFragment && !message.includes(expectFragment)) {
      failures += 1;
      console.error(`  FAIL ${label} — message missing "${expectFragment}": ${message}`);
    } else {
      console.log(`  ok   ${label}`);
    }
  }
}

// ── token-crypto ─────────────────────────────────────────────────────────────
// Key validation is asserted BEFORE any successful call, because getKey()
// memoizes on first success and a cached key cannot be cleared from outside.
console.log('token-crypto: key validation');
delete process.env[TOKEN_ENC_KEY_ENV_VAR];
check('unset key → isTokenEncryptionConfigured() false', isTokenEncryptionConfigured() === false);
throws('unset key → encrypt throws', () => encryptToken('x'), 'is not set');

process.env[TOKEN_ENC_KEY_ENV_VAR] = 'a'.repeat(64); // 64 hex chars
throws('hex key → explicit hex error', () => encryptToken('x'), 'looks like hex');

process.env[TOKEN_ENC_KEY_ENV_VAR] = Buffer.alloc(16).toString('base64'); // 16 bytes
throws('short key → byte-length error', () => encryptToken('x'), 'AES-256 needs exactly 32');

const KEY = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8'); // exactly 32 bytes
process.env[TOKEN_ENC_KEY_ENV_VAR] = KEY.toString('base64');
check('valid key → configured', isTokenEncryptionConfigured() === true);

console.log('token-crypto: round trip');
const SECRET = 'ROW-abc123.def456.ghi789_a-tiktok-access-token';
const envelope = encryptToken(SECRET);
check('round trip returns the original plaintext', decryptToken(envelope) === SECRET);
check('envelope is recognised', isEncryptedEnvelope(envelope));
check('envelope is not the plaintext', !envelope.includes(SECRET));
check('envelope has 4 dot-separated parts', envelope.split('.').length === 4);
check('envelope is v1-prefixed', envelope.startsWith('v1.'));
check('plaintext is not a valid envelope', !isEncryptedEnvelope(SECRET));

const second = encryptToken(SECRET);
check('same plaintext encrypts to a DIFFERENT envelope (random IV)', second !== envelope);
check('...and both decrypt to the same plaintext', decryptToken(second) === SECRET);

const unicode = 'tökén-🔐-测试';
check('unicode survives the round trip', decryptToken(encryptToken(unicode)) === unicode);
const long = 'x'.repeat(9000);
check('long token survives the round trip', decryptToken(encryptToken(long)) === long);

console.log('token-crypto: rejection');
throws('empty plaintext rejected', () => encryptToken(''), 'empty token');
throws('malformed envelope rejected', () => decryptToken('not-an-envelope'), 'malformed');
throws('unknown version rejected', () => decryptToken(`v9.${envelope.split('.').slice(1).join('.')}`), 'unsupported envelope version');

const [, iv, tag, data] = envelope.split('.');
const flipped = Buffer.from(data, 'base64');
flipped[0] ^= 0xff;
throws(
  'tampered ciphertext fails the GCM auth tag',
  () => decryptToken(['v1', iv, tag, flipped.toString('base64')].join('.')),
  'decryption failed',
);

const wrongTag = Buffer.from(tag, 'base64');
wrongTag[0] ^= 0xff;
throws(
  'tampered auth tag rejected',
  () => decryptToken(['v1', iv, wrongTag.toString('base64'), data].join('.')),
  'decryption failed',
);

// ── brand-resolution ─────────────────────────────────────────────────────────
// Mirrors the real brands_v2 shape: one umbrella (leefar) over three stores,
// standalone brands, and one archived brand.
const row = (over: Partial<BrandRow> & { id: string; slug: string; name: string }): BrandRow => ({
  display_name: null,
  color: null,
  is_archived: false,
  is_umbrella: false,
  parent_brand_id: null,
  store_order: null,
  ...over,
});

const reg = buildRegistry([
  row({ id: 'u1', slug: 'leefar', name: 'LeeFar', is_umbrella: true }),
  row({ id: 's1', slug: 'leefar_nutrition', name: 'LeeFar Nutrition Co.', parent_brand_id: 'u1', store_order: 1 }),
  row({ id: 's2', slug: 'leefar_supplements', name: 'LeeFar Supplements', parent_brand_id: 'u1', store_order: 2 }),
  row({ id: 's3', slug: 'leefar_us', name: 'LeeFar US', parent_brand_id: 'u1', store_order: 3 }),
  row({ id: 'b1', slug: 'cosrx', name: 'COSRX' }),
  row({ id: 'b2', slug: 'dr_dent', name: 'Dr. Dent' }),
  row({ id: 'b3', slug: 'deos', name: 'Deos' }),
  row({ id: 'b4', slug: 'toplux', name: 'Toplux Nutrition', is_archived: true }),
]);

console.log('brand-resolution: explicit slug');
const okCosrx = resolveExplicitBrandSlug(reg, 'cosrx');
check('known store slug resolves', okCosrx.ok === true && okCosrx.brandSlug === 'cosrx');
check(
  'explicit match is flagged as not-a-guess',
  okCosrx.ok === true && okCosrx.matchedOn === 'explicit',
);

const umbrella = resolveExplicitBrandSlug(reg, 'leefar');
check('UMBRELLA slug hard-fails', umbrella.ok === false && umbrella.reason === 'umbrella_slug');
check(
  'umbrella failure names all three stores',
  umbrella.ok === false && (umbrella.candidates ?? []).join(',') === 'leefar_nutrition,leefar_supplements,leefar_us',
  umbrella.ok === false ? JSON.stringify(umbrella.candidates) : '',
);

check(
  'unknown slug hard-fails',
  resolveExplicitBrandSlug(reg, 'not_a_brand').ok === false,
);
check('empty slug hard-fails', resolveExplicitBrandSlug(reg, '  ').ok === false);
check('null slug hard-fails', resolveExplicitBrandSlug(reg, null).ok === false);
check(
  'archived brand still reconnectable by explicit slug',
  resolveExplicitBrandSlug(reg, 'toplux').ok === true,
);

console.log('brand-resolution: shop-name matching');
const explicitWins = resolveShopToBrandSlug(reg, { shopName: 'COSRX', brandSlug: 'leefar_us' });
check(
  'explicit slug beats the shop name',
  explicitWins.ok === true && explicitWins.brandSlug === 'leefar_us',
);

const nutrition = resolveShopToBrandSlug(reg, { shopName: 'LeeFar Nutrition Co.', shopId: '7494' });
check(
  'THE LEEFAR CASE: store name resolves to its own store slug',
  nutrition.ok === true && nutrition.brandSlug === 'leefar_nutrition',
  nutrition.ok ? '' : nutrition.message,
);
const supplements = resolveShopToBrandSlug(reg, { shopName: 'LeeFar Supplements', shopId: '7495' });
check(
  'second LeeFar shop resolves to a DIFFERENT slug',
  supplements.ok === true && supplements.brandSlug === 'leefar_supplements',
);
const us = resolveShopToBrandSlug(reg, { shopName: 'LeeFar US', shopId: '7496' });
check('third LeeFar shop resolves to leefar_us', us.ok === true && us.brandSlug === 'leefar_us');
check(
  'the three LeeFar shops do NOT collapse into one brand',
  nutrition.ok && supplements.ok && us.ok &&
    new Set([nutrition.brandSlug, supplements.brandSlug, us.brandSlug]).size === 3,
);

const bare = resolveShopToBrandSlug(reg, { shopName: 'LeeFar', shopId: '7497' });
check(
  'a bare "LeeFar" shop name refuses to guess',
  bare.ok === false && (bare.reason === 'umbrella_slug' || bare.reason === 'ambiguous_match'),
  bare.ok ? 'it guessed' : '',
);
check('...and lists the stores to choose from', bare.ok === false && (bare.candidates ?? []).length === 3);

check(
  'suffixed shop name prefix-matches its brand',
  (() => {
    const r = resolveShopToBrandSlug(reg, { shopName: 'Dr Dent Official Store' });
    return r.ok === true && r.brandSlug === 'dr_dent';
  })(),
);
check(
  'short brand key does not substring-match an unrelated shop ("deos" in "Videos Store")',
  resolveShopToBrandSlug(reg, { shopName: 'Videos Store' }).ok === false,
);
check(
  'unknown shop name hard-fails rather than falling back',
  (() => {
    const r = resolveShopToBrandSlug(reg, { shopName: 'Totally Unrelated Shop', shopId: '999' });
    return r.ok === false && r.reason === 'unknown_brand';
  })(),
);
check(
  'archived brand is not auto-guessed by name',
  resolveShopToBrandSlug(reg, { shopName: 'Toplux Nutrition' }).ok === false,
);
check('no name and no slug hard-fails', resolveShopToBrandSlug(reg, { shopId: '1' }).ok === false);

check(
  'throwing wrapper returns the slug on success',
  resolveShopToBrandSlugOrThrow(reg, { brandSlug: 'cosrx' }) === 'cosrx',
);
throws(
  'throwing wrapper throws on an umbrella',
  () => resolveShopToBrandSlugOrThrow(reg, { brandSlug: 'leefar' }),
  'umbrella_slug',
);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
