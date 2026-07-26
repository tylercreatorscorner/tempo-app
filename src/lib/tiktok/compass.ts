/**
 * Compass offline exports — the API replacement for an ops person downloading
 * xlsx files out of Seller Center for ~14 brands every single morning.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTHING IN THIS FILE HAS EVER RUN AGAINST A REAL SHOP.
 *
 * No merchant has authorized the app yet, so every endpoint path, version
 * string, parameter name, task status value and response key below is a READING
 * OF THE DOCS, not an observation. Worse, the docs never state what the
 * downloaded file actually is: the "it's XLSX" claim comes from a marketing
 * announcement, and the reference payload for the file field is the dummy
 * string "ssssssssssssssaaaaaaaaaaa".
 *
 * That is the whole design constraint. This module builds the LIFECYCLE, and
 * the decode step DETECTS what arrived instead of assuming it. A blob whose
 * first bytes are PK\x03\x04 is a zip container — i.e. plausibly xlsx, which is
 * a zip of XML. Anything else is refused and reported WITH ITS MAGIC BYTES.
 * The previous TikTok integration in this repo was deleted because it was
 * written from confident guesses about response shapes — guesses tsc compiled
 * happily. This one asserts instead, and every guess is labelled as one.
 *
 * See the SPIKE CHECKLIST at the bottom of this file for the exhaustive list of
 * what cannot be known until a shop authorizes.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Node-only (Buffer; ./client signs with node:crypto).
 *
 * NO DB IMPORTS AT MODULE SCOPE — deliberately. scripts/test-tiktok-compass.ts
 * imports this file to drive a local mock server, and a static import of
 * ./connections would drag in @/lib/supabase/server → next/headers and make the
 * harness unrunnable. `fetchDailyExport` reaches connections through a dynamic
 * import for exactly that reason.
 *
 * Compass is the same warehouse the manual xlsx export comes from, so nothing
 * here changes what the numbers mean: est_commission remains an estimate, the
 * way it already is on the upload path.
 */
import { formatInTimeZone } from 'date-fns-tz';
import type { TikTokClient } from './client';
import { TikTokPermanentError } from './client';
import type { FileType } from '../upload/file-detection';
import type { UploadTable } from '../upload/column-maps';
import { scoreAllTypes, type TypeScore } from '../upload/type-sniff';

// ============================================================
// Vocabulary and versions — all UNVERIFIED, all overridable
// ============================================================

/**
 * The `{version}` segment in /affiliate_seller/{version}/compass/... .
 *
 * CONFIDENCE: LOW. The doc sweep that produced these paths did not pin a
 * version, and TikTok versions each endpoint family independently. 202405 is
 * the version family this repo already exercises elsewhere
 * (/affiliate_creator/202405/...), so it is the least-arbitrary starting guess
 * — it is a guess all the same.
 *
 * Overridable by env so the first live probe can walk candidate versions
 * without a deploy, and per call so the admin route can pass one from a form.
 */
export const DEFAULT_COMPASS_API_VERSION =
  process.env.TIKTOK_COMPASS_API_VERSION?.trim() || '202405';

/** TikTok versions are a six-digit YYYYMM. Anything else is a typo, not a version. */
export function isValidApiVersion(version: string): boolean {
  return /^\d{6}$/.test(version);
}

/**
 * What kind of report to build. Sent as `module_type` on create.
 *
 * CONFIDENCE: only 'CREATOR' was seen in the docs' parameter list. VIDEO and
 * PRODUCT are inferred from the exports they would correspond to, and TikTok's
 * own curl example passes a doc_type of "VIDEO" that is not in the published
 * enum at all — which is precisely why an unsupported value is dangerous: it
 * may be silently coerced, producing a task that SUCCEEDS and hands back the
 * WRONG REPORT. Nothing downstream trusts this value; the header sniff is the
 * gate. See assertReportMatchesModule.
 */
export type CompassModuleType = 'CREATOR' | 'VIDEO' | 'PRODUCT';

/**
 * The ONLY three windows Compass offers, each anchored on `end_day`.
 *
 * There is NO arbitrary start..end range. Do not add one, and do not model one:
 * a backfill is N separate daily tasks (see planDailyBackfill), not one call
 * with a range. PAST_24H is the daily ingest window.
 */
export type CompassWindowType = 'PAST_24H' | 'PAST_7_DAYS' | 'PAST_30_DAYS';

/** CONFIDENCE: LOW — 'ALL' is the only value the doc sweep surfaced. */
export const DEFAULT_PLAN_TYPE = 'ALL';

/**
 * Which fact table each module is expected to land in, and which FileType the
 * shared parser dispatch needs. Exactly three entries: the `videos` registry
 * table is fed as a side effect of video_performance (mig 110), never as its
 * own Compass module, and the pre-merge Video List export is retired.
 */
const MODULE_TARGET: Record<CompassModuleType, { table: UploadTable; fileType: FileType }> = {
  CREATOR: { table: 'creator_performance', fileType: 'creator' },
  VIDEO: { table: 'video_performance', fileType: 'video' },
  PRODUCT: { table: 'product_performance', fileType: 'affiliateproduct' },
};

export function targetForModule(moduleType: CompassModuleType): { table: UploadTable; fileType: FileType } {
  return MODULE_TARGET[moduleType];
}

export function isCompassModuleType(value: unknown): value is CompassModuleType {
  return value === 'CREATOR' || value === 'VIDEO' || value === 'PRODUCT';
}

// ============================================================
// end_day is MARKET-LOCAL, not UTC
// ============================================================

/**
 * `end_day` is interpreted in the shop's market timezone. Every shop Tempo
 * touches is US, i.e. UTC-8/-7.
 *
 * This is not pedantry: a naive UTC "yesterday" is WRONG for up to 8 hours
 * every night. At 2026-07-26 03:00 UTC it is still 2026-07-25 19:00 in Los
 * Angeles, so UTC-yesterday is 07-25 while market-yesterday is 07-24 — a cron
 * running at 03:00 UTC would request a day that has not finished yet, every
 * single night, and write a half day over a full one.
 */
export const COMPASS_MARKET_TIME_ZONE = 'America/Los_Angeles';

/** Today's calendar date in the shop's market, as YYYY-MM-DD. */
export function marketToday(now: Date = new Date(), timeZone = COMPASS_MARKET_TIME_ZONE): string {
  return formatInTimeZone(now, timeZone, 'yyyy-MM-dd');
}

/** The day before today IN THE MARKET — the default daily ingest target. */
export function marketYesterday(now: Date = new Date(), timeZone = COMPASS_MARKET_TIME_ZONE): string {
  const today = marketToday(now, timeZone);
  // Date arithmetic on the market-local calendar date, done in UTC so it can
  // never re-introduce the offset this function exists to remove.
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD → the YYYYMMDD integer `end_day` wants. Throws on junk: a
 *  malformed date silently coerced to 0 would request an arbitrary day. */
export function toEndDay(reportDate: string): number {
  if (!ISO_DATE.test(reportDate)) {
    throw new Error(`[compass] end_day requires a YYYY-MM-DD date, got "${reportDate}"`);
  }
  const asInt = Number(reportDate.replace(/-/g, ''));
  if (!Number.isInteger(asInt)) {
    throw new Error(`[compass] "${reportDate}" does not convert to a YYYYMMDD integer`);
  }
  return asInt;
}

/**
 * How far back `end_day` may reach is UNDOCUMENTED, so a backfill is planned,
 * not assumed: this returns the explicit list of daily tasks a range implies
 * and refuses to silently generate an unbounded number of them.
 *
 * There is no range parameter on the API. One task per day, N tasks for N days.
 */
export function planDailyBackfill(
  fromDate: string,
  toDate: string,
  options: { maxDays?: number } = {},
): { dates: string[]; taskCount: number; note: string } {
  if (!ISO_DATE.test(fromDate) || !ISO_DATE.test(toDate)) {
    throw new Error(`[compass] backfill needs YYYY-MM-DD bounds, got "${fromDate}".."${toDate}"`);
  }
  if (fromDate > toDate) {
    throw new Error(`[compass] backfill start ${fromDate} is after end ${toDate}`);
  }
  const maxDays = options.maxDays ?? 60;
  const dates: string[] = [];
  const cursor = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    if (dates.length > maxDays) {
      throw new Error(
        `[compass] backfill ${fromDate}..${toDate} needs more than ${maxDays} separate daily tasks. ` +
          `Compass has no date-range parameter, so each day is its own task; raise maxDays deliberately ` +
          `or split the backfill.`,
      );
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return {
    dates,
    taskCount: dates.length,
    note:
      `Compass offers only PAST_24H / PAST_7_DAYS / PAST_30_DAYS anchored on end_day — there is no ` +
      `start..end range. ${dates.length} day(s) = ${dates.length} separate tasks. How far back end_day ` +
      `may reach is undocumented; treat any failure on the oldest dates as the retention edge, not a bug.`,
  };
}

// ============================================================
// Task lifecycle
// ============================================================

export type CompassTaskState = 'succeeded' | 'failed' | 'pending' | 'unrecognized';

/**
 * Status strings are UNVERIFIED. Each set carries the variants the docs and
 * neighbouring TikTok endpoints use, matched case-insensitively. A status that
 * matches nothing is classified 'unrecognized' and treated as still pending —
 * never as success. Guessing "unknown means done" is how you download a file
 * that was never built.
 */
const SUCCEEDED_STATUSES = new Set(['succeeded', 'success', 'finished', 'completed', 'complete', 'done']);
const FAILED_STATUSES = new Set(['failed', 'fail', 'error', 'expired', 'cancelled', 'canceled', 'timeout']);
const PENDING_STATUSES = new Set(['running', 'pending', 'processing', 'in_progress', 'init', 'created', 'queuing', 'queued', 'waiting']);

export function classifyTaskStatus(rawStatus: string | null | undefined): CompassTaskState {
  const s = (rawStatus ?? '').trim().toLowerCase();
  if (!s) return 'unrecognized';
  if (SUCCEEDED_STATUSES.has(s)) return 'succeeded';
  if (FAILED_STATUSES.has(s)) return 'failed';
  if (PENDING_STATUSES.has(s)) return 'pending';
  return 'unrecognized';
}

/**
 * Whatever the API says this task/file IS, read back verbatim.
 *
 * Sharp edge: create takes `module_type`, the list returns `doc_type`, and
 * TikTok's own example passes a doc_type value outside the published enum. An
 * unsupported value may be silently coerced, so we never assume we got what we
 * asked for — we record what it claims and then check the actual columns.
 */
export interface CompassTaskEcho {
  moduleType: string | null;
  docType: string | null;
  windowType: string | null;
  endDay: string | null;
  fileName: string | null;
  status: string | null;
}

export interface CompassTaskSummary extends CompassTaskEcho {
  taskId: string;
  state: CompassTaskState;
}

export interface CreateTaskParams {
  moduleType: CompassModuleType;
  /** YYYY-MM-DD in the shop's market. Converted to the YYYYMMDD int on the wire. */
  reportDate: string;
  windowType?: CompassWindowType;
  planType?: string;
}

export interface CompassRequestOptions {
  apiVersion?: string;
  /**
   * Whether create params ride in the JSON body or the (signed) query string.
   * UNVERIFIED — the docs show a POST but not where the params live. Body is
   * the default because that is the norm for TikTok Shop POST endpoints; if the
   * first live call 400s on missing parameters, flip this rather than guessing
   * a second time. Both are signed either way (see TikTokClient.attempt).
   */
  paramsIn?: 'body' | 'query';
}

export interface CreateTaskResult {
  taskId: string;
  echo: CompassTaskEcho;
  requestId: string | null;
}

function compassPath(version: string, suffix: string): string {
  if (!isValidApiVersion(version)) {
    throw new Error(`[compass] "${version}" is not a six-digit TikTok API version`);
  }
  return `/affiliate_seller/${version}/compass/${suffix}`;
}

/** Response objects are unmodelled by design (see ./types) — read defensively. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(source: Record<string, unknown> | null, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const v = source[key];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

function readEcho(source: Record<string, unknown> | null): CompassTaskEcho {
  return {
    moduleType: firstString(source, ['module_type', 'moduleType']),
    docType: firstString(source, ['doc_type', 'docType']),
    windowType: firstString(source, ['window_type', 'windowType']),
    endDay: firstString(source, ['end_day', 'endDay']),
    fileName: firstString(source, ['file_name', 'fileName', 'name']),
    status: firstString(source, ['status', 'task_status', 'taskStatus', 'state']),
  };
}

/**
 * Ask TikTok to build one report file.
 *
 * The returned task id is THE handle and the only one there is — persist it
 * before polling. The task list is ~7 days deep, unpaginated and reportedly
 * carries no timestamps, so a task id that is lost cannot be recovered by
 * looking for "the newest task"; that would eventually download some other
 * brand-day's file.
 *
 * Not marked idempotent: a retried create mints a SECOND task, and the client's
 * retry policy already refuses to retry POSTs by default. A create that fails
 * transiently is re-run by re-running the whole ingest.
 */
export async function createExportTask(
  client: TikTokClient,
  params: CreateTaskParams,
  options: CompassRequestOptions = {},
): Promise<CreateTaskResult> {
  const version = options.apiVersion ?? DEFAULT_COMPASS_API_VERSION;
  const path = compassPath(version, 'offline_task');

  const payload: Record<string, string | number> = {
    module_type: params.moduleType,
    window_type: params.windowType ?? 'PAST_24H',
    end_day: toEndDay(params.reportDate),
    plan_type: params.planType ?? DEFAULT_PLAN_TYPE,
  };

  const result =
    options.paramsIn === 'query'
      ? await client.post<unknown>(path, { query: payload })
      : await client.post<unknown>(path, { body: payload });

  const data = asRecord(result.data);
  // The id may be at the top of `data` or nested under a task object — both
  // shapes exist across TikTok endpoint families and we have observed neither.
  const nested = asRecord(data?.task) ?? asRecord(data?.offline_task);
  const taskId = firstString(data, ['task_id', 'taskId', 'id']) ?? firstString(nested, ['task_id', 'taskId', 'id']);

  if (!taskId) {
    // Keys only, never values: a response body from a live shop carries seller
    // data. The key list is what a spike actually needs to pin the shape.
    throw new TikTokPermanentError({
      status: 200,
      code: null,
      requestId: result.requestId,
      message:
        `[compass] create returned no task id. Top-level data keys: ` +
        `[${data ? Object.keys(data).join(', ') : 'not-an-object'}]. Without an id there is nothing to poll: ` +
        `the task list is unpaginated and carries no timestamps, so a task cannot be re-found by scanning.`,
    });
  }

  return { taskId, echo: readEcho(nested ?? data), requestId: result.requestId };
}

export interface ListTasksOptions extends CompassRequestOptions {
  /**
   * Send `doc_type` as a list filter. OFF by default and that is deliberate:
   * the list parameter is named doc_type while create takes module_type, and an
   * unsupported/coerced value could filter our own task OUT of the response —
   * at which case we would conclude the task vanished. We key on the id create
   * returned, so a filter buys nothing and risks everything. Turn it on only if
   * a live call proves the parameter is required.
   */
  docType?: string;
}

export interface ListTasksResult {
  tasks: CompassTaskSummary[];
  /** Response key names only (never values) — what a spike needs to pin shapes. */
  observedShape: { dataKeys: string[]; itemKeys: string[] };
  requestId: string | null;
}

const TASK_LIST_KEYS = ['offline_tasks', 'tasks', 'list', 'task_list', 'items', 'records'];

/** Pull the task array out of an unmodelled envelope, tolerating several
 *  plausible container keys. If none match we say so with the key list rather
 *  than returning an empty array — "no tasks" and "we could not find the
 *  tasks" are different answers and must never collapse. */
function extractTaskList(data: unknown): { items: Record<string, unknown>[]; dataKeys: string[]; found: boolean } {
  if (Array.isArray(data)) {
    return { items: data.filter((i): i is Record<string, unknown> => asRecord(i) !== null), dataKeys: [], found: true };
  }
  const record = asRecord(data);
  const dataKeys = record ? Object.keys(record) : [];
  if (!record) return { items: [], dataKeys, found: false };
  for (const key of TASK_LIST_KEYS) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      return {
        items: candidate.filter((i): i is Record<string, unknown> => asRecord(i) !== null),
        dataKeys,
        found: true,
      };
    }
  }
  return { items: [], dataKeys, found: false };
}

export async function listExportTasks(
  client: TikTokClient,
  options: ListTasksOptions = {},
): Promise<ListTasksResult> {
  const version = options.apiVersion ?? DEFAULT_COMPASS_API_VERSION;
  const path = compassPath(version, 'offline_tasks');

  const query = options.docType ? { doc_type: options.docType } : undefined;
  const result = await client.get<unknown>(path, query);

  const { items, dataKeys, found } = extractTaskList(result.data);
  const tasks: CompassTaskSummary[] = [];
  for (const item of items) {
    const taskId = firstString(item, ['task_id', 'taskId', 'id']);
    if (!taskId) continue;
    const echo = readEcho(item);
    tasks.push({ taskId, state: classifyTaskStatus(echo.status), ...echo });
  }

  if (!found) {
    throw new TikTokPermanentError({
      status: 200,
      code: null,
      requestId: result.requestId,
      message:
        `[compass] the task list response contained no recognizable task array. ` +
        `Tried keys [${TASK_LIST_KEYS.join(', ')}]; data keys present: [${dataKeys.join(', ') || 'none'}]. ` +
        `Refusing to report "no tasks" for a shape we failed to read.`,
    });
  }

  return {
    tasks,
    observedShape: { dataKeys, itemKeys: items[0] ? Object.keys(items[0]) : [] },
    requestId: result.requestId,
  };
}

export interface PollOptions extends ListTasksOptions {
  /** Wall-clock ceiling for the whole loop. Must fit inside the caller's
   *  function timeout (Vercel maxDuration 60s → 40s default here). */
  budgetMs?: number;
  /** Hard cap on requests, independent of the clock. Two ceilings on purpose:
   *  a clock that does not advance (fake timers, a frozen VM) must not turn
   *  this into an unbounded loop. */
  maxPolls?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  /** Injected by the test harness so ceiling behaviour is provable in ms. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onPoll?: (poll: number, task: CompassTaskSummary | null) => void;
}

export type PollOutcome =
  | { state: 'succeeded'; task: CompassTaskSummary; polls: number; elapsedMs: number }
  | { state: 'failed'; task: CompassTaskSummary | null; message: string; polls: number; elapsedMs: number }
  | { state: 'timeout'; task: CompassTaskSummary | null; message: string; polls: number; elapsedMs: number };

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait for one task, BOUNDED. Never an unbounded loop: it stops at whichever
 * of the wall-clock budget and the poll cap comes first, and reports 'timeout'
 * honestly rather than pretending the task failed.
 *
 * KEYED ON THE ID, ALWAYS. The list endpoint is the only status surface there
 * is, so we do call it — but we select strictly by the id create returned. We
 * never take "the newest task", "the first task of this doc_type", or anything
 * else positional. The list is ~7 days deep, unpaginated and (reportedly)
 * timestamp-free, and ~14 brands each create several tasks a day, so any
 * positional heuristic eventually downloads another brand-day's file and writes
 * it under this brand.
 */
export async function pollTask(
  client: TikTokClient,
  taskId: string,
  options: PollOptions = {},
): Promise<PollOutcome> {
  const budgetMs = options.budgetMs ?? 40_000;
  const maxPolls = options.maxPolls ?? 12;
  const initialDelayMs = options.initialDelayMs ?? 2_000;
  const maxDelayMs = options.maxDelayMs ?? 8_000;
  const backoffFactor = options.backoffFactor ?? 1.5;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;

  const startedAt = now();
  let delay = initialDelayMs;
  let polls = 0;
  let lastSeen: CompassTaskSummary | null = null;
  let everSeen = false;

  while (polls < maxPolls && now() - startedAt < budgetMs) {
    await sleep(delay);
    polls += 1;

    let listed: ListTasksResult;
    try {
      listed = await listExportTasks(client, options);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const hint =
        err instanceof TikTokPermanentError && !options.docType
          ? ` If the list endpoint requires a filter, pass docType (the list parameter is doc_type, not module_type).`
          : '';
      return {
        state: 'failed',
        task: lastSeen,
        message: `[compass] polling task ${taskId} failed: ${detail}${hint}`,
        polls,
        elapsedMs: now() - startedAt,
      };
    }

    const task = listed.tasks.find((t) => t.taskId === taskId) ?? null;
    options.onPoll?.(polls, task);

    if (task) {
      everSeen = true;
      lastSeen = task;
      if (task.state === 'succeeded') {
        return { state: 'succeeded', task, polls, elapsedMs: now() - startedAt };
      }
      if (task.state === 'failed') {
        return {
          state: 'failed',
          task,
          message:
            `[compass] task ${taskId} reached a terminal failure. TikTok status: "${task.status ?? '(none)'}". ` +
            `Nothing was downloaded and nothing was written.`,
          polls,
          elapsedMs: now() - startedAt,
        };
      }
      // 'pending' and 'unrecognized' both keep waiting. An unfamiliar status is
      // not permission to assume the file is ready.
    }

    delay = Math.min(Math.round(delay * backoffFactor), maxDelayMs);
  }

  const elapsedMs = now() - startedAt;
  const reason = polls >= maxPolls ? `poll cap of ${maxPolls}` : `time budget of ${budgetMs}ms`;
  return {
    state: 'timeout',
    task: lastSeen,
    message: everSeen
      ? `[compass] task ${taskId} did not reach a terminal status within the ${reason} ` +
        `(${polls} polls, ${elapsedMs}ms). Last status seen: "${lastSeen?.status ?? '(none)'}". ` +
        `The task id is recorded — the file may still be downloadable later.`
      : `[compass] task ${taskId} never appeared in the task list within the ${reason} ` +
        `(${polls} polls, ${elapsedMs}ms). Either it has not materialized yet, or the list does not ` +
        `contain it at all. The list is unpaginated and ~7 days deep, so it cannot be found by scanning.`,
    polls,
    elapsedMs,
  };
}

// ============================================================
// Download + FORMAT DETECTION
// ============================================================

/**
 * Magic-byte signatures. Only the first — the zip LOCAL FILE header — is
 * accepted for parsing, because an xlsx is a zip of XML and nothing else we can
 * parse looks like this.
 */
const SIGNATURES: Array<{ kind: DetectedKind; bytes: number[]; detail: string; parseable: boolean }> = [
  {
    kind: 'zip',
    bytes: [0x50, 0x4b, 0x03, 0x04],
    detail: 'zip local file header (PK\\x03\\x04) — consistent with xlsx, which is a zip of XML',
    parseable: true,
  },
  {
    kind: 'zip-empty',
    bytes: [0x50, 0x4b, 0x05, 0x06],
    detail: 'EMPTY zip end-of-central-directory (PK\\x05\\x06) — a zip containing no files, so not a workbook',
    parseable: false,
  },
  {
    kind: 'zip-spanned',
    bytes: [0x50, 0x4b, 0x07, 0x08],
    detail: 'spanned/split zip header (PK\\x07\\x08) — an incomplete archive, not a standalone workbook',
    parseable: false,
  },
  {
    kind: 'ole2',
    bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
    detail: 'OLE2 compound file — this is legacy .xls, not .xlsx',
    parseable: false,
  },
  { kind: 'gzip', bytes: [0x1f, 0x8b], detail: 'gzip stream — decompress before anything else', parseable: false },
  { kind: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46], detail: 'PDF document', parseable: false },
];

export type DetectedKind =
  | 'zip'
  | 'zip-empty'
  | 'zip-spanned'
  | 'ole2'
  | 'gzip'
  | 'pdf'
  | 'json'
  | 'csv-or-text'
  | 'empty'
  | 'unknown';

export interface FormatVerdict {
  kind: DetectedKind;
  /** The ONLY gate. True exclusively for a real zip local-file header. */
  isWorkbookCandidate: boolean;
  /** First 8 bytes as hex — the thing to paste into a spike report. */
  magicHex: string;
  /** Same bytes rendered printably, so "PK.." or "{" is visible at a glance. */
  magicAscii: string;
  byteLength: number;
  detail: string;
}

function toMagicHex(bytes: Uint8Array): string {
  return Array.from(bytes.subarray(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

function toMagicAscii(bytes: Uint8Array): string {
  return Array.from(bytes.subarray(0, 8))
    .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.'))
    .join('');
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((b, i) => bytes[i] === b);
}

/**
 * Say what these bytes ARE. Never what we hoped they'd be.
 *
 * This is the load-bearing function of the module. The artifact format is
 * unverified — the docs' own example file payload is the dummy string
 * "ssssssssssssssaaaaaaaaaaa" — so the pipeline refuses to hand anything to the
 * XLSX parser unless it carries a zip local-file header, and reports the actual
 * first bytes when it doesn't.
 */
export function detectFileFormat(bytes: Uint8Array): FormatVerdict {
  const base = {
    magicHex: toMagicHex(bytes),
    magicAscii: toMagicAscii(bytes),
    byteLength: bytes.length,
  };

  if (bytes.length === 0) {
    return { ...base, kind: 'empty', isWorkbookCandidate: false, detail: 'zero bytes — the download produced no file' };
  }

  for (const sig of SIGNATURES) {
    if (startsWith(bytes, sig.bytes)) {
      return { ...base, kind: sig.kind, isWorkbookCandidate: sig.parseable, detail: sig.detail };
    }
  }

  // Text-shaped payloads are worth naming: a JSON body here is almost always an
  // error envelope that got base64'd, which is a far more actionable diagnosis
  // than "unknown bytes".
  const head = toMagicAscii(bytes).trim();
  if (head.startsWith('{') || head.startsWith('[')) {
    return { ...base, kind: 'json', isWorkbookCandidate: false, detail: 'JSON text — likely an error payload, not a report file' };
  }
  const printable = Array.from(bytes.subarray(0, Math.min(bytes.length, 64))).every(
    (b) => b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e),
  );
  if (printable) {
    return {
      ...base,
      kind: 'csv-or-text',
      isWorkbookCandidate: false,
      detail: 'plain text (possibly CSV) — not a zip, so not an xlsx workbook',
    };
  }

  return { ...base, kind: 'unknown', isWorkbookCandidate: false, detail: 'unrecognized binary — no known container signature' };
}

export type Base64Decode =
  | { ok: true; bytes: Buffer; encodedChars: number }
  | { ok: false; message: string };

const BASE64_CHARS = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Decode the `data.file.base64` field, strictly.
 *
 * Buffer.from(s, 'base64') is famously lenient — it silently DISCARDS every
 * character outside the alphabet and returns a short buffer rather than an
 * error. That leniency would turn "TikTok sent us prose" into "TikTok sent us a
 * small unrecognizable file", so the charset is validated before decoding.
 */
export function decodeBase64File(raw: unknown): Base64Decode {
  if (raw === null || raw === undefined) {
    return { ok: false, message: 'the download response carried no base64 file field at all (null/absent)' };
  }
  if (typeof raw !== 'string') {
    return { ok: false, message: `the base64 file field was ${Array.isArray(raw) ? 'an array' : typeof raw}, not a string` };
  }

  // Tolerate a data: URL wrapper and any line wrapping; both are cosmetic.
  const withoutPrefix = raw.replace(/^data:[^;,]*;base64,/, '');
  const compact = withoutPrefix.replace(/\s+/g, '');
  if (compact.length === 0) {
    return { ok: false, message: 'the base64 file field was present but empty — no file was returned' };
  }
  if (!BASE64_CHARS.test(compact)) {
    const offender = compact.match(/[^A-Za-z0-9+/=]/)?.[0] ?? '?';
    return {
      ok: false,
      message:
        `the file field is not valid base64: it contains "${offender}". ` +
        `Length ${compact.length}. It was NOT decoded — a lenient decode would have silently dropped ` +
        `the bad characters and produced a plausible-looking short file.`,
    };
  }
  // Unpadded base64 is common enough to accept; a remainder of 1 is impossible
  // for any real payload and means the string is truncated.
  const remainder = compact.length % 4;
  if (remainder === 1) {
    return { ok: false, message: `the base64 file field has length ${compact.length} (mod 4 = 1), which no valid base64 string can have — it is truncated` };
  }
  const padded = remainder === 0 ? compact : compact + '='.repeat(4 - remainder);

  return { ok: true, bytes: Buffer.from(padded, 'base64'), encodedChars: compact.length };
}

export interface DownloadResult {
  /** Raw bytes exactly as decoded. No parsing has happened yet. */
  bytes: Buffer;
  format: FormatVerdict;
  /** Whatever the response claims the file is — read back, never trusted. */
  echo: CompassTaskEcho;
  requestId: string | null;
}

export type DownloadOutcome =
  | { ok: true; result: DownloadResult }
  | { ok: false; message: string; format: FormatVerdict | null; echo: CompassTaskEcho; requestId: string | null };

/**
 * Download a finished task's file and say what it is.
 *
 * Returns RAW BYTES plus a verdict. It deliberately does not parse: deciding
 * "this is a workbook" is the caller's gate, and a function that both fetched
 * and parsed would make it easy to skip the check.
 */
export async function downloadTaskFile(
  client: TikTokClient,
  taskId: string,
  options: CompassRequestOptions = {},
): Promise<DownloadOutcome> {
  const version = options.apiVersion ?? DEFAULT_COMPASS_API_VERSION;
  const path = compassPath(version, `offline_tasks/${encodeURIComponent(taskId)}/file`);

  const result = await client.get<unknown>(path);
  const data = asRecord(result.data);
  const file = asRecord(data?.file);
  const echo = readEcho(file ?? data);

  // data.file.base64 is the documented location; the alternatives cost nothing
  // and are named so a shape surprise is diagnosable instead of fatal.
  const rawBase64 =
    (file?.base64 as unknown) ??
    (data?.base64 as unknown) ??
    (data?.file_base64 as unknown) ??
    (file?.content as unknown) ??
    null;

  const decoded = decodeBase64File(rawBase64);
  if (!decoded.ok) {
    return {
      ok: false,
      message:
        `[compass] task ${taskId}: ${decoded.message}. ` +
        `Response data keys: [${data ? Object.keys(data).join(', ') : 'not-an-object'}]` +
        (file ? `, file keys: [${Object.keys(file).join(', ')}]` : ''),
      format: null,
      echo,
      requestId: result.requestId,
    };
  }

  const format = detectFileFormat(decoded.bytes);
  if (!format.isWorkbookCandidate) {
    return {
      ok: false,
      message:
        `[compass] task ${taskId} returned ${format.byteLength} bytes that are NOT a zip archive, so they are ` +
        `not an xlsx workbook. First bytes: ${format.magicHex} ("${format.magicAscii}"). Detected: ${format.kind} — ` +
        `${format.detail}. Nothing was parsed and nothing was written. ` +
        `(The artifact format has never been verified against a real shop; this is the check that exists to catch that.)`,
      format,
      echo,
      requestId: result.requestId,
    };
  }

  return { ok: true, result: { bytes: decoded.bytes, format, echo, requestId: result.requestId } };
}

// ============================================================
// Header assertion — the real gate on "is this the right report?"
// ============================================================

/**
 * Mirrors type-sniff.ts's SWITCH_MIN_BEST. A file whose own column map matches
 * under 70% of its columns is not confidently that report.
 */
const MIN_HEADER_CONFIDENCE = 0.7;

export interface HeaderMatchVerdict {
  ok: boolean;
  expectedTable: UploadTable;
  expected: TypeScore | null;
  /** Highest-scoring OTHER report — the thing we might actually have received. */
  runnerUp: TypeScore | null;
  message: string;
}

/**
 * Assert that the parsed header row is the report we ASKED for.
 *
 * This is the answer to the module_type-vs-doc_type hazard: TikTok's own
 * example passes a doc_type value outside the published enum, so an unsupported
 * value may be silently coerced and hand back a task that SUCCEEDS carrying the
 * WRONG REPORT. The task status cannot detect that. The columns can.
 *
 * Stricter than resolveTypeFromHeaders on purpose — that one decides whether to
 * help an operator who mislabelled a file, and a human adjudicates the
 * ambiguous case. Here there is no human, so both "the expected map matches
 * poorly" and "another map matches at least as well" are hard failures.
 */
export function assertReportMatchesModule(
  headerRow: Record<string, unknown> | null,
  moduleType: CompassModuleType,
): HeaderMatchVerdict {
  const { table: expectedTable, fileType } = targetForModule(moduleType);

  if (!headerRow) {
    return {
      ok: false,
      expectedTable,
      expected: null,
      runnerUp: null,
      message:
        `[compass] the workbook produced no header row (empty sheet, or a header-only file). ` +
        `Expected the ${fileType} export for ${expectedTable}. Nothing was written.`,
    };
  }

  const scores = scoreAllTypes(headerRow);
  const expected = scores.find((s) => s.table === expectedTable) ?? null;
  const others = scores.filter((s) => s.table !== expectedTable);
  const runnerUp = others.length > 0 ? others.reduce((m, s) => (s.ratio > m.ratio ? s : m)) : null;

  const pct = (s: TypeScore | null): string =>
    s ? `${s.table} ${s.matched}/${s.total} (${Math.round(s.ratio * 100)}%)` : 'n/a';

  if (!expected || expected.ratio < MIN_HEADER_CONFIDENCE) {
    return {
      ok: false,
      expectedTable,
      expected,
      runnerUp,
      message:
        `[compass] module_type=${moduleType} asked for the ${expectedTable} report, but the file's columns ` +
        `match it only ${pct(expected)}. Closest other report: ${pct(runnerUp)}. ` +
        `TikTok may have coerced the requested type — refusing to write a report we did not ask for.`,
    };
  }

  if (runnerUp && runnerUp.ratio >= expected.ratio) {
    return {
      ok: false,
      expectedTable,
      expected,
      runnerUp,
      message:
        `[compass] module_type=${moduleType} asked for the ${expectedTable} report, and the columns are ` +
        `ambiguous: ${pct(expected)} vs ${pct(runnerUp)}. On the manual upload path a human resolves this; ` +
        `there is no human here, so the run fails rather than guessing.`,
    };
  }

  return {
    ok: true,
    expectedTable,
    expected,
    runnerUp,
    message: `columns match ${pct(expected)}; next closest ${pct(runnerUp)}`,
  };
}

// ============================================================
// Orchestration
// ============================================================

export interface FetchDailyExportOptions extends CompassRequestOptions {
  /** Pre-built client. When absent, ./connections is imported dynamically and
   *  asked for one — see the module header for why the import is not static. */
  client?: TikTokClient;
  windowType?: CompassWindowType;
  planType?: string;
  poll?: PollOptions;
  /** Persist the task id BEFORE polling starts. The task list has no
   *  timestamps, so an id lost to a mid-poll function death is lost for good. */
  onTaskCreated?: (taskId: string, echo: CompassTaskEcho) => Promise<void> | void;
}

export type FetchStage = 'connection' | 'create' | 'poll' | 'download';

export type FetchDailyExportResult =
  | {
      ok: true;
      taskId: string;
      bytes: Buffer;
      format: FormatVerdict;
      /** Everything the API claimed about this task/file, for the record. */
      echo: CompassTaskEcho;
      polls: number;
      elapsedMs: number;
      /** Non-fatal discrepancies, e.g. an echoed type that is not what we asked for. */
      warnings: string[];
    }
  | {
      ok: false;
      stage: FetchStage;
      message: string;
      taskId: string | null;
      format: FormatVerdict | null;
      needsReauthorization?: boolean;
    };

/**
 * One brand, one day, one report: create → poll → download → identify.
 *
 * Returns bytes and a verdict; it writes nothing and knows nothing about the
 * database. compass-ingest.ts owns parsing, the ingestion_runs ledger and the
 * atomic RPC write.
 */
export async function fetchDailyExport(
  brandSlug: string,
  reportDate: string,
  moduleType: CompassModuleType,
  options: FetchDailyExportOptions = {},
): Promise<FetchDailyExportResult> {
  let client = options.client;

  if (!client) {
    const { getActiveConnection } = await import('./connections');
    const connection = await getActiveConnection(brandSlug);
    if (!connection.ok) {
      return {
        ok: false,
        stage: 'connection',
        message: connection.message,
        taskId: null,
        format: null,
        needsReauthorization: connection.needsReauthorization,
      };
    }
    client = connection.client;
  }

  let created: CreateTaskResult;
  try {
    created = await createExportTask(
      client,
      { moduleType, reportDate, windowType: options.windowType, planType: options.planType },
      options,
    );
  } catch (err) {
    return {
      ok: false,
      stage: 'create',
      message: `[compass] could not create the ${moduleType} task for ${brandSlug} ${reportDate}: ` +
        (err instanceof Error ? err.message : String(err)),
      taskId: null,
      format: null,
    };
  }

  await options.onTaskCreated?.(created.taskId, created.echo);

  const warnings: string[] = [];
  // Read back what the API says this is. It is not a gate — the header sniff is
  // — but a mismatch here is the earliest hint that the type was coerced.
  const echoedType = created.echo.moduleType ?? created.echo.docType;
  if (echoedType && echoedType.toUpperCase() !== moduleType) {
    warnings.push(
      `create echoed type "${echoedType}" for a module_type=${moduleType} request. ` +
        `The columns are checked before anything is written.`,
    );
  }

  // The version/param-location overrides must reach the LIST call too, or a
  // spike walking candidate versions would create a task on one version and
  // then poll a different one — which looks exactly like "the task vanished".
  const pollOptions: PollOptions = {
    ...options.poll,
    apiVersion: options.poll?.apiVersion ?? options.apiVersion,
  };
  const outcome = await pollTask(client, created.taskId, pollOptions);
  if (outcome.state !== 'succeeded') {
    return { ok: false, stage: 'poll', message: outcome.message, taskId: created.taskId, format: null };
  }

  let download: DownloadOutcome;
  try {
    download = await downloadTaskFile(client, created.taskId, options);
  } catch (err) {
    return {
      ok: false,
      stage: 'download',
      message: `[compass] downloading task ${created.taskId} failed: ` + (err instanceof Error ? err.message : String(err)),
      taskId: created.taskId,
      format: null,
    };
  }

  if (!download.ok) {
    return { ok: false, stage: 'download', message: download.message, taskId: created.taskId, format: download.format };
  }

  const echo: CompassTaskEcho = {
    ...created.echo,
    ...stripNulls(toEcho(outcome.task)),
    ...stripNulls(download.result.echo),
  };
  const downloadEchoType = download.result.echo.docType ?? download.result.echo.moduleType;
  if (downloadEchoType && downloadEchoType.toUpperCase() !== moduleType) {
    warnings.push(`the download response describes this file as "${downloadEchoType}", not ${moduleType}.`);
  }

  return {
    ok: true,
    taskId: created.taskId,
    bytes: download.result.bytes,
    format: download.result.format,
    echo,
    polls: outcome.polls,
    elapsedMs: outcome.elapsedMs,
    warnings,
  };
}

/** Narrow a summary back to the echo fields (drops taskId/state). */
function toEcho(task: CompassTaskSummary): CompassTaskEcho {
  return {
    moduleType: task.moduleType,
    docType: task.docType,
    windowType: task.windowType,
    endDay: task.endDay,
    fileName: task.fileName,
    status: task.status,
  };
}

/** Merge helper: a later stage's nulls must not erase what an earlier stage saw. */
function stripNulls(echo: CompassTaskEcho): Partial<CompassTaskEcho> {
  const out: Partial<CompassTaskEcho> = {};
  for (const [key, value] of Object.entries(echo)) {
    if (value !== null) out[key as keyof CompassTaskEcho] = value as string;
  }
  return out;
}

// ============================================================
// SPIKE CHECKLIST — what a real shop authorization has to settle
// ============================================================
//
// Nothing below can be resolved offline. Each item names the constant or branch
// that changes once it is answered. Run the admin route with { dryRun: true }
// first: it exercises create → poll → download → format → header sniff and
// writes no fact rows.
//
//  1. API VERSION. DEFAULT_COMPASS_API_VERSION = '202405' is a guess.
//     Symptom of a wrong guess: HTTP 404 from every compass path.
//     Fix: TIKTOK_COMPASS_API_VERSION, or the route's apiVersion override.
//  2. CREATE PARAM LOCATION. body vs signed query string — CompassRequestOptions
//     .paramsIn. Symptom: a permanent 400 naming a missing parameter.
//  3. TASK ID FIELD + NESTING. createExportTask accepts task_id/taskId/id at the
//     top of `data` or under data.task / data.offline_task. If none match it
//     throws WITH the key list; paste that list here and pin the shape.
//  4. LIST CONTAINER KEY. TASK_LIST_KEYS is a guess list. Same treatment: the
//     throw names the keys actually present.
//  5. STATUS VOCABULARY. SUCCEEDED_STATUSES / FAILED_STATUSES / PENDING_STATUSES.
//     Anything unmatched is treated as still-pending and will hit the poll
//     ceiling — the timeout message reports the raw string it kept seeing.
//  6. doc_type ON THE LIST CALL. Currently NOT sent (ListTasksOptions.docType).
//     If the list rejects an unfiltered call, the poll failure message says so.
//  7. HOW LONG A TASK TAKES. budgetMs 40s / maxPolls 12 are sized to fit inside
//     Vercel's 60s function ceiling, not to any measured build time. If real
//     tasks routinely exceed it, the lifecycle must split across invocations —
//     which is why the task id is persisted before polling begins.
//  8. THE FILE FORMAT ITSELF. Every claim that this is xlsx is unverified.
//     detectFileFormat is the check; a non-zip payload fails loudly with its
//     magic bytes, which is the single most valuable output of the first probe.
//  9. SHEET LAYOUT. Even given a zip: whether sheet 1 is the report, whether the
//     header is row 1, and whether TikTok's definitions row is present as it is
//     in the manual export. The header sniff catches a gross mismatch; a subtle
//     one (extra preamble rows) shows up as a low match ratio.
// 10. COLUMN PARITY WITH THE MANUAL EXPORT. If Compass emits different headers
//     than Seller Center, COLUMN_MAPS needs the new names as alternates. The
//     dry run reports matched/missing column lists for exactly this.
// 11. HOW FAR BACK end_day REACHES. Undocumented. planDailyBackfill refuses to
//     silently generate an unbounded task count; the retention edge shows up as
//     failures on the oldest dates.
// 12. RATE LIMITS on task creation across ~14 brands × 3 reports = ~42 tasks a
//     day. The client already types 429s; the sequencing policy is unwritten
//     because there is no observed limit to write it against.
// 13. WHETHER end_day IS INCLUSIVE, and whether PAST_24H anchored on day D means
//     D itself or the 24h ending at D's start. This one silently produces an
//     off-by-one-day of GMV, so verify it by reconciling one brand-day against
//     the manual export before trusting any of it.
//
// NOT WIRED: there is deliberately no cron. Scheduling this before the format is
// verified against a real shop would automate an unverified write across every
// brand nightly. Add the schedule only after items 8-13 are settled.
