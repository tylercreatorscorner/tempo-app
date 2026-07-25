#!/usr/bin/env tsx
/**
 * Failure-mode tests for the TikTok Shop API client.
 *
 * Run with: npx tsx scripts/test-tiktok-client.ts
 *
 * No test runner is installed in this repo, so this is a self-contained
 * assert-and-exit script in the scripts/ convention. Exits 1 if anything failed
 * so it can gate a build if wired up later.
 *
 * WHY THIS EXISTS. src/lib/tiktok/client.ts has never made a real call — no shop
 * has authorized yet — so there is no live signal on it at all. What CAN be
 * proven offline is how it behaves when the network and the vendor misbehave,
 * which is exactly where its predecessor died: it called res.json() on a 404
 * HTML body and surfaced a SyntaxError, hiding the real problem for a day.
 *
 * Every scenario stands up a real node:http server on an ephemeral port and
 * points the client at it via the `baseUrl` option (which exists for this file
 * and nothing else). Assertions are on OBSERVABLE behaviour only — which typed
 * error came back, how many requests the server actually saw, what was in those
 * requests, how long it took — never on client internals.
 *
 * The backoff constants below are DUPLICATED from client.ts on purpose, in the
 * frozen-fixture spirit of test-tiktok-signature.ts: if the retry schedule
 * changes, that must be a deliberate edit here too, not a silent drift.
 *
 * The one genuinely live check available without a shop authorization lives in
 * scripts/test-tiktok-live-probe.ts and is opt-in on credentials being present.
 */
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  TikTokClient,
  TikTokAuthError,
  TikTokPermanentError,
  TikTokRateLimitError,
  TikTokTransientError,
  type TikTokClientOptions,
  type TikTokResult,
} from '../src/lib/tiktok/client';
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

// ── fixtures ─────────────────────────────────────────────────────────────────

const APP_KEY = 'tempo_harness_app_key';
const APP_SECRET = 'tempo_harness_app_secret_MUST_NEVER_BE_LOGGED';
const ACCESS_TOKEN = 'ROW_tempo_harness_access_token_MUST_NEVER_BE_LOGGED';
const FRESH_TOKEN = 'ROW_tempo_harness_refreshed_token';
const SHOP_CIPHER = 'TTP_HARNESS_CIPHER';

/** A shop-scoped data path: shop_cipher must be injected and signed. */
const DATA_PATH = '/affiliate_creator/202405/creators';
/** Shop-AGNOSTIC paths: these are what return the cipher, so they cannot carry one. */
const AUTH_PATH = '/authorization/202309/shops';
const SELLER_PATH = '/seller/202309/shops';

/** Mirrors BASE_BACKOFF_MS in client.ts, plus its documented 2^(n-1) growth. */
const BASE_BACKOFF_MS = 500;
/** Mirrors the jitter ceiling in client.ts (Math.random() * 250). */
const JITTER_CEILING_MS = 250;

/** No scenario here should take anywhere near this; it exists so a hang FAILS instead of hanging. */
const HARNESS_DEADLINE_MS = 20_000;

const SUCCESS_ENVELOPE = {
  code: 0,
  message: 'Success',
  request_id: 'rq-harness-success',
  data: { creators: [{ id: 'c1' }], total_count: 1 },
};

/** Every error message the client threw, for the leak audit at the end. */
const thrownMessages: string[] = [];
/** Every console.warn line the client emitted, same reason. */
const warnLines: string[] = [];

const realWarn = console.warn.bind(console);
console.warn = (...args: unknown[]): void => {
  warnLines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
};

// ── local origin server ──────────────────────────────────────────────────────

interface CapturedRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: IncomingHttpHeaders;
  body: string;
}

interface ResponderContext {
  req: IncomingMessage;
  res: ServerResponse;
  /** 0-based index of this request across the scenario — i.e. the attempt number. */
  attempt: number;
  captured: CapturedRequest;
}

type Responder = (ctx: ResponderContext) => void;

interface ServerHandle {
  baseUrl: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}

function startServer(responder: Responder): Promise<ServerHandle> {
  const requests: CapturedRequest[] = [];

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('error', () => {
      /* the client aborting mid-request is a scenario, not a harness failure */
    });
    req.on('end', () => {
      // Base is a throwaway: only pathname and search are read off it.
      const url = new URL(req.url ?? '/', 'http://harness.invalid');
      const captured: CapturedRequest = {
        method: req.method ?? '',
        path: url.pathname,
        query: url.searchParams,
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      };
      const attempt = requests.length;
      requests.push(captured);
      responder({ req, res, attempt, captured });
    });
  });
  server.on('clientError', (_err, socket) => socket.destroy());

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        requests,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(payload));
}

function sendText(res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
  res.end(body);
}

// ── running one scenario ─────────────────────────────────────────────────────

class HarnessHang extends Error {}

interface Outcome {
  value: unknown;
  error: unknown;
  ms: number;
  requests: CapturedRequest[];
}

const BASE_OPTIONS: TikTokClientOptions = {
  accessToken: ACCESS_TOKEN,
  appKey: APP_KEY,
  appSecret: APP_SECRET,
  shopCipher: SHOP_CIPHER,
  timeoutMs: 5_000,
  // Off by default so every retry scenario has to ask for retries explicitly.
  maxRetries: 0,
};

async function run(
  responder: Responder,
  call: (client: TikTokClient) => Promise<unknown>,
  options: Partial<TikTokClientOptions> = {},
  deadlineMs = HARNESS_DEADLINE_MS,
): Promise<Outcome> {
  const server = await startServer(responder);
  try {
    const client = new TikTokClient({ ...BASE_OPTIONS, baseUrl: server.baseUrl, ...options });

    const started = Date.now();
    // The call is converted to a never-rejecting promise BEFORE the race, so a
    // hang that loses the race cannot resurface later as an unhandled rejection.
    const settled = call(client).then(
      (value): { value: unknown; error: unknown } => ({ value, error: null }),
      (error: unknown): { value: unknown; error: unknown } => ({ value: undefined, error }),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watchdog = new Promise<{ value: unknown; error: unknown }>((resolve) => {
      timer = setTimeout(
        () => resolve({ value: undefined, error: new HarnessHang(`call did not settle within ${deadlineMs}ms`) }),
        deadlineMs,
      );
    });
    const outcome = await Promise.race([settled, watchdog]);
    clearTimeout(timer);

    if (outcome.error instanceof Error) thrownMessages.push(outcome.error.message);
    return { ...outcome, ms: Date.now() - started, requests: server.requests };
  } finally {
    await server.close();
  }
}

function errName(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/**
 * Re-derive the signature from what the server actually received. A client that
 * signed once and replayed the first attempt's `sign` after a backoff would pass
 * a "the sign changed" check only by luck, but cannot pass this one.
 */
function recomputeSign(captured: CapturedRequest): string {
  const params: Record<string, string> = {};
  for (const [key, value] of captured.query.entries()) params[key] = value;
  return signRequest({
    appSecret: APP_SECRET,
    path: captured.path,
    params,
    body: captured.body || undefined,
    method: captured.method,
    contentType: captured.headers['content-type'],
  });
}

// ============================================================================
// Scenarios
// ============================================================================

async function main(): Promise<void> {
  // ── construction ───────────────────────────────────────────────────────────
  console.log('client: construction');
  throws('an empty accessToken is rejected up front', () => new TikTokClient({ ...BASE_OPTIONS, accessToken: '' }), 'accessToken is required');

  const savedKey = process.env.TIKTOK_APP_KEY;
  const savedSecret = process.env.TIKTOK_APP_SECRET;
  delete process.env.TIKTOK_APP_KEY;
  delete process.env.TIKTOK_APP_SECRET;
  throws(
    'missing app credentials fail loudly, naming both env vars',
    () => new TikTokClient({ accessToken: ACCESS_TOKEN }),
    'TIKTOK_APP_KEY and TIKTOK_APP_SECRET',
  );
  if (savedKey !== undefined) process.env.TIKTOK_APP_KEY = savedKey;
  if (savedSecret !== undefined) process.env.TIKTOK_APP_SECRET = savedSecret;

  // ── the happy path, so the failure cases mean something ────────────────────
  console.log('client: success path');
  {
    const r = await run(
      ({ res }) => sendJson(res, 200, SUCCESS_ENVELOPE),
      (c) => c.get(DATA_PATH, { page_size: 100, cursor: null, unset: undefined }),
    );
    const ok = r.value as TikTokResult<{ total_count: number }> | undefined;
    check('code 0 resolves rather than throwing', r.error === null, errName(r.error));
    check('the envelope data is unwrapped', ok?.data?.total_count === 1);
    check('request_id is surfaced', ok?.requestId === 'rq-harness-success');
    check('exactly one request was made', r.requests.length === 1, `${r.requests.length}`);

    const q = r.requests[0]?.query;
    check('the access token travels as a header, not a signed param', r.requests[0]?.headers['x-tts-access-token'] === ACCESS_TOKEN);
    check('...and never as a query param', q?.get('access_token') === null);
    check('app_key and timestamp are attached', q?.get('app_key') === APP_KEY && /^\d{10}$/.test(q?.get('timestamp') ?? ''));
    check('caller query params are passed through', q?.get('page_size') === '100');
    check('null query values are dropped, not sent as "null"', q?.get('cursor') === null);
    check('undefined query values are dropped', q?.get('unset') === null);
    check('the signature verifies against everything that was sent', q?.get('sign') === recomputeSign(r.requests[0]));
  }

  // ── 1. HTTP 200 carrying a business error ──────────────────────────────────
  // TikTok signals most failures this way. Treating a 200 as success is how a
  // caller ends up writing an empty result set over real data.
  console.log('failures: HTTP 200 with a business error');
  {
    const r = await run(
      ({ res }) => sendJson(res, 200, { code: 12345, message: 'shop_cipher is invalid', request_id: 'rq-biz-err' }),
      (c) => c.get(DATA_PATH),
      { maxRetries: 3 },
    );
    check('a non-zero code on HTTP 200 is an ERROR, never a success', r.error instanceof TikTokPermanentError, errName(r.error));
    const err = r.error as TikTokPermanentError;
    check('the business code is preserved for the caller', err?.code === 12345, `${err?.code}`);
    check('the HTTP status is preserved as 200', err?.status === 200, `${err?.status}`);
    check('request_id is preserved (the only handle TikTok support accepts)', err?.requestId === 'rq-biz-err');
    check("the vendor's message is in the error text", err?.message.includes('shop_cipher is invalid'));
    check('a business error is NOT retried even with retries available', r.requests.length === 1, `${r.requests.length}`);
  }
  {
    const r = await run(
      ({ res }) => sendJson(res, 200, { code: 0, message: 'Success', data: null, request_id: 'rq-null-data' }),
      (c) => c.get(DATA_PATH),
    );
    check('code 0 with a null data payload still resolves (empty is not an error)', r.error === null, errName(r.error));
  }

  // ── 2. HTML error bodies — the bug that killed the predecessor ──────────────
  console.log('failures: non-JSON (HTML) error bodies');
  {
    const html = '<html><head><title>404 Not Found</title></head><body><h1>nginx</h1></body></html>';
    const r = await run(({ res }) => sendText(res, 404, html), (c) => c.get('/affiliate_creator/202405/nope'), { maxRetries: 3 });
    check('a 404 HTML body is a typed permanent error', r.error instanceof TikTokPermanentError, errName(r.error));
    const err = r.error as TikTokPermanentError;
    check('the STATUS is what surfaces', err?.status === 404 && err.message.includes('HTTP 404'), errName(r.error));
    check('the body text is carried for diagnosis', err?.message.includes('404 Not Found'));
    check('no business code is invented for a body that had none', err?.code === null);
    check(
      'it is NOT a JSON parse error (the exact predecessor bug)',
      !/SyntaxError|Unexpected token|is not valid JSON/i.test(err?.message ?? ''),
      err?.message,
    );
    check('a 404 is not retried', r.requests.length === 1, `${r.requests.length}`);
  }
  {
    const html = '<html><body>502 Bad Gateway</body></html>';
    const r = await run(({ res }) => sendText(res, 502, html), (c) => c.get(DATA_PATH), { maxRetries: 1 });
    check('a 502 HTML body is a typed TRANSIENT error', r.error instanceof TikTokTransientError, errName(r.error));
    check('...surfacing the status and the body', (r.error as TikTokTransientError)?.message.includes('HTTP 502'));
    check('...and it was retried', r.requests.length === 2, `${r.requests.length}`);
  }
  {
    // The nastiest shape: a proxy that returns 200 and an HTML interstitial.
    const r = await run(({ res }) => sendText(res, 200, '<html>captive portal</html>'), (c) => c.get(DATA_PATH));
    check('HTTP 200 with an HTML body is an error, not a silently empty result', r.error instanceof TikTokTransientError, errName(r.error));
    check('...and says the body was not JSON', (r.error as TikTokTransientError)?.message.includes('non-JSON body'));
  }
  {
    const r = await run(({ res }) => sendJson(res, 200, [1, 2, 3]), (c) => c.get(DATA_PATH));
    check('valid JSON that is not an envelope is rejected, not cast', r.error instanceof TikTokTransientError, errName(r.error));
  }
  {
    const r = await run(({ res }) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(''); }, (c) => c.get(DATA_PATH));
    check('an empty 200 body is an error, not an empty success', r.error instanceof TikTokTransientError, errName(r.error));
  }

  // ── 3. 429 rate limiting ───────────────────────────────────────────────────
  console.log('failures: 429 rate limiting');
  {
    // Retry-After: 1 also guarantees the retry lands in a LATER unix second,
    // which is what makes the timestamp-freshness assertion below deterministic.
    const r = await run(
      ({ res }) => sendJson(res, 429, { code: 105_002, message: 'rate limit exceeded', request_id: 'rq-429' }, { 'retry-after': '1' }),
      (c) => c.get(DATA_PATH),
      { maxRetries: 1 },
    );
    check('a 429 is a typed rate-limit error', r.error instanceof TikTokRateLimitError, errName(r.error));
    check('Retry-After is parsed to ms', (r.error as TikTokRateLimitError)?.retryAfterMs === 1000, `${(r.error as TikTokRateLimitError)?.retryAfterMs}`);
    check('the server actually saw more than one attempt', r.requests.length === 2, `${r.requests.length}`);
    check(
      'Retry-After was HONORED — the wait was ~1000ms, not the 500ms base backoff',
      r.ms >= 950 && r.ms < 3_000,
      `${r.ms}ms`,
    );

    // ── 9. a fresh signature and timestamp per attempt ───────────────────────
    // The predecessor signed once and replayed a stale timestamp after the
    // backoff, which TikTok rejects outright.
    const [first, second] = r.requests;
    check(
      'each attempt carries a FRESH timestamp',
      first.query.get('timestamp') !== second.query.get('timestamp'),
      `${first.query.get('timestamp')} vs ${second.query.get('timestamp')}`,
    );
    check(
      '...and therefore a fresh signature',
      first.query.get('sign') !== second.query.get('sign'),
    );
    check('attempt 1 signature verifies against attempt 1 params', first.query.get('sign') === recomputeSign(first));
    check(
      'attempt 2 signature verifies against attempt 2 params (a replayed sign fails here)',
      second.query.get('sign') === recomputeSign(second),
    );
  }
  {
    const r = await run(
      ({ res }) => sendJson(res, 429, { code: 105_002, message: 'rate limit exceeded' }),
      (c) => c.get(DATA_PATH),
      { maxRetries: 1 },
    );
    check('a 429 without Retry-After still retries', r.requests.length === 2, `${r.requests.length}`);
    check('...with retryAfterMs left null rather than guessed', (r.error as TikTokRateLimitError)?.retryAfterMs === null);
    check(
      '...falling back to the base backoff',
      r.ms >= BASE_BACKOFF_MS - 50 && r.ms < BASE_BACKOFF_MS + JITTER_CEILING_MS + 1_500,
      `${r.ms}ms`,
    );
  }
  {
    const r = await run(
      ({ res, attempt }) =>
        attempt === 0
          ? sendJson(res, 429, { code: 105_002, message: 'rate limit exceeded' })
          : sendJson(res, 200, SUCCESS_ENVELOPE),
      (c) => c.get(DATA_PATH),
      { maxRetries: 2 },
    );
    check('a 429 that clears resolves on the retry', r.error === null, errName(r.error));
    check('...after exactly two attempts', r.requests.length === 2, `${r.requests.length}`);
  }

  // ── 4. 5xx retried, 4xx not ────────────────────────────────────────────────
  console.log('failures: 5xx retries, 4xx does not');
  {
    const r = await run(
      ({ res }) => sendJson(res, 503, { code: 0, message: 'service unavailable' }),
      (c) => c.get(DATA_PATH),
      { maxRetries: 3 },
    );
    check('a 503 is transient', r.error instanceof TikTokTransientError, errName(r.error));
    check('maxRetries=3 means 4 attempts total, then it gives up', r.requests.length === 4, `${r.requests.length}`);
    // 500 + 1000 + 2000 = 3500ms of documented exponential backoff. A constant
    // 500ms schedule would land near 1500ms and fail this.
    const floor = BASE_BACKOFF_MS * (1 + 2 + 4);
    check(
      'the backoff GROWS exponentially between attempts',
      r.ms >= floor - 100 && r.ms < floor + 3 * JITTER_CEILING_MS + 2_000,
      `${r.ms}ms, expected ~${floor}ms`,
    );
  }
  {
    const r = await run(({ res }) => sendText(res, 500, 'boom'), (c) => c.get(DATA_PATH), { maxRetries: 1 });
    check('a 500 is retried', r.requests.length === 2, `${r.requests.length}`);
    check('...and ends as a transient error', r.error instanceof TikTokTransientError, errName(r.error));
  }
  {
    const r = await run(
      ({ res }) => sendJson(res, 400, { code: 10_001, message: 'invalid parameter', request_id: 'rq-400' }),
      (c) => c.get(DATA_PATH),
      { maxRetries: 3 },
    );
    check('a 400 is PERMANENT', r.error instanceof TikTokPermanentError, errName(r.error));
    check('...and is not retried', r.requests.length === 1, `${r.requests.length}`);
    check('...keeping the business code from the body', (r.error as TikTokPermanentError)?.code === 10_001);
  }
  {
    const r = await run(
      ({ res }) => sendJson(res, 403, { code: 10_005, message: 'missing scope' }),
      (c) => c.get(DATA_PATH),
      { maxRetries: 3 },
    );
    check('a 403 is PERMANENT', r.error instanceof TikTokPermanentError, errName(r.error));
    check('...and is not retried (a missing scope never fixes itself)', r.requests.length === 1, `${r.requests.length}`);
  }
  {
    const r = await run(
      ({ res, attempt }) => (attempt < 2 ? sendText(res, 503, 'boom') : sendJson(res, 200, SUCCESS_ENVELOPE)),
      (c) => c.get(DATA_PATH),
      { maxRetries: 3 },
    );
    check('a 5xx that clears resolves without surfacing an error', r.error === null, errName(r.error));
    check('...after exactly three attempts', r.requests.length === 3, `${r.requests.length}`);
  }

  // ── 5. network failure ─────────────────────────────────────────────────────
  console.log('failures: network');
  {
    const r = await run(({ req }) => req.socket.destroy(), (c) => c.get(DATA_PATH), { maxRetries: 2 });
    check('a socket destroyed mid-response is a typed transient error', r.error instanceof TikTokTransientError, errName(r.error));
    check('...with status 0, since no HTTP status was ever received', (r.error as TikTokTransientError)?.status === 0);
    check('...retried up to the cap', r.requests.length === 3, `${r.requests.length}`);
    check(
      '...and the message names the path, never the signed URL',
      (r.error as TikTokTransientError)?.message.includes(DATA_PATH),
      errName(r.error),
    );
  }
  {
    const r = await run(
      ({ req, res, attempt }) => (attempt === 0 ? req.socket.destroy() : sendJson(res, 200, SUCCESS_ENVELOPE)),
      (c) => c.get(DATA_PATH),
      { maxRetries: 2 },
    );
    check('a one-off network blip recovers on the retry', r.error === null, errName(r.error));
  }
  {
    // Headers arrive, then the body is cut off. The status was real and must
    // survive: downgrading a truncated 404 to a transient error would have the
    // client retry a call that can only ever 404.
    const r = await run(
      ({ req, res }) => {
        res.writeHead(404, { 'Content-Type': 'application/json', 'Content-Length': '5000' });
        res.write('{"code":10000,"message":"not fo');
        setTimeout(() => req.socket.destroy(), 25);
      },
      (c) => c.get('/affiliate_creator/202405/nope'),
      { maxRetries: 3 },
    );
    check('a TRUNCATED error body keeps its HTTP status', r.error instanceof TikTokPermanentError, errName(r.error));
    check('...as a 404, not a retryable transport failure', (r.error as TikTokPermanentError)?.status === 404);
    check('...and is therefore not retried', r.requests.length === 1, `${r.requests.length}`);
  }

  // ── 6. timeouts ────────────────────────────────────────────────────────────
  console.log('failures: timeout');
  {
    const timeoutMs = 800;
    const r = await run(() => { /* never respond */ }, (c) => c.get(DATA_PATH), { timeoutMs, maxRetries: 0 }, 10_000);
    check('a server that never responds aborts rather than hanging', r.error instanceof TikTokTransientError, errName(r.error));
    check('...as a timeout, named as one', (r.error as TikTokTransientError)?.message.includes('timed out'), errName(r.error));
    check(
      '...at the configured deadline, not far beyond it',
      r.ms >= timeoutMs * 0.8 && r.ms < timeoutMs + 2_000,
      `${r.ms}ms for a ${timeoutMs}ms timeout`,
    );
  }
  {
    // fetch() resolves the moment headers arrive, so a deadline that only covers
    // the headers leaves the BODY read unbounded — an open socket that dribbles
    // is the classic way a "30s timeout" becomes an infinite one.
    const timeoutMs = 800;
    const r = await run(
      ({ res }) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write('{"code":0,"message":"Success","data":{"creators":');
        // ...and then nothing, forever.
      },
      (c) => c.get(DATA_PATH),
      { timeoutMs, maxRetries: 0 },
      10_000,
    );
    check('a server that stalls MID-BODY also aborts', !(r.error instanceof HarnessHang), errName(r.error));
    check('...as a typed transient error', r.error instanceof TikTokTransientError, errName(r.error));
    check(
      '...at the configured deadline, not far beyond it',
      r.ms >= timeoutMs * 0.8 && r.ms < timeoutMs + 2_000,
      `${r.ms}ms for a ${timeoutMs}ms timeout`,
    );
  }
  {
    const timeoutMs = 400;
    const r = await run(() => { /* never respond */ }, (c) => c.get(DATA_PATH), { timeoutMs, maxRetries: 1 }, 10_000);
    check('a timeout is retried like any other transient failure', r.requests.length === 2, `${r.requests.length}`);
    check(
      '...with the deadline applied per attempt, not once for the whole call',
      r.ms >= timeoutMs * 2 && r.ms < timeoutMs * 2 + BASE_BACKOFF_MS + JITTER_CEILING_MS + 2_000,
      `${r.ms}ms`,
    );
  }

  // ── 7. writes are not retried unless the caller says they are ──────────────
  // A retried POST can double-create a collaboration or a campaign. This is the
  // difference between an outage and an outage plus a cleanup job.
  console.log('writes: retry is opt-in');
  {
    const body = { creator_ids: ['c1', 'c2'], invitation_note: 'join us' };
    const r = await run(
      ({ res }) => sendText(res, 503, 'boom'),
      (c) => c.post('/affiliate_creator/202405/open_collaborations', { body }),
      { maxRetries: 3 },
    );
    check('a POST is NOT retried by default', r.requests.length === 1, `${r.requests.length}`);
    check('...and still fails as a transient error', r.error instanceof TikTokTransientError, errName(r.error));
  }
  {
    const body = { creator_ids: ['c1'] };
    const r = await run(
      ({ res, attempt }) => (attempt === 0 ? sendText(res, 503, 'boom') : sendJson(res, 200, SUCCESS_ENVELOPE)),
      (c) => c.post('/affiliate_creator/202405/open_collaborations', { body, idempotent: true }),
      { maxRetries: 1 },
    );
    check('a POST marked idempotent IS retried', r.requests.length === 2, `${r.requests.length}`);
    check('...and can succeed on the retry', r.error === null, errName(r.error));

    const sent = r.requests[1];
    check('the JSON body is actually sent', sent.body === JSON.stringify(body), sent.body);
    check('...with a JSON Content-Type', sent.headers['content-type'] === 'application/json');
    check('...and the body participates in the signature', sent.query.get('sign') === recomputeSign(sent));
    check(
      'the retried body is byte-identical to the first attempt (a re-serialized body would resign differently)',
      r.requests[0].body === r.requests[1].body,
    );
  }
  {
    const r = await run(
      ({ res }) => sendText(res, 503, 'boom'),
      (c) => c.request('DELETE', '/affiliate_creator/202405/open_collaborations', {}),
      { maxRetries: 3 },
    );
    check('DELETE is not retried by default either', r.requests.length === 1, `${r.requests.length}`);
  }

  // ── 8. expired token ───────────────────────────────────────────────────────
  console.log('auth: expired token refresh');
  {
    let hookCalls = 0;
    const r = await run(
      ({ res }) => sendJson(res, 401, { code: 105_000, message: 'access token is invalid', request_id: 'rq-401' }),
      (c) => c.get(DATA_PATH),
      {
        maxRetries: 3,
        onTokenExpired: async () => {
          hookCalls += 1;
          return FRESH_TOKEN;
        },
      },
    );
    check('a 401 is a typed auth error', r.error instanceof TikTokAuthError, errName(r.error));
    check('onTokenExpired fired EXACTLY once', hookCalls === 1, `${hookCalls}`);
    check('...and the call was retried exactly once — no loop', r.requests.length === 2, `${r.requests.length}`);
    check('the first attempt used the original token', r.requests[0].headers['x-tts-access-token'] === ACCESS_TOKEN);
    check('the retry used the REFRESHED token', r.requests[1].headers['x-tts-access-token'] === FRESH_TOKEN);
    check('the retry is re-signed for its own timestamp', r.requests[1].query.get('sign') === recomputeSign(r.requests[1]));
  }
  {
    let hookCalls = 0;
    const r = await run(
      ({ res, attempt }) =>
        attempt === 0
          ? // The realistic shape: HTTP 200 with an expired-token business code.
            sendJson(res, 200, { code: 105_000, message: 'Access token is expired', request_id: 'rq-expired' })
          : sendJson(res, 200, SUCCESS_ENVELOPE),
      (c) => c.get(DATA_PATH),
      {
        onTokenExpired: async () => {
          hookCalls += 1;
          return FRESH_TOKEN;
        },
      },
    );
    check('an expired token reported as HTTP 200 + code also triggers the refresh', hookCalls === 1, `${hookCalls}`);
    check('...and the refreshed call resolves', r.error === null, errName(r.error));
    check('...in two attempts', r.requests.length === 2, `${r.requests.length}`);
  }
  {
    let hookCalls = 0;
    const r = await run(
      ({ res }) => sendJson(res, 401, { code: 105_000, message: 'access token is invalid' }),
      (c) => c.get(DATA_PATH),
      {
        onTokenExpired: async () => {
          hookCalls += 1;
          return null;
        },
      },
    );
    check('a refresh hook returning null gives up immediately', r.requests.length === 1, `${r.requests.length}`);
    check('...calling the hook once', hookCalls === 1, `${hookCalls}`);
    check('...and surfacing the original auth error', r.error instanceof TikTokAuthError, errName(r.error));
  }
  {
    const r = await run(
      ({ res }) => sendJson(res, 401, { code: 105_000, message: 'access token is invalid' }),
      (c) => c.get(DATA_PATH),
      { maxRetries: 3 },
    );
    check('with no refresh hook a 401 fails on the first attempt', r.requests.length === 1, `${r.requests.length}`);
    check('...as an auth error, not a transient one', r.error instanceof TikTokAuthError, errName(r.error));
  }

  // ── 10. shop_cipher injection ──────────────────────────────────────────────
  console.log('scoping: shop_cipher injection');
  {
    const r = await run(({ res }) => sendJson(res, 200, SUCCESS_ENVELOPE), (c) => c.get(DATA_PATH));
    check('a shop-scoped path carries shop_cipher', r.requests[0].query.get('shop_cipher') === SHOP_CIPHER);
    check('...and it is inside the signature', r.requests[0].query.get('sign') === recomputeSign(r.requests[0]));
    check('shop_id is NOT sent (rejected by the 202309+ endpoints)', r.requests[0].query.get('shop_id') === null);
  }
  {
    const r = await run(({ res }) => sendJson(res, 200, SUCCESS_ENVELOPE), (c) => c.get(AUTH_PATH));
    check('the /authorization call that FETCHES the cipher does not carry one', r.requests[0].query.get('shop_cipher') === null);
    check('...and still signs correctly without it', r.requests[0].query.get('sign') === recomputeSign(r.requests[0]));
  }
  {
    const r = await run(({ res }) => sendJson(res, 200, SUCCESS_ENVELOPE), (c) => c.get(SELLER_PATH));
    check('/seller/{version}/ is shop-agnostic too', r.requests[0].query.get('shop_cipher') === null);
  }
  {
    // The exclusion is anchored and version-shaped on purpose: a lookalike path
    // must NOT lose its shop scope, or the call silently reads the wrong shop.
    const r = await run(({ res }) => sendJson(res, 200, SUCCESS_ENVELOPE), (c) => c.get('/api/authorization/202309/shops'));
    check('a non-leading "authorization" segment still carries the cipher', r.requests[0].query.get('shop_cipher') === SHOP_CIPHER);
  }
  {
    const r = await run(({ res }) => sendJson(res, 200, SUCCESS_ENVELOPE), (c) => c.get('/authorization/2023/shops'));
    check('a non-version-shaped segment still carries the cipher', r.requests[0].query.get('shop_cipher') === SHOP_CIPHER);
  }
  {
    const r = await run(({ res }) => sendJson(res, 200, SUCCESS_ENVELOPE), (c) => c.get(DATA_PATH), { shopCipher: undefined });
    check('a client with no cipher configured sends none', r.requests[0].query.get('shop_cipher') === null);
  }

  // ── 11. nothing leaks ──────────────────────────────────────────────────────
  // Every message above was collected as it was thrown, and every console.warn
  // the client emitted was captured. Audit the lot in one pass.
  console.log('leaks: credentials never reach an error message or a log line');
  check(
    'the audit has errors to audit (otherwise it proves nothing)',
    thrownMessages.length >= 20,
    `${thrownMessages.length} messages`,
  );
  check(
    'the audit has retry logs to audit (otherwise it proves nothing)',
    warnLines.length >= 5,
    `${warnLines.length} lines`,
  );

  const needles: Array<[string, string]> = [
    ['the app secret', APP_SECRET],
    ['the access token', ACCESS_TOKEN],
    ['a refreshed access token', FRESH_TOKEN],
    ['app_key= (i.e. a signed query string)', 'app_key='],
    ['sign= (i.e. a signed query string)', 'sign='],
    ['the request host', '127.0.0.1'],
  ];
  for (const [label, needle] of needles) {
    const leakedThrow = thrownMessages.find((m) => m.includes(needle));
    check(`no thrown error message contains ${label}`, leakedThrow === undefined, leakedThrow);
    const leakedLog = warnLines.find((l) => l.includes(needle));
    check(`no log line contains ${label}`, leakedLog === undefined, leakedLog);
  }
  check(
    'retry logs still identify the call by method and path',
    warnLines.every((l) => l.includes('[tiktok]')) && warnLines.some((l) => l.includes(DATA_PATH)),
    warnLines[0],
  );
}

main()
  .then(() => {
    console.warn = realWarn;
    console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((err: unknown) => {
    console.warn = realWarn;
    console.error('\nHarness crashed:', err);
    process.exit(1);
  });
