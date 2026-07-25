#!/usr/bin/env tsx
/**
 * Frozen-fixture tests for the TikTok Shop signing algorithm.
 *
 * Run with: npx tsx scripts/test-tiktok-signature.ts
 *
 * No test runner is installed in this repo, so this is a self-contained
 * assert-and-exit script in the scripts/ convention. Exits 1 on the first
 * failure so it can gate a build if wired up later.
 *
 * The expected digests below are CONSTANTS, not recomputations. They exist so
 * that any edit to signRequest fails loudly here instead of silently producing
 * signatures the live API rejects. Do NOT "fix" a failing digest by pasting in
 * the newly-produced value — the algorithm is specified in signature.ts as
 * steps 1-7, and a changed hash means the implementation drifted off it.
 */
import { signRequest } from '../src/lib/tiktok/signature';

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

const APP_SECRET = 'tempo_test_app_secret_0123456789';
const APP_KEY = 'tempo_test_app_key';
const SHOP_CIPHER = 'TTP_FIXTURE_CIPHER';
const TIMESTAMP = '1700000000';

const GET_PATH = '/affiliate_creator/202405/creators';
const GET_PARAMS = {
  app_key: APP_KEY,
  timestamp: TIMESTAMP,
  shop_cipher: SHOP_CIPHER,
  page_size: '100',
  sign: 'MUST_BE_EXCLUDED',
  access_token: 'MUST_BE_EXCLUDED',
  'x-tts-access-token': 'MUST_BE_EXCLUDED',
};
const GET_EXPECTED = '8e885717f136df23b41d7eb5d5cedf3563868cad832c06ad457b5949ff976d2e';

const POST_PATH = '/data_report/202406/shop_performance';
const POST_PARAMS = { app_key: APP_KEY, timestamp: TIMESTAMP, shop_cipher: SHOP_CIPHER };
const POST_BODY = '{"start_date":"2026-07-01","end_date":"2026-07-24"}';
const POST_EXPECTED = 'd61283c0c597eb03235cf9f0ec999c1a7d3329cba715bb5553a83d4c6704e03b';

/** The same POST params with the body left OUT of the digest (step 5's exclusion path). */
const POST_WITHOUT_BODY_EXPECTED = '40b314fa35fbefdc51f3e5a1cd6cc34f87f6a8009cda16a9ab636d040f39e805';

// ── frozen fixtures ──────────────────────────────────────────────────────────
console.log('signature: frozen fixtures');

const getActual = signRequest({ appSecret: APP_SECRET, path: GET_PATH, params: { ...GET_PARAMS } });
check('GET request matches the frozen digest', getActual === GET_EXPECTED, `got ${getActual}`);

const postActual = signRequest({
  appSecret: APP_SECRET,
  path: POST_PATH,
  params: { ...POST_PARAMS },
  body: POST_BODY,
  method: 'POST',
  contentType: 'application/json',
});
check(
  'POST request signs the raw body and matches the frozen digest',
  postActual === POST_EXPECTED,
  `got ${postActual}`,
);

// ── excluded params (the live trap the previous module fell into) ────────────
console.log('signature: params excluded from the digest');

check(
  'dropping sign/access_token/x-tts-access-token entirely does not move the digest',
  signRequest({
    appSecret: APP_SECRET,
    path: GET_PATH,
    params: {
      app_key: APP_KEY,
      timestamp: TIMESTAMP,
      shop_cipher: SHOP_CIPHER,
      page_size: '100',
    },
  }) === GET_EXPECTED,
);

check(
  'rotating their values does not move the digest',
  signRequest({
    appSecret: APP_SECRET,
    path: GET_PATH,
    params: {
      ...GET_PARAMS,
      sign: 'something else',
      access_token: 'a rotated token',
      'x-tts-access-token': 'a rotated token',
    },
  }) === GET_EXPECTED,
);

check(
  'param insertion order does not matter (keys are sorted)',
  signRequest({
    appSecret: APP_SECRET,
    path: GET_PATH,
    params: {
      'x-tts-access-token': 'MUST_BE_EXCLUDED',
      page_size: '100',
      timestamp: TIMESTAMP,
      access_token: 'MUST_BE_EXCLUDED',
      shop_cipher: SHOP_CIPHER,
      sign: 'MUST_BE_EXCLUDED',
      app_key: APP_KEY,
    },
  }) === GET_EXPECTED,
);

// ── body inclusion rules ─────────────────────────────────────────────────────
console.log('signature: body inclusion');

const multipartActual = signRequest({
  appSecret: APP_SECRET,
  path: POST_PATH,
  params: { ...POST_PARAMS },
  body: POST_BODY,
  method: 'POST',
  contentType: 'multipart/form-data; boundary=----tempo',
});
check('a multipart body is excluded from the digest', multipartActual === POST_WITHOUT_BODY_EXPECTED);
check('...and therefore differs from the signed-body digest', multipartActual !== POST_EXPECTED);

check(
  'a GET body is excluded from the digest',
  signRequest({
    appSecret: APP_SECRET,
    path: POST_PATH,
    params: { ...POST_PARAMS },
    body: POST_BODY,
    method: 'GET',
    contentType: 'application/json',
  }) === POST_WITHOUT_BODY_EXPECTED,
);

// ── every signed input must move the digest ──────────────────────────────────
console.log('signature: tamper detection');

const variants: Array<[string, Parameters<typeof signRequest>[0]]> = [
  ['appSecret', { appSecret: `${APP_SECRET}x`, path: GET_PATH, params: { ...GET_PARAMS } }],
  ['path', { appSecret: APP_SECRET, path: '/affiliate_creator/202405/creator', params: { ...GET_PARAMS } }],
  ['timestamp', { appSecret: APP_SECRET, path: GET_PATH, params: { ...GET_PARAMS, timestamp: '1700000001' } }],
  ['shop_cipher', { appSecret: APP_SECRET, path: GET_PATH, params: { ...GET_PARAMS, shop_cipher: 'OTHER' } }],
  ['a param value', { appSecret: APP_SECRET, path: GET_PATH, params: { ...GET_PARAMS, page_size: '50' } }],
  ['an added param', { appSecret: APP_SECRET, path: GET_PATH, params: { ...GET_PARAMS, extra_param: 'x' } }],
];
for (const [label, input] of variants) {
  check(`changing ${label} changes the digest`, signRequest(input) !== GET_EXPECTED);
}

// ── unusable input ───────────────────────────────────────────────────────────
console.log('signature: input validation');

throws('empty appSecret throws', () => signRequest({ appSecret: '', path: GET_PATH, params: {} }), 'appSecret');
throws(
  'a path without a leading slash throws',
  () => signRequest({ appSecret: APP_SECRET, path: 'affiliate_creator/202405/creators', params: {} }),
  'must start with',
);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
