#!/usr/bin/env tsx
/**
 * LIVE reachability probe for the TikTok Shop auth host. MAKES A REAL OUTBOUND
 * CALL — it is the only file in this repo that does, and it is opt-in.
 *
 * Run with: npx tsx scripts/test-tiktok-live-probe.ts
 *
 * OPT-IN: it runs only when TIKTOK_APP_KEY and TIKTOK_APP_SECRET are present
 * (process.env, .env.local or .env). With no credentials — the state of every
 * dev machine today, since they live in Vercel — it SKIPS and exits 0. It is
 * therefore safe to wire into a local test run; it will simply not fire.
 *
 * WHAT IT PROVES. No shop has authorized yet, so there is no call that can
 * return real data. What can be checked is the one unauthenticated-ish path
 * that exists: POST an auth_code we know is invalid at
 * auth.tiktok-shops.com/api/v2/token/get and require TikTok to answer with a
 * well-formed error of ITS own. That single round trip validates, end to end:
 *
 *   - the host is right           (a typo'd host fails DNS, not with a code)
 *   - TLS and egress work         (a blocked network fails the same way)
 *   - the request shape is right  (GET with credentials in the query string)
 *   - our parsing is right        (we read TikTok's envelope, not a transport error)
 *
 * The pass condition is deliberately "a real TikTok rejection", NOT "success":
 * an invalid auth code minting a token pair would be the alarming outcome.
 *
 * It does NOT prove anything about shop-scoped calls, signing against a live
 * shop, or response shapes. Those need a real authorization and must be tested
 * against captured responses, not guessed at.
 */
import { config as loadEnv } from 'dotenv';
import { exchangeAuthCode, TikTokError, TikTokTransientError } from '../src/lib/tiktok/client';

// Both files are optional; dotenv reports a missing one rather than throwing,
// and it never overwrites a variable that is already set in the environment.
loadEnv({ path: ['.env.local', '.env'], quiet: true });

let failures = 0;

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const APP_SECRET = process.env.TIKTOK_APP_SECRET ?? '';
const APP_KEY = process.env.TIKTOK_APP_KEY ?? '';

/**
 * Deliberately invalid and self-identifying, so that if it ever shows up in a
 * TikTok-side log it is obviously a reachability probe and not an attack.
 */
const INVALID_AUTH_CODE = `tempo-live-probe-invalid-${Date.now()}`;

async function main(): Promise<void> {
  if (!APP_KEY || !APP_SECRET) {
    console.log('tiktok live probe: SKIPPED — TIKTOK_APP_KEY / TIKTOK_APP_SECRET are not set.');
    console.log('  (expected on a dev machine: the credentials live in Vercel)');
    return;
  }

  console.log('tiktok live probe: auth.tiktok-shops.com/api/v2/token/get with an invalid auth_code');

  const started = Date.now();
  let error: unknown = null;
  let value: unknown = null;
  try {
    value = await exchangeAuthCode(INVALID_AUTH_CODE);
  } catch (err) {
    error = err;
  }
  const ms = Date.now() - started;
  console.log(`  ...answered in ${ms}ms`);

  check('an invalid auth code does NOT mint tokens', value === null, 'a token pair came back — investigate');
  check('it failed, as it must', error !== null);
  check('the failure is one of our typed errors, not a raw throw', error instanceof TikTokError, describe(error));

  const typed = error instanceof TikTokError ? error : null;

  // THE POINT OF THE WHOLE FILE. status 0 means no HTTP response was received:
  // wrong host, DNS, TLS, egress or timeout. Anything else means TikTok itself
  // answered and we parsed what it said.
  check(
    'TikTok ANSWERED — this is a vendor rejection, not a transport failure',
    typed !== null && !(typed instanceof TikTokTransientError && typed.status === 0),
    describe(error),
  );
  check(
    'the answer was well formed: a business code or a real HTTP status came back',
    typed !== null && (typeof typed.code === 'number' || typed.status >= 400),
    `code=${typed?.code} status=${typed?.status}`,
  );
  check('the round trip completed in a sane time', ms > 0 && ms < 30_000, `${ms}ms`);

  // The auth call is the one place the app secret travels in a URL (the vendor's
  // contract, see mintTokens). Prove it does not travel back out in an error.
  const message = error instanceof Error ? error.message : String(error);
  check('the error message does not leak the app secret', !message.includes(APP_SECRET), 'LEAK');
  check('the error message does not leak the app key', !message.includes(APP_KEY), 'LEAK');
  check('the error message does not leak the signed URL', !message.includes('app_secret='), 'LEAK');

  if (typed) {
    // Informational: pin these numbers into the client once they are observed,
    // so looksLikeExpiredToken() can stop matching on message text.
    console.log(`  info  TikTok replied code=${typed.code} status=${typed.status} request_id=${typed.requestId}`);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

// Unlike the offline suites, this one sets `process.exitCode` and lets Node
// drain instead of calling process.exit(): forcing exit while the keep-alive TLS
// socket to TikTok is still closing aborts the process on Windows
// ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)") and reports 127,
// which reads as a probe failure when the probe in fact passed. The connection
// pool idles out on its own a few seconds later.
main()
  .then(() => {
    if (failures > 0) console.log(`\n${failures} check(s) FAILED.`);
    process.exitCode = failures === 0 ? 0 : 1;
  })
  .catch((err: unknown) => {
    console.error('\nProbe crashed:', err);
    process.exitCode = 1;
  });
