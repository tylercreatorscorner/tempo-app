/**
 * POST /api/tiktok/capture   { brand: "jiyu", date: "2026-07-25", orders?: true }
 *
 * The experiment that decides whether the API can replace the spreadsheet.
 *
 * It pulls ONE market-local day for ONE brand from three endpoints, pages each
 * to exhaustion, and stores every page's raw `data` in tiktok_api_captures.
 * It writes NOTHING to a fact table and computes no money. The diff against
 * creator_performance happens afterwards, in SQL, against bytes we can re-read.
 *
 * WHY CAPTURE RATHER THAN INGEST DIRECTLY: src/lib/tiktok/types.ts records that
 * the deleted previous module hand-wrote its response types and got four of
 * them wrong while every file still compiled. Types get generated from real
 * responses. That requires real responses, durably stored.
 *
 * 🚨 NEVER SOURCE GMV FROM /analytics/*. THAT FAMILY IS SELLER CENTER.
 *
 * TikTok splits into Seller Center (ALL shop revenue) and Affiliate Center
 * (affiliate-attributed, commissionable revenue only). Every fact table in
 * Tempo is Affiliate Center. The two API families mirror that split:
 *   /analytics/*         → SELLER CENTER  (shop_videos, shop_lives, shop)
 *   /affiliate_seller/*  → AFFILIATE CENTER (orders/search, Compass CREATOR)
 *
 * account_type=AFFILIATE_ACCOUNTS DOES NOT BRIDGE IT. That parameter filters
 * WHICH ACCOUNT POSTED THE VIDEO — affiliate creator vs the brand's own
 * official account vs a marketing account. It does NOT filter which GMV is
 * affiliate-ATTRIBUTED. For a video posted by an affiliate creator it still
 * returns every dollar that video drove, not the commissionable slice. I sent
 * that parameter and believed it made the data affiliate-only. It does not.
 *
 * MEASURED against live JiYu data: rolling shop_videos up by creator returned
 * 153% of the export (07-25: $29,170.64 vs $19,051.63; 07-18: $29,442.20 vs
 * $20,734.47) — replicating on two independent days, every difference upward,
 * ZERO videos ever lower, items_sold rising in step. orders/search for the
 * same day returned 96% ($18,291.09) with 96 of 131 matched creators exact to
 * the cent. Seller is a superset of affiliate, exactly as the split predicts.
 *
 * Sourcing GMV here would have inflated the managed-share invoice — a straight
 * percentage of affiliate GMV — by roughly 50%, in numbers that look entirely
 * plausible on the page.
 *
 * shop_videos still has a job: views, click_through_rate, title, hash_tags,
 * duration, video_post_time, products[]. Everything EXCEPT money.
 *
 * READ-ONLY against TikTok. Two GETs and (optionally) one POST search.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/server';
import { getActiveConnection, touchApiCall, recordConnectionError } from '@/lib/tiktok/connections';
import { TikTokError } from '@/lib/tiktok/client';
import { COMPASS_MARKET_TIME_ZONE } from '@/lib/tiktok/compass';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Versions confirmed live by the connection test on 2026-07-27. */
const VIDEO_VERSION = '202509';
const LIVE_VERSION = '202509';
const ORDERS_VERSION = '202410';
const SHOP_VERSION = '202509';

/** TikTok's documented maximum. */
const PAGE_SIZE = 100;
/**
 * A hard stop, not an expectation. jiyu's busiest day holds ~12.5k video rows,
 * so 200 pages is ~4x headroom — but the point is that a mis-read page token
 * can loop forever, and a loop against someone else's rate limiter is the one
 * bug that gets an app's access pulled.
 */
const MAX_PAGES = 200;

/** Candidate keys for the continuation token. Unknown until we see a real
 *  response — recorded, not assumed, and reported back so the guess can be
 *  replaced with a fact. */
const TOKEN_KEYS = ['next_page_token', 'page_token', 'next_token', 'cursor'];

interface PageResult {
  endpoint: string;
  version: string;
  pages: number;
  rows: number;
  /** The array key we actually found, so a wrong guess is visible. */
  containerKey: string | null;
  /** Top-level keys of `data`, never values. */
  dataKeys: string[];
  /** Keys of the first row, never values — this is what types get generated from. */
  rowKeys: string[];
  tokenKey: string | null;
  truncated: boolean;
  error: string | null;
}

/** Find the first array in the envelope's `data` and report which key held it.
 *  Guessing a container key by name is how the previous module ended up
 *  reading `data.shop_videos` forever and reporting green on nothing. */
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

/** Midnight-to-midnight in the shop's market, as unix seconds. Naive UTC names
 *  the wrong day for eight hours a night, which would silently shift a whole
 *  day's orders across the boundary we are trying to measure. */
function marketDayBounds(date: string, timeZone = COMPASS_MARKET_TIME_ZONE): { start: number; end: number } {
  const at = (day: string): number => {
    const guess = new Date(`${day}T00:00:00Z`);
    // Two passes: the offset itself depends on the instant (DST), so resolve it
    // against the first guess and then re-apply.
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(guess);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    const offset = asUtc - guess.getTime();
    return Math.floor((guess.getTime() - offset) / 1000);
  };
  const start = at(date);
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start, end: at(next.toISOString().slice(0, 10)) };
}

export async function POST(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let brand = '';
  let date = '';
  let endDate = '';
  let wantOrders = false;
  try {
    const body = (await request.json()) as {
      brand?: string; date?: string; endDate?: string; orders?: boolean;
    };
    brand = (body.brand ?? '').trim();
    date = (body.date ?? '').trim();
    endDate = (body.endDate ?? '').trim();
    wantOrders = body.orders === true;
  } catch {
    return NextResponse.json({ error: 'Body must be JSON: { brand, date }' }, { status: 400 });
  }
  if (!brand) return NextResponse.json({ error: 'Missing brand' }, { status: 400 });
  const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!isDay(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }
  if (endDate && !isDay(endDate)) {
    return NextResponse.json({ error: 'endDate must be YYYY-MM-DD' }, { status: 400 });
  }

  const conn = await getActiveConnection(brand);
  if (!conn.ok) {
    return NextResponse.json(
      { error: conn.message, reason: conn.reason, needsReauthorization: conn.needsReauthorization },
      { status: 409 },
    );
  }

  // Cron and admin paths both run this; createAdminClient is the service-role
  // factory and it is async.
  const supabase = await createAdminClient();
  const runId = crypto.randomUUID();

  // end_date_lt IS exclusive, and TikTok enforces it: a same-day window
  // [D, D] is refused with code 28001022 "start time or end time is invalid".
  // So one day D is [D, D+1).
  //
  // ⚠️ I briefly believed the opposite and shipped a same-day window, on the
  // strength of a captured video whose video_post_time was the day AFTER the
  // window. That was not evidence: the row carried gmv 0.00. This endpoint
  // LISTS videos, including ones with no sales in the window, so a post date
  // outside the range proves nothing on its own — only a non-zero amount
  // outside the range would. Left here because the mistake is re-makeable.
  //
  // The end stays overridable so a multi-day window can be requested
  // deliberately, and so the semantics can be re-measured rather than trusted.
  const windowEnd = endDate || (() => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  const store = async (
    endpoint: string,
    version: string,
    params: Record<string, string>,
    pageIndex: number,
    pageToken: string | null,
    data: unknown,
    rowCount: number,
    requestId: string | null,
  ) => {
    const { error } = await supabase.from('tiktok_api_captures').insert({
      run_id: runId,
      brand_slug: conn.brandSlug,
      endpoint,
      api_version: version,
      request_params: params,
      page_index: pageIndex,
      page_token: pageToken,
      response: data ?? {},
      row_count: rowCount,
      request_id: requestId,
    });
    // A capture that silently failed to persist is worse than one that failed
    // loudly: the whole point is that the bytes still exist afterwards.
    if (error) throw new Error(`capture insert failed (${endpoint} p${pageIndex}): ${error.message}`);
  };

  /** Record a refusal the same way a page is recorded. `response` holds the
   *  error rather than a payload, and row_count is NULL — never 0, because
   *  "TikTok refused" and "TikTok returned nothing" are different facts. */
  const storeFailure = async (
    endpoint: string,
    version: string,
    params: Record<string, string>,
    message: string,
  ) => {
    const { error } = await supabase.from('tiktok_api_captures').insert({
      run_id: runId,
      brand_slug: conn.brandSlug,
      endpoint,
      api_version: version,
      request_params: params,
      page_index: 0,
      response: { error: message },
      row_count: null,
      request_id: null,
    });
    // Best-effort: a failure to record a failure must not mask the failure.
    if (error) console.error(`capture failure-record failed (${endpoint}): ${error.message}`);
  };

  const pageThrough = async (
    endpoint: string,
    version: string,
    path: string,
    baseQuery: Record<string, string>,
  ): Promise<PageResult> => {
    const out: PageResult = {
      endpoint, version, pages: 0, rows: 0,
      containerKey: null, dataKeys: [], rowKeys: [], tokenKey: null,
      truncated: false, error: null,
    };
    let token: string | null = null;
    const seen = new Set<string>();

    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const query = { ...baseQuery, ...(token ? { page_token: token } : {}) };
        const res = await conn.client.get<Record<string, unknown>>(path, query);
        const { key, rows } = findRows(res.data);
        const tok = findToken(res.data);

        if (page === 0) {
          out.dataKeys = res.data && typeof res.data === 'object' ? Object.keys(res.data) : [];
          out.containerKey = key;
          out.tokenKey = tok.key;
          const first = rows[0];
          out.rowKeys = first && typeof first === 'object' ? Object.keys(first as object) : [];
        }

        await store(endpoint, version, query, page, token, res.data, rows.length, res.requestId);
        out.pages = page + 1;
        out.rows += rows.length;

        if (!tok.token) break;
        // A token that repeats means we are about to re-request a page we
        // already have. Treat it as the end, not as more data.
        if (seen.has(tok.token)) break;
        seen.add(tok.token);
        token = tok.token;

        if (page === MAX_PAGES - 1) out.truncated = true;
      }
    } catch (e) {
      const te = e instanceof TikTokError ? e : null;
      // 403-vs-404 cannot be told apart by error CLASS — both are
      // TikTokPermanentError — so the status and business code are reported
      // verbatim. That distinction is the whole difference between "ask TikTok
      // for a scope" and "we typed the path wrong".
      out.error = te
        ? `${te.constructor.name} status=${te.status} code=${te.code ?? '—'}: ${te.message}`
        : e instanceof Error ? e.message : String(e);
      // PERSIST THE FAILURE. The first version of this table stored successes
      // only, so a run where shop_videos errored left no trace at all and the
      // reason existed nowhere but the operator's screen — the same
      // silence-reads-as-success failure this whole surface exists to prevent.
      // A rejected window is a RESULT, and results get written down.
      await storeFailure(endpoint, version, baseQuery, out.error);
    }
    return out;
  };

  const results: PageResult[] = [];
  const window = {
    start_date_ge: date,
    end_date_lt: windowEnd,
    page_size: String(PAGE_SIZE),
    account_type: 'AFFILIATE_ACCOUNTS',
    currency: 'USD',
  };

  results.push(await pageThrough(
    'shop_videos/performance', VIDEO_VERSION,
    `/analytics/${VIDEO_VERSION}/shop_videos/performance`, window,
  ));
  results.push(await pageThrough(
    'shop_lives/performance', LIVE_VERSION,
    `/analytics/${LIVE_VERSION}/shop_lives/performance`, window,
  ));

  // 3b. SHOP TOTAL — seller-center, and now known to be a DIFFERENT UNIVERSE
  //     rather than a denominator for the affiliate figure.
  //
  // This is the arbiter, and it should have been here from the first capture.
  // Rolling shop_videos up gave 42-53% MORE GMV than the spreadsheet on two
  // independent days, always upward, never down, with 13,455 of 13,674 videos
  // matching to the penny. Two explanations survive that evidence — orders
  // settling after the export was taken, or the export systematically
  // excluding something — and NOTHING in our own data can separate them,
  // because both our tables come from the same export.
  //
  // The shop total is the one number that comes from neither. granularity=1D
  // returns per-day shop totals in a single call. Note the path is singular
  // `shop` with NO {shop_id} segment.
  //
  // Kept deliberately, but NOT as a check on affiliate GMV — it cannot be one.
  // It reports the whole shop, so diffing it against the affiliate family
  // measures the organic + paid revenue Tempo has never had visibility into.
  // That is a genuine client-facing number (affiliate share of total shop
  // revenue) and it must never reach a fact table.
  results.push(await pageThrough(
    'shop/performance', SHOP_VERSION,
    `/analytics/${SHOP_VERSION}/shop/performance`,
    { start_date_ge: date, end_date_lt: windowEnd, granularity: '1D', currency: 'USD' },
  ));

  // 4. ORDERS — THE MONEY SOURCE. Affiliate Center, affiliate-attributed by
  //     construction, with no filter parameter to get wrong.
  //
  //     Each SKU line carries creator_username, price{amount}, quantity,
  //     content_type (VIDEO|LIVE|SHOP|PROMOTION_PAGE|LINKSHARE), commission_rate,
  //     settlement_status and estimated/actual commission — so this one endpoint
  //     reconstructs creator-daily GMV across every channel INCLUDING the
  //     product card, which no analytics endpoint exposes at all.
  //
  //     ⚠️ The first capture returned 450 rows against a reported total_count of
  //     452. Two rows short is not a rounding difference; the page loop or the
  //     count is wrong and it must be reconciled before this feeds anything. shop_videos and shop_lives structurally cannot
  // contain showcase/product-card sales, which run 0.4%-6.0% of affiliate GMV
  // per brand (worst at jiyu). orders/search is the only endpoint documented to
  // carry a creator identity on a non-video, non-live sale — and two research
  // agents disagreed about whether it carries an amount at all. This settles it
  // by calling it. POST, but a search is idempotent, so retries are allowed.
  if (wantOrders) {
    // Orders filter on create_time. windowEnd is the EXCLUSIVE end the analytics
    // endpoints take (D+1 for a single day), so the order window closes at the
    // START of that day, never its end.
    //
    // ⚠️ This was wrong once and produced a convincing false result. Using
    // `.end` of windowEnd asked for orders through the END of D+1 — two days —
    // and the two-day total then read as 164% of a one-day CSV figure, which
    // briefly looked like the affiliate endpoint disagreeing with the export.
    // It did not: measured against the matching two CSV days it was 94%.
    const bounds = { start: marketDayBounds(date).start, end: marketDayBounds(windowEnd).start };
    const ordersPath = `/affiliate_seller/${ORDERS_VERSION}/orders/search`;
    const out: PageResult = {
      endpoint: 'orders/search', version: ORDERS_VERSION, pages: 0, rows: 0,
      containerKey: null, dataKeys: [], rowKeys: [], tokenKey: null,
      truncated: false, error: null,
    };
    let token: string | null = null;
    const seen = new Set<string>();
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const query: Record<string, string> = {
          page_size: String(PAGE_SIZE),
          ...(token ? { page_token: token } : {}),
        };
        const res = await conn.client.post<Record<string, unknown>>(ordersPath, {
          query,
          body: { create_time_ge: bounds.start, create_time_lt: bounds.end },
          idempotent: true,
        });
        const { key, rows } = findRows(res.data);
        const tok = findToken(res.data);
        if (page === 0) {
          out.dataKeys = res.data && typeof res.data === 'object' ? Object.keys(res.data) : [];
          out.containerKey = key;
          out.tokenKey = tok.key;
          const first = rows[0];
          out.rowKeys = first && typeof first === 'object' ? Object.keys(first as object) : [];
        }
        await store(
          'orders/search', ORDERS_VERSION,
          { ...query, create_time_ge: String(bounds.start), create_time_lt: String(bounds.end) },
          page, token, res.data, rows.length, res.requestId,
        );
        out.pages = page + 1;
        out.rows += rows.length;
        if (!tok.token || seen.has(tok.token)) break;
        seen.add(tok.token);
        token = tok.token;
        if (page === MAX_PAGES - 1) out.truncated = true;
      }
    } catch (e) {
      const te = e instanceof TikTokError ? e : null;
      out.error = te
        ? `${te.constructor.name} status=${te.status} code=${te.code ?? '—'}: ${te.message}`
        : e instanceof Error ? e.message : String(e);
      await storeFailure('orders/search', ORDERS_VERSION, {
        create_time_ge: String(bounds.start), create_time_lt: String(bounds.end),
      }, out.error);
    }
    results.push(out);
  }

  const anyOk = results.some((r) => r.error === null && r.pages > 0);
  if (anyOk) await touchApiCall(conn.connectionId);
  else {
    const first = results.find((r) => r.error);
    if (first) await recordConnectionError(conn.connectionId, `capture ${first.endpoint}: ${first.error}`);
  }

  return NextResponse.json({
    runId,
    brand: conn.brandSlug,
    date,
    window: { start_date_ge: date, end_date_lt: windowEnd, account_type: 'AFFILIATE_ACCOUNTS' },
    results,
  });
}
