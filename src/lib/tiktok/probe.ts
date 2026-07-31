/**
 * Read-only, paginated probes against TikTok, stored raw for later analysis.
 *
 * WHY IT EXISTS: replicating the four CSV exports needs many experiments —
 * does orders/search reproduce the channel split? does shop_videos carry every
 * engagement column video_performance wants? what does a product pull look
 * like? Each experiment is one API call and one query, and running them through
 * a session-gated admin route means a human clicking a button per iteration.
 *
 * So this sits behind the cron bearer token instead. It can LOOK at anything
 * and CHANGE nothing:
 *   · every call is a GET, or a POST /search which is a read
 *   · results land in tiktok_api_captures, an inspection buffer
 *   · nothing here touches a fact table, and nothing here writes to TikTok
 *
 * ⚠️ Pagination keys on the CONTINUATION TOKEN, never on "was this page full".
 * TikTok returns SHORT PAGES MID-SEQUENCE — a real orders run went
 * 99, 98, 100, 100, 100, 97, 99, 98, 36 across nine pages. Stopping at the
 * first non-full page would have silently captured 12% of the day and reported
 * success. And `total_count` is NOT a completeness check: 450 delivered
 * against 452 counted, 827 against 836.
 */
import { createAdminClient } from '@/lib/supabase/server';
import { getActiveConnection, touchApiCall } from './connections';
import { TikTokError } from './client';
import { COMPASS_MARKET_TIME_ZONE } from './compass';

/** TikTok's documented maximum. */
const PAGE_SIZE = 100;
/** A hard stop, not an expectation — a mis-read token must not loop forever
 *  against someone else's rate limiter. */
const MAX_PAGES = 200;
const TOKEN_KEYS = ['next_page_token', 'page_token', 'next_token', 'cursor'];

export interface ProbeResult {
  what: string;
  path: string;
  pages: number;
  rows: number;
  totalCount: number | null;
  containerKey: string | null;
  tokenKey: string | null;
  /** Keys of the first row — what generated types get built from. Never values. */
  rowKeys: string[];
  truncated: boolean;
  error: string | null;
}

function findRows(data: unknown): { key: string | null; rows: unknown[] } {
  if (!data || typeof data !== 'object') return { key: null, rows: [] };
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (Array.isArray(value)) return { key, rows: value };
  }
  return { key: null, rows: [] };
}

function findToken(data: unknown): { key: string | null; token: string | null } {
  if (!data || typeof data !== 'object') return { key: null, token: null };
  const rec = data as Record<string, unknown>;
  for (const key of TOKEN_KEYS) {
    const v = rec[key];
    if (typeof v === 'string' && v.length > 0) return { key, token: v };
  }
  return { key: null, token: null };
}

/** Midnight-to-midnight in the shop's market as unix seconds. Naive UTC names
 *  the wrong day for eight hours a night, which silently shifts a day's orders
 *  across the boundary the whole experiment is about. */
export function marketDayBounds(date: string, timeZone = COMPASS_MARKET_TIME_ZONE) {
  const at = (day: string): number => {
    const guess = new Date(`${day}T00:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(guess);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return Math.floor((guess.getTime() - (asUtc - guess.getTime())) / 1000);
  };
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start: at(date), end: at(next.toISOString().slice(0, 10)) };
}

/** What each probe asks for. Versions are the ones confirmed live 2026-07-27. */
export const PROBES = {
  orders: { version: '202410', path: (v: string) => `/affiliate_seller/${v}/orders/search`, method: 'POST' as const },
  videos: { version: '202509', path: (v: string) => `/analytics/${v}/shop_videos/performance`, method: 'GET' as const },
  lives: { version: '202509', path: (v: string) => `/analytics/${v}/shop_lives/performance`, method: 'GET' as const },
  products: { version: '202509', path: (v: string) => `/analytics/${v}/shop_products/performance`, method: 'GET' as const },
  shop: { version: '202509', path: (v: string) => `/analytics/${v}/shop/performance`, method: 'GET' as const },
} as const;

export type ProbeName = keyof typeof PROBES;

export function isProbeName(v: unknown): v is ProbeName {
  return typeof v === 'string' && v in PROBES;
}

/**
 * An ARBITRARY read-only call, so a newly-discovered endpoint can be tested
 * without a deploy per candidate.
 *
 * The named PROBES above cover the endpoints we already rely on. This covers
 * the ones research turns up — and research turns up a lot of paths that do not
 * exist, so the loop has to be "call it and see" rather than "ship it and see".
 *
 * ⚠️ THE PATH IS CONSTRAINED, deliberately. This runs behind a shared bearer
 * token, so it must not become a way to reach a mutating endpoint. Only
 * /affiliate_seller/ and /analytics/ prefixes are allowed, and only GET plus
 * POST-to-a-/search-path — TikTok's search endpoints are reads that need a body.
 * Anything else is refused before a request is made.
 */
const ALLOWED_PREFIX = /^\/(affiliate_seller|analytics)\/\d{6}\//;

export async function runRawProbe(
  brandSlug: string,
  path: string,
  opts: { method?: 'GET' | 'POST'; query?: Record<string, string>; body?: unknown; runId: string },
): Promise<ProbeResult> {
  const method = opts.method ?? 'GET';
  const out: ProbeResult = {
    what: `raw ${method} ${path}`, path, pages: 0, rows: 0, totalCount: null,
    containerKey: null, tokenKey: null, rowKeys: [], truncated: false, error: null,
  };

  if (!ALLOWED_PREFIX.test(path)) {
    out.error = `refused: path must start /affiliate_seller/{version}/ or /analytics/{version}/`;
    return out;
  }
  // A POST is only a read when it is a search. Everything else under these
  // prefixes can create, cancel or modify, and this tool must not be able to.
  if (method === 'POST' && !/\/(search|query)$/.test(path)) {
    out.error = `refused: POST is only allowed to a /search or /query path (this is a read-only probe)`;
    return out;
  }

  const conn = await getActiveConnection(brandSlug);
  if (!conn.ok) { out.error = conn.message; return out; }
  const supabase = await createAdminClient();

  let token: string | null = null;
  const seen = new Set<string>();
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const query = { ...(opts.query ?? {}), ...(token ? { page_token: token } : {}) };
      const res = method === 'POST'
        ? await conn.client.post<Record<string, unknown>>(path, { query, body: opts.body ?? {}, idempotent: true })
        : await conn.client.get<Record<string, unknown>>(path, query);

      const { key, rows } = findRows(res.data);
      const tok = findToken(res.data);
      if (page === 0) {
        out.containerKey = key;
        out.tokenKey = tok.key;
        const tc = (res.data as Record<string, unknown>)?.total_count;
        out.totalCount = typeof tc === 'number' ? tc : null;
        const first = rows[0];
        // When there is no array at all, report the ENVELOPE keys instead —
        // a single-object response is a real and useful shape, not a failure.
        out.rowKeys = first && typeof first === 'object'
          ? Object.keys(first as object)
          : res.data && typeof res.data === 'object' ? Object.keys(res.data) : [];
      }

      const { error } = await supabase.from('tiktok_api_captures').insert({
        run_id: opts.runId, brand_slug: conn.brandSlug, endpoint: path,
        api_version: path.split('/')[2] ?? '?', request_params: query,
        page_index: page, page_token: token, response: res.data ?? {},
        row_count: rows.length, request_id: res.requestId,
      });
      if (error) throw new Error(`capture insert failed (p${page}): ${error.message}`);

      out.pages = page + 1;
      out.rows += rows.length;
      if (!tok.token || seen.has(tok.token)) break;
      seen.add(tok.token);
      token = tok.token;
      if (page === MAX_PAGES - 1) out.truncated = true;
    }
    await touchApiCall(conn.connectionId);
  } catch (e) {
    const te = e instanceof TikTokError ? e : null;
    out.error = te
      ? `${te.constructor.name} status=${te.status} code=${te.code ?? '—'}: ${te.message}`
      : e instanceof Error ? e.message : String(e);
  }
  return out;
}

export async function runProbe(
  brandSlug: string,
  what: ProbeName,
  date: string,
  runId: string,
): Promise<ProbeResult> {
  const spec = PROBES[what];
  const path = spec.path(spec.version);
  const out: ProbeResult = {
    what, path, pages: 0, rows: 0, totalCount: null,
    containerKey: null, tokenKey: null, rowKeys: [], truncated: false, error: null,
  };

  const conn = await getActiveConnection(brandSlug);
  if (!conn.ok) { out.error = conn.message; return out; }

  const supabase = await createAdminClient();

  // end_date_lt IS exclusive — TikTok refuses a same-day window outright with
  // 28001022 "start time or end time is invalid". One day D is [D, D+1).
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const dayAfter = next.toISOString().slice(0, 10);

  // ⚠️ account_type narrows to affiliate-posted ACCOUNTS. It does NOT make the
  // GMV affiliate-ATTRIBUTED — /analytics/* is Seller Center and its money is a
  // superset. These probes exist for the NON-money columns; the money comes
  // from orders/search.
  const analyticsQuery = {
    start_date_ge: date, end_date_lt: dayAfter,
    page_size: String(PAGE_SIZE), account_type: 'AFFILIATE_ACCOUNTS', currency: 'USD',
  };

  let token: string | null = null;
  const seen = new Set<string>();

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      let data: Record<string, unknown>;
      let requestId: string | null;

      if (spec.method === 'POST') {
        const bounds = marketDayBounds(date);
        const res = await conn.client.post<Record<string, unknown>>(path, {
          query: { page_size: String(PAGE_SIZE), ...(token ? { page_token: token } : {}) },
          body: { create_time_ge: bounds.start, create_time_lt: bounds.end },
          idempotent: true,
        });
        data = res.data; requestId = res.requestId;
      } else {
        const res = await conn.client.get<Record<string, unknown>>(path, {
          ...analyticsQuery, ...(token ? { page_token: token } : {}),
        });
        data = res.data; requestId = res.requestId;
      }

      const { key, rows } = findRows(data);
      const tok = findToken(data);
      if (page === 0) {
        out.containerKey = key;
        out.tokenKey = tok.key;
        const tc = (data as Record<string, unknown>)?.total_count;
        out.totalCount = typeof tc === 'number' ? tc : null;
        const first = rows[0];
        out.rowKeys = first && typeof first === 'object' ? Object.keys(first as object) : [];
      }

      const { error } = await supabase.from('tiktok_api_captures').insert({
        run_id: runId, brand_slug: conn.brandSlug, endpoint: what,
        api_version: spec.version, request_params: { date, path },
        page_index: page, page_token: token, response: data ?? {},
        row_count: rows.length, request_id: requestId,
      });
      if (error) throw new Error(`capture insert failed (${what} p${page}): ${error.message}`);

      out.pages = page + 1;
      out.rows += rows.length;

      // Token-driven, NOT page-fullness. See the header.
      if (!tok.token || seen.has(tok.token)) break;
      seen.add(tok.token);
      token = tok.token;
      if (page === MAX_PAGES - 1) out.truncated = true;
    }
    await touchApiCall(conn.connectionId);
  } catch (e) {
    const te = e instanceof TikTokError ? e : null;
    // 403 and 404 are the same error CLASS here, so status and business code
    // are reported verbatim — that is the difference between "ask TikTok for a
    // scope" and "we typed the path wrong".
    out.error = te
      ? `${te.constructor.name} status=${te.status} code=${te.code ?? '—'}: ${te.message}`
      : e instanceof Error ? e.message : String(e);
  }

  return out;
}
