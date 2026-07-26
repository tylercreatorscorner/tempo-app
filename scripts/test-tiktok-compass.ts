#!/usr/bin/env tsx
/**
 * Lifecycle + format-detection tests for the Compass offline-export path.
 *
 * Run with: npx tsx scripts/test-tiktok-compass.ts
 *
 * No test runner is installed in this repo, so this is a self-contained
 * assert-and-exit script in the scripts/ convention (same shape as
 * scripts/test-tiktok-client.ts). Exits 1 if anything failed.
 *
 * WHY THIS EXISTS. No TikTok shop has authorized, so src/lib/tiktok/compass.ts
 * has never made a real call and the artifact format is UNVERIFIED — TikTok's
 * docs never state what the downloaded file is, and their example payload for
 * it is the dummy string "ssssssssssssssaaaaaaaaaaa". What CAN be proven
 * offline is the part that matters most: that the pipeline REFUSES anything it
 * cannot identify, instead of parsing hopefully. Every scenario below stands up
 * a real node:http server and points the client at it via `baseUrl`.
 *
 * The two "must fail" scenarios are the reason for the file:
 *   - a base64 payload that is not a zip → rejected WITH its magic bytes
 *   - a real zip whose headers are a DIFFERENT report → rejected loudly
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as XLSX from 'xlsx';
import { TikTokClient, type TikTokClientOptions } from '../src/lib/tiktok/client';
import {
  assertReportMatchesModule,
  classifyTaskStatus,
  createExportTask,
  decodeBase64File,
  detectFileFormat,
  downloadTaskFile,
  fetchDailyExport,
  marketToday,
  marketYesterday,
  planDailyBackfill,
  pollTask,
  toEndDay,
} from '../src/lib/tiktok/compass';
import { extractHeaderRow } from '../src/lib/upload/type-sniff';

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

const APP_KEY = 'tempo_compass_app_key';
const APP_SECRET = 'tempo_compass_app_secret_MUST_NEVER_BE_LOGGED';
const ACCESS_TOKEN = 'ROW_tempo_compass_access_token_MUST_NEVER_BE_LOGGED';
const SHOP_CIPHER = 'TTP_COMPASS_CIPHER';
const TASK_ID = 'compass-task-0001';
const OTHER_TASK_ID = 'compass-task-SOMEONE-ELSES';

const BASE_OPTIONS: TikTokClientOptions = {
  accessToken: ACCESS_TOKEN,
  appKey: APP_KEY,
  appSecret: APP_SECRET,
  shopCipher: SHOP_CIPHER,
  timeoutMs: 5_000,
  maxRetries: 0,
};

/** Instant sleeps + a synthetic clock, so the poll ceiling is provable in ms
 *  rather than by actually waiting 40 seconds. */
function fakeTimekeeper(msPerPoll = 5_000): { sleep: (ms: number) => Promise<void>; now: () => number; slept: number[] } {
  let clock = 1_000_000;
  const slept: number[] = [];
  return {
    slept,
    sleep: async (ms: number) => {
      slept.push(ms);
      clock += Math.max(ms, msPerPoll);
    },
    now: () => clock,
  };
}

/** The real column headers of a TikTok Creator Data export (mig 120 verified
 *  strings), plus TikTok's definitions row, which every export carries. */
const CREATOR_HEADERS = [
  'Creator name', 'Creator-attributed GMV', 'Refunds', 'Attributed orders',
  'Creator-attributed items sold', 'Items refunded', 'AOV', 'Videos', 'Live streams',
  'Est. commission', 'Samples shipped', 'Est. flat fee', 'Creator video-attributed GMV',
  'Creator live-attributed GMV', 'Affiliate product card-attributed GMV', 'CTOR', 'CTR',
  'Total sample content', 'Products added to showcase', 'Product impressions', 'Video views',
  'Customers', 'Products sold',
];

const VIDEO_HEADERS = [
  'Video title', 'Video ID', 'Post date', 'Video link', 'Creator name', 'Product ID',
  'Creator video-attributed GMV', 'Video-attributed orders', 'AOV', 'Avg. GMV per customer',
  'Video-attributed items sold', 'Refunds', 'Items refunded', 'Est. commission', 'Est. flat fee',
  'Video views', 'Likes', 'Comments', 'Shares', 'Video product impressions',
  'Video product clicks', 'Completion rate', 'CTR', 'Engagement', 'Video GPM',
];

/** Build a REAL xlsx (a real zip) in memory, so the zip magic bytes and the
 *  header sniff are exercised against genuine bytes, not a mock. */
function buildWorkbook(headers: string[], dataRow: string[]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([headers, dataRow]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const CREATOR_WORKBOOK = buildWorkbook(CREATOR_HEADERS, ['tempocreator', '$1,234.56', '$0.00', '12']);
const VIDEO_WORKBOOK = buildWorkbook(VIDEO_HEADERS, ['a video', '7412345678901234567', '2026-07-25']);

// ── mock origin ──────────────────────────────────────────────────────────────

interface CapturedRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: string;
}

type Responder = (ctx: { res: ServerResponse; req: IncomingMessage; captured: CapturedRequest; hits: number }) => void;

interface ServerHandle {
  baseUrl: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}

function startServer(responder: Responder): Promise<ServerHandle> {
  const requests: CapturedRequest[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('error', () => { /* client aborts are scenarios, not harness failures */ });
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://harness.invalid');
      const captured: CapturedRequest = {
        method: req.method ?? '',
        path: url.pathname,
        query: url.searchParams,
        body: Buffer.concat(chunks).toString('utf8'),
      };
      const hits = requests.length;
      requests.push(captured);
      responder({ res, req, captured, hits });
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

function sendJson(res: ServerResponse, payload: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function envelope(data: unknown, requestId = 'rq-compass'): unknown {
  return { code: 0, message: 'Success', request_id: requestId, data };
}

/**
 * A stateful mock of the whole Compass surface. `statuses` is consumed one entry
 * per poll, which is how the RUNNING→SUCCEEDED transition is driven.
 */
interface MockOptions {
  statuses?: string[];
  fileBase64?: string | null | undefined;
  fileKey?: string;
  docType?: string;
  omitTaskFromList?: boolean;
  extraTasks?: boolean;
}

function compassResponder(options: MockOptions = {}): Responder {
  const statuses = [...(options.statuses ?? ['SUCCEEDED'])];
  let polls = 0;
  return ({ res, captured }) => {
    if (captured.path.endsWith('/compass/offline_task') && captured.method === 'POST') {
      sendJson(res, envelope({ task_id: TASK_ID, module_type: options.docType ?? 'CREATOR' }));
      return;
    }
    if (captured.path.endsWith('/compass/offline_tasks') && captured.method === 'GET') {
      const status = statuses[Math.min(polls, statuses.length - 1)];
      polls += 1;
      const ours = {
        task_id: TASK_ID,
        status,
        doc_type: options.docType ?? 'CREATOR',
        window_type: 'PAST_24H',
        end_day: '20260725',
        file_name: 'Creator_Data_20260725.xlsx',
      };
      // A neighbour task that is ALWAYS succeeded and ALWAYS first. Anything
      // that picks positionally instead of by id grabs this one.
      const decoy = { task_id: OTHER_TASK_ID, status: 'SUCCEEDED', doc_type: 'PRODUCT' };
      const list = options.omitTaskFromList ? [decoy] : options.extraTasks ? [decoy, ours] : [ours];
      sendJson(res, envelope({ offline_tasks: list }));
      return;
    }
    if (captured.path.includes('/compass/offline_tasks/') && captured.path.endsWith('/file')) {
      const key = options.fileKey ?? 'base64';
      const file: Record<string, unknown> = { file_name: 'Creator_Data_20260725.xlsx' };
      if (options.fileBase64 !== undefined) file[key] = options.fileBase64;
      sendJson(res, envelope({ file }));
      return;
    }
    sendJson(res, { code: 404_000, message: `unmocked path ${captured.path}` }, 404);
  };
}

async function withServer<T>(responder: Responder, fn: (client: TikTokClient, server: ServerHandle) => Promise<T>): Promise<T> {
  const server = await startServer(responder);
  try {
    return await fn(new TikTokClient({ ...BASE_OPTIONS, baseUrl: server.baseUrl }), server);
  } finally {
    await server.close();
  }
}

// ============================================================================

async function main(): Promise<void> {
  // ── market-local end_day ───────────────────────────────────────────────────
  // A naive UTC "yesterday" requests the WRONG DAY for up to 8 hours a night.
  console.log('dates: end_day is market-local, not UTC');
  {
    // 03:00 UTC on the 26th is still 19:00 on the 25th in Los Angeles.
    const at0300Utc = new Date('2026-07-26T03:00:00Z');
    check('market "today" trails UTC after midnight UTC', marketToday(at0300Utc) === '2026-07-25', marketToday(at0300Utc));
    check(
      '...so market "yesterday" is the 24th, NOT the UTC-naive 25th',
      marketYesterday(at0300Utc) === '2026-07-24',
      marketYesterday(at0300Utc),
    );
    const at1800Utc = new Date('2026-07-26T18:00:00Z');
    check('later the same UTC day the market has caught up', marketToday(at1800Utc) === '2026-07-26', marketToday(at1800Utc));
    check('end_day is the YYYYMMDD integer', toEndDay('2026-07-25') === 20260725, String(toEndDay('2026-07-25')));
    throws('a malformed date is refused rather than coerced', () => toEndDay('25/07/2026'), 'YYYY-MM-DD');
    throws('...including an empty string', () => toEndDay(''), 'YYYY-MM-DD');
  }

  // ── no arbitrary range ─────────────────────────────────────────────────────
  console.log('dates: a backfill is N daily tasks, not a range');
  {
    const plan = planDailyBackfill('2026-07-20', '2026-07-24');
    check('a 5-day backfill plans 5 separate tasks', plan.taskCount === 5, String(plan.taskCount));
    check('...enumerated explicitly', plan.dates[0] === '2026-07-20' && plan.dates[4] === '2026-07-24', plan.dates.join(','));
    check('...and says out loud that no range parameter exists', plan.note.includes('no start..end range'));
    throws('an oversized backfill refuses rather than silently firing hundreds of tasks', () => planDailyBackfill('2020-01-01', '2026-01-01'), 'separate daily tasks');
    throws('a reversed range is refused', () => planDailyBackfill('2026-07-24', '2026-07-20'), 'is after end');
  }

  // ── status vocabulary ──────────────────────────────────────────────────────
  console.log('status: an unknown status is never read as success');
  {
    check('SUCCEEDED / SUCCESS both succeed', classifyTaskStatus('SUCCEEDED') === 'succeeded' && classifyTaskStatus('success') === 'succeeded');
    check('FAILED / EXPIRED both fail', classifyTaskStatus('FAILED') === 'failed' && classifyTaskStatus('EXPIRED') === 'failed');
    check('RUNNING is pending', classifyTaskStatus('RUNNING') === 'pending');
    check('an unfamiliar status is "unrecognized", NOT success', classifyTaskStatus('WEIRD_NEW_STATE') === 'unrecognized');
    check('an absent status is "unrecognized", NOT success', classifyTaskStatus(null) === 'unrecognized');
  }

  // ── 1. happy path ──────────────────────────────────────────────────────────
  console.log('lifecycle: create → SUCCEEDED → download (happy path)');
  {
    await withServer(compassResponder({ fileBase64: CREATOR_WORKBOOK.toString('base64'), extraTasks: true }), async (client, server) => {
      const created = await createExportTask(client, { moduleType: 'CREATOR', reportDate: '2026-07-25' });
      check('create returns the task id', created.taskId === TASK_ID, created.taskId);
      check('...and reads back what the API says it built', created.echo.moduleType === 'CREATOR', String(created.echo.moduleType));

      const sent = JSON.parse(server.requests[0].body) as Record<string, unknown>;
      check('create sends module_type (not doc_type)', sent.module_type === 'CREATOR', JSON.stringify(sent));
      check('...and window_type', sent.window_type === 'PAST_24H');
      check('...and end_day as a YYYYMMDD integer', sent.end_day === 20260725, String(sent.end_day));
      check('...and plan_type', sent.plan_type === 'ALL');
      check('the call is shop-scoped', server.requests[0].query.get('shop_cipher') === SHOP_CIPHER);

      const timing = fakeTimekeeper();
      const outcome = await pollTask(client, TASK_ID, { sleep: timing.sleep, now: timing.now });
      check('the poll resolves succeeded', outcome.state === 'succeeded', outcome.state);
      check('...after exactly one poll', outcome.polls === 1, String(outcome.polls));
      check(
        '...having selected OUR task by id, not the succeeded decoy that sorts first',
        outcome.state === 'succeeded' && outcome.task.taskId === TASK_ID,
        outcome.state === 'succeeded' ? outcome.task.taskId : outcome.state,
      );
      check(
        'the list call sends no doc_type filter (which could exclude our own task)',
        server.requests[1].query.get('doc_type') === null,
      );

      const download = await downloadTaskFile(client, TASK_ID);
      check('the download succeeds', download.ok === true, download.ok ? '' : download.message);
      if (download.ok) {
        check('...returning raw bytes', download.result.bytes.length === CREATOR_WORKBOOK.length, String(download.result.bytes.length));
        check('...identified as a zip', download.result.format.kind === 'zip', download.result.format.kind);
        check('...and therefore a workbook candidate', download.result.format.isWorkbookCandidate === true);
        check('...with the zip magic reported', download.result.format.magicHex.startsWith('50 4b 03 04'), download.result.format.magicHex);
        check('...and the file name read back', download.result.echo.fileName === 'Creator_Data_20260725.xlsx');
      }
    });
  }

  // ── 2. RUNNING → SUCCEEDED ─────────────────────────────────────────────────
  console.log('lifecycle: RUNNING → RUNNING → SUCCEEDED');
  {
    await withServer(compassResponder({ statuses: ['RUNNING', 'RUNNING', 'SUCCEEDED'] }), async (client) => {
      const timing = fakeTimekeeper(0);
      const outcome = await pollTask(client, TASK_ID, { sleep: timing.sleep, now: timing.now, initialDelayMs: 100, maxDelayMs: 400 });
      check('it waits through RUNNING and resolves on SUCCEEDED', outcome.state === 'succeeded', outcome.state);
      check('...after exactly three polls', outcome.polls === 3, String(outcome.polls));
      check('...backing off between them rather than hammering', timing.slept.length === 3 && timing.slept[1] > timing.slept[0], timing.slept.join(','));
      check('...with the backoff capped', timing.slept.every((ms) => ms <= 400), timing.slept.join(','));
    });
  }

  // ── 3. FAILED task ─────────────────────────────────────────────────────────
  console.log('lifecycle: a FAILED task stops immediately');
  {
    await withServer(compassResponder({ statuses: ['RUNNING', 'FAILED', 'SUCCEEDED'] }), async (client, server) => {
      const timing = fakeTimekeeper(0);
      const outcome = await pollTask(client, TASK_ID, { sleep: timing.sleep, now: timing.now });
      check('a FAILED task is a failure, not a timeout', outcome.state === 'failed', outcome.state);
      check('...reported with the raw TikTok status', outcome.state === 'failed' && outcome.message.includes('FAILED'), outcome.state === 'failed' ? outcome.message : '');
      check('...saying explicitly that nothing was written', outcome.state === 'failed' && outcome.message.includes('nothing was written'));
      check('...and it stops polling at once rather than waiting for a later SUCCEEDED', outcome.polls === 2, String(outcome.polls));
      check('...making no further requests', server.requests.length === 2, String(server.requests.length));
    });
  }

  // ── 4. poll ceiling ────────────────────────────────────────────────────────
  console.log('lifecycle: the poll loop is bounded, twice over');
  {
    await withServer(compassResponder({ statuses: ['RUNNING'] }), async (client, server) => {
      const timing = fakeTimekeeper(5_000);
      const outcome = await pollTask(client, TASK_ID, { sleep: timing.sleep, now: timing.now, budgetMs: 40_000, maxPolls: 12 });
      check('a task that never finishes ends as a TIMEOUT, not a success', outcome.state === 'timeout', outcome.state);
      // 7 polls: the backoff schedule (2s, 3s, 4.5s, 6.75s, then capped at 8s)
      // against a clock advancing >= 5s per poll exhausts the 40s budget there.
      check('...bounded by the wall-clock budget', outcome.polls === 7, `${outcome.polls} polls`);
      check('...i.e. the CLOCK stopped it, before the poll cap of 12', outcome.polls < 12, `${outcome.polls} polls`);
      check('...reporting the last status it kept seeing', outcome.state === 'timeout' && outcome.message.includes('RUNNING'));
      check('...and saying the task id is recorded', outcome.state === 'timeout' && outcome.message.includes('task id is recorded'));
      check('the server saw exactly that many polls — no runaway loop', server.requests.length === 7, String(server.requests.length));
    });
    // The second ceiling: a clock that does not advance must still terminate.
    await withServer(compassResponder({ statuses: ['RUNNING'] }), async (client, server) => {
      const frozen = { sleep: async () => {}, now: () => 5_000 };
      const outcome = await pollTask(client, TASK_ID, { ...frozen, budgetMs: 40_000, maxPolls: 4 });
      check('a FROZEN clock still terminates, on the poll cap', outcome.state === 'timeout', outcome.state);
      check('...at exactly maxPolls', server.requests.length === 4, String(server.requests.length));
    });
    // A task that never appears is a different diagnosis from one that stalls.
    await withServer(compassResponder({ omitTaskFromList: true }), async (client) => {
      const timing = fakeTimekeeper(20_000);
      const outcome = await pollTask(client, TASK_ID, { sleep: timing.sleep, now: timing.now, maxPolls: 3 });
      check('a task absent from the list times out rather than matching a neighbour', outcome.state === 'timeout', outcome.state);
      check('...saying it never appeared', outcome.state === 'timeout' && outcome.message.includes('never appeared'));
      check('...and that the list cannot be scanned', outcome.state === 'timeout' && outcome.message.includes('cannot be found by scanning'));
    });
  }

  // ── 5. the payload is NOT a zip ────────────────────────────────────────────
  // The headline case. The docs' own example file payload is the dummy string
  // "ssssssssssssssaaaaaaaaaaa"; a hopeful parse of that is the whole failure
  // mode this module exists to prevent.
  console.log('format: a base64 payload that is not a zip is REFUSED');
  {
    const dummy = Buffer.from('ssssssssssssssaaaaaaaaaaa', 'utf8').toString('base64');
    await withServer(compassResponder({ fileBase64: dummy }), async (client) => {
      const download = await downloadTaskFile(client, TASK_ID);
      check("the docs' dummy payload is rejected, not parsed", download.ok === false);
      if (!download.ok) {
        check('...reporting the actual magic bytes in hex', download.message.includes('73 73 73 73'), download.message);
        check('...and printably', download.message.includes('ssssssss'), download.message);
        check('...naming the byte length', download.message.includes('25 bytes'), download.message);
        check('...classified as text rather than guessed at', download.format?.kind === 'csv-or-text', String(download.format?.kind));
        check('...and stating that nothing was parsed or written', download.message.includes('Nothing was parsed'));
      }
    });

    // A JSON error envelope that got base64'd is a common and very diagnosable
    // shape — it must be named, not lumped into "unknown bytes".
    const jsonPayload = Buffer.from('{"code":10005,"message":"missing scope"}').toString('base64');
    await withServer(compassResponder({ fileBase64: jsonPayload }), async (client) => {
      const download = await downloadTaskFile(client, TASK_ID);
      check('a base64-wrapped JSON error payload is refused', download.ok === false);
      check('...and identified as JSON', download.ok === false && download.format?.kind === 'json', String(download.ok === false ? download.format?.kind : ''));
    });

    // Legacy .xls is the nastiest near-miss: a real spreadsheet, wrong container.
    const ole2 = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]);
    await withServer(compassResponder({ fileBase64: ole2.toString('base64') }), async (client) => {
      const download = await downloadTaskFile(client, TASK_ID);
      check('a legacy .xls (OLE2) container is refused, not assumed to be xlsx', download.ok === false);
      check('...and named as OLE2/legacy xls', download.ok === false && download.format?.kind === 'ole2', String(download.ok === false ? download.format?.kind : ''));
    });

    // An EMPTY zip has the PK prefix but no files — the near-miss that a naive
    // "starts with PK" check would wave through.
    const emptyZip = Buffer.from([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]);
    check('an EMPTY zip is not a workbook candidate', detectFileFormat(emptyZip).isWorkbookCandidate === false);
    check('...and is named as such', detectFileFormat(emptyZip).kind === 'zip-empty', detectFileFormat(emptyZip).kind);
    check('a real xlsx IS a workbook candidate', detectFileFormat(CREATOR_WORKBOOK).isWorkbookCandidate === true);
    check('zero bytes are reported as empty, not unknown', detectFileFormat(Buffer.alloc(0)).kind === 'empty');
  }

  // ── 6. a zip whose headers are a DIFFERENT report ──────────────────────────
  // module_type (create) and doc_type (list) are the same concept under two
  // names, and TikTok's own example passes a doc_type outside the published
  // enum — so an unsupported value may be silently coerced into a task that
  // SUCCEEDS carrying the wrong report. Only the columns can catch that.
  console.log('identity: a valid zip carrying the WRONG report fails loudly');
  {
    const videoHeaderRow = extractHeaderRow(
      VIDEO_WORKBOOK.buffer.slice(VIDEO_WORKBOOK.byteOffset, VIDEO_WORKBOOK.byteOffset + VIDEO_WORKBOOK.byteLength) as ArrayBuffer,
    );
    const wrong = assertReportMatchesModule(videoHeaderRow, 'CREATOR');
    check('a Video Data workbook is refused for a CREATOR request', wrong.ok === false, wrong.message);
    check('...naming the module that was requested', wrong.message.includes('module_type=CREATOR'), wrong.message);
    check('...and the report it actually looks like', wrong.message.includes('video_performance'), wrong.message);
    check('...and refusing to guess in place of a human', wrong.message.includes('no human here') || wrong.message.includes('did not ask for'), wrong.message);

    const creatorHeaderRow = extractHeaderRow(
      CREATOR_WORKBOOK.buffer.slice(CREATOR_WORKBOOK.byteOffset, CREATOR_WORKBOOK.byteOffset + CREATOR_WORKBOOK.byteLength) as ArrayBuffer,
    );
    const right = assertReportMatchesModule(creatorHeaderRow, 'CREATOR');
    check('the CORRECT workbook passes (otherwise the check proves nothing)', right.ok === true, right.message);
    check('...and reports the match ratio', right.message.includes('creator_performance'), right.message);

    const alsoRight = assertReportMatchesModule(videoHeaderRow, 'VIDEO');
    check('the video workbook passes for a VIDEO request', alsoRight.ok === true, alsoRight.message);

    const productMismatch = assertReportMatchesModule(creatorHeaderRow, 'PRODUCT');
    check('a Creator workbook is refused for a PRODUCT request', productMismatch.ok === false, productMismatch.message);

    check('an empty sheet is refused rather than treated as zero rows', assertReportMatchesModule(null, 'CREATOR').ok === false);
    check(
      '...saying so explicitly',
      assertReportMatchesModule(null, 'CREATOR').message.includes('no header row'),
      assertReportMatchesModule(null, 'CREATOR').message,
    );
  }

  // ── 7. empty / absent / malformed base64 ───────────────────────────────────
  console.log('format: an absent or malformed base64 field is a distinct failure');
  {
    await withServer(compassResponder({ fileBase64: undefined }), async (client) => {
      const download = await downloadTaskFile(client, TASK_ID);
      check('an ABSENT base64 field fails', download.ok === false);
      check('...saying no field was present', download.ok === false && download.message.includes('no base64 file field'), download.ok === false ? download.message : '');
      check('...and listing the keys that WERE present, for the spike', download.ok === false && download.message.includes('file keys: [file_name]'), download.ok === false ? download.message : '');
    });
    await withServer(compassResponder({ fileBase64: '' }), async (client) => {
      const download = await downloadTaskFile(client, TASK_ID);
      check('an EMPTY base64 field fails distinctly from an absent one', download.ok === false && download.message.includes('present but empty'), download.ok === false ? download.message : '');
    });
    await withServer(compassResponder({ fileBase64: null }), async (client) => {
      const download = await downloadTaskFile(client, TASK_ID);
      check('a NULL base64 field fails', download.ok === false && download.message.includes('null/absent'), download.ok === false ? download.message : '');
    });

    // Buffer.from(s,'base64') silently DISCARDS invalid characters and returns a
    // short buffer. That leniency would turn "TikTok sent prose" into "TikTok
    // sent a small unrecognizable file", so the charset is checked first.
    const prose = decodeBase64File('this is not base64!! <html>');
    check('a non-base64 string is rejected before decoding', prose.ok === false);
    check('...naming the offending character', prose.ok === false && prose.message.includes('"!"'), prose.ok === false ? prose.message : '');
    check('...and saying why a lenient decode would have been worse', prose.ok === false && prose.message.includes('silently dropped'));
    check('a truncated base64 string (len mod 4 === 1) is rejected', decodeBase64File('QUJDRQ').ok === true && decodeBase64File('QUJDR').ok === false);
    check('unpadded but valid base64 is accepted', decodeBase64File('QUJD').ok === true);
    check('a data: URL wrapper is tolerated', decodeBase64File('data:application/vnd.ms-excel;base64,QUJD').ok === true);
    check('line-wrapped base64 is tolerated', decodeBase64File('QUJ\nD').ok === true);
  }

  // ── 8. the whole orchestration ─────────────────────────────────────────────
  console.log('orchestration: fetchDailyExport, end to end');
  {
    await withServer(compassResponder({ statuses: ['RUNNING', 'SUCCEEDED'], fileBase64: CREATOR_WORKBOOK.toString('base64'), extraTasks: true }), async (client) => {
      const seen: string[] = [];
      const timing = fakeTimekeeper(0);
      const out = await fetchDailyExport('bondie', '2026-07-25', 'CREATOR', {
        client,
        poll: { sleep: timing.sleep, now: timing.now },
        onTaskCreated: (taskId) => { seen.push(taskId); },
      });
      check('the orchestrator succeeds', out.ok === true, out.ok ? '' : out.message);
      check('the task id is handed out BEFORE polling starts', seen.length === 1 && seen[0] === TASK_ID, seen.join(','));
      if (out.ok) {
        check('...returning the raw bytes', out.bytes.length === CREATOR_WORKBOOK.length);
        check('...with a zip verdict', out.format.kind === 'zip');
        check('...and the polled status read back', out.echo.status === 'SUCCEEDED', String(out.echo.status));
        check('...noting no type discrepancy for a matching echo', out.warnings.length === 0, out.warnings.join(' | '));
      }
    });

    // The coercion hazard, surfaced as a warning at the transport layer — the
    // columns remain the actual gate.
    await withServer(compassResponder({ docType: 'VIDEO', fileBase64: CREATOR_WORKBOOK.toString('base64') }), async (client) => {
      const timing = fakeTimekeeper(0);
      const out = await fetchDailyExport('bondie', '2026-07-25', 'CREATOR', { client, poll: { sleep: timing.sleep, now: timing.now } });
      check('an echoed type that is not what we asked for is surfaced', out.ok === true && out.warnings.length > 0, out.ok ? out.warnings.join(' | ') : out.message);
      check('...naming the echoed value', out.ok === true && out.warnings.some((w) => w.includes('VIDEO')));
    });

    // A failed task must never reach the download stage.
    await withServer(compassResponder({ statuses: ['FAILED'] }), async (client, server) => {
      const timing = fakeTimekeeper(0);
      const out = await fetchDailyExport('bondie', '2026-07-25', 'CREATOR', { client, poll: { sleep: timing.sleep, now: timing.now } });
      check('a failed task fails the orchestration at the poll stage', out.ok === false && out.stage === 'poll', out.ok ? 'ok' : out.stage);
      check('...still carrying the task id for the record', out.ok === false && out.taskId === TASK_ID);
      check('...and never requesting the file', server.requests.every((r) => !r.path.endsWith('/file')));
    });

    // A non-zip payload must fail the orchestration, with the verdict attached.
    await withServer(compassResponder({ fileBase64: Buffer.from('not a workbook').toString('base64') }), async (client) => {
      const timing = fakeTimekeeper(0);
      const out = await fetchDailyExport('bondie', '2026-07-25', 'CREATOR', { client, poll: { sleep: timing.sleep, now: timing.now } });
      check('a non-zip file fails the orchestration at download', out.ok === false && out.stage === 'download', out.ok ? 'ok' : out.stage);
      check('...attaching the format verdict so the caller can log the magic bytes', out.ok === false && out.format !== null && out.format.isWorkbookCandidate === false);
    });
  }

  // ── 9. a create that returns no id ─────────────────────────────────────────
  console.log('lifecycle: a create with no task id fails with the key list');
  {
    await withServer(
      ({ res }) => sendJson(res, envelope({ nothing_useful: true, other_key: 1 })),
      async (client) => {
        let message = '';
        try {
          await createExportTask(client, { moduleType: 'CREATOR', reportDate: '2026-07-25' });
        } catch (err) {
          message = err instanceof Error ? err.message : String(err);
        }
        check('a create without a task id throws', message !== '');
        check('...listing the keys that WERE returned, which is what a spike needs', message.includes('nothing_useful'), message);
        check('...and explaining that a lost task cannot be re-found', message.includes('cannot be re-found by scanning'), message);
      },
    );
    await withServer(
      ({ res }) => sendJson(res, envelope({ unexpected_container: [] })),
      async (client) => {
        const timing = fakeTimekeeper(0);
        const outcome = await pollTask(client, TASK_ID, { sleep: timing.sleep, now: timing.now, maxPolls: 1 });
        check('an unreadable task list is a failure, NOT "no tasks"', outcome.state === 'failed', outcome.state);
        check('...naming the keys present', outcome.state === 'failed' && outcome.message.includes('unexpected_container'), outcome.state === 'failed' ? outcome.message : '');
        check(
          '...and hinting at the doc_type filter, since the list parameter is named differently from create',
          outcome.state === 'failed' && outcome.message.includes('doc_type, not module_type'),
        );
      },
    );
  }
}

main()
  .then(() => {
    console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((err: unknown) => {
    console.error('\nHarness crashed:', err);
    process.exit(1);
  });
