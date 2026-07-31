/**
 * Compass as a WATCHDOG on the manual upload.
 *
 * WHY THIS EXISTS RATHER THAN AN INGEST: measured 2026-07-31, Compass's only
 * working module is CREATOR (VIDEO and PRODUCT are refused at task creation),
 * and its report carries 11 of the 23 columns the Affiliate Center download
 * has — missing the GMV split, video_views, ctor/ctr, customers, products_sold
 * and the rest of what migration 120 added. It cannot feed creator_performance
 * and must never try.
 *
 * But those 11 columns include GMV, orders, items sold, refunds and items
 * refunded per creator per day, fetched with nobody touching a file. That is
 * an INDEPENDENT second opinion on what the manual upload claims — which is
 * precisely what was missing during the July incident and the 5,000-row
 * truncations, where a short export looked identical to a quiet day.
 *
 * ⚠️ NOTHING HERE WRITES TO A FACT TABLE. It reads creator_performance and
 * writes only compass_verifications. If that ever changes, the guarantee this
 * module exists to provide is gone.
 */
import * as XLSX from 'xlsx';
import { createAdminClient } from '@/lib/supabase/server';
import { fetchDailyExport, type CompassRequestOptions, type PollOptions } from './compass';

/**
 * The Compass creator report's OWN schema — 11 columns, verbatim from the file
 * (task 01KYR32HER…, Transaction_Analysis_Creator_List_20260724-20260724).
 *
 * Deliberately its own map rather than an extension of COLUMN_MAPS.creator_
 * performance. That map describes the 23-column Affiliate Center download;
 * teaching it to also mean "or these 11" would make every header sniff in the
 * upload queue ambiguous between two different reports, which is the exact
 * failure the sniff exists to prevent.
 */
const COMPASS_CREATOR_COLUMNS = {
  creator_name: 'creator name',
  gmv: 'creator-attributed gmv',
  refunds: 'refunds',
  orders: 'attributed orders',
  items_sold: 'creator-attributed items sold',
} as const;

/** Header labels are matched case- and whitespace-insensitively, the same way
 *  the upload maps do — TikTok has renamed columns mid-year before. */
function normalizeLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v !== 'string') return 0;
  // "$2,200.00" / "1,234" / "" — the same shapes the manual parser handles.
  const n = Number(v.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export type VerificationVerdict =
  | 'match'
  | 'csv_short'
  /** Rows missing, GMV intact — the row-cap signature. See TRUNCATION_PCT. */
  | 'csv_truncated'
  | 'csv_over'
  | 'csv_missing'
  | 'api_unavailable';

export interface CompassVerification {
  brandSlug: string;
  reportDate: string;
  verdict: VerificationVerdict;
  detail: string;
  apiGmv: number | null;
  apiOrders: number | null;
  apiItemsSold: number | null;
  apiRefunds: number | null;
  apiCreators: number | null;
  csvGmv: number | null;
  csvCreators: number | null;
  csvLoadedAt: string | null;
  gmvDelta: number | null;
  gmvDeltaPct: number | null;
  taskId: string | null;
}

/**
 * How far apart the two sources may be before it is worth waking someone.
 *
 * 2% rather than 0: the two are not expected to tie exactly. Compass is read
 * later than the export was taken, and TikTok restates for days afterwards —
 * so a small POSITIVE delta is normal and healthy. What is not normal is 45%,
 * which is what a truncated export looks like.
 */
const TOLERANCE_PCT = 2;

/**
 * How much bigger the API's creator count may be before the upload is judged
 * TRUNCATED.
 *
 * MEASURED, and the separation is enormous. Run against jiyu 2026-07-17 — the
 * day the export truncated at exactly 5,000 rows — the watchdog said "match",
 * because GMV was PERFECT on both sides ($20,961.87, 0%). The 5,000-row cap had
 * dropped only ZERO-GMV creators, which a GMV comparison cannot see at all.
 *
 * The creator count sees it instantly:
 *     2026-07-17   API 9,275  vs  CSV 5,000   → +4,275  (46.1%)
 *     2026-07-24   API 8,865  vs  CSV 8,867   →     -2  ( 0.0%)
 *     2026-07-25   API 8,760  vs  CSV 8,761   →     -1  ( 0.0%)
 *
 * Note the DIRECTION: on healthy days the API has one or two FEWER creators, so
 * only a POSITIVE gap is a signal. 5% is far above the observed noise and far
 * below the observed fault.
 */
const TRUNCATION_PCT = 5;

/**
 * Verify ONE brand-day. Read-only against every fact table.
 */
export async function verifyBrandDay(
  brandSlug: string,
  reportDate: string,
  options: { request?: CompassRequestOptions; poll?: PollOptions } = {},
): Promise<CompassVerification> {
  const base: CompassVerification = {
    brandSlug, reportDate, verdict: 'api_unavailable', detail: '',
    apiGmv: null, apiOrders: null, apiItemsSold: null, apiRefunds: null, apiCreators: null,
    csvGmv: null, csvCreators: null, csvLoadedAt: null,
    gmvDelta: null, gmvDeltaPct: null, taskId: null,
  };

  // ── What the manual upload says. Read FIRST and in one query, so the two
  //    sides are compared as of one instant.
  const supabase = await createAdminClient();
  const { data: csvRow, error: csvErr } = await supabase
    .rpc('compass_verification_csv_side', { p_brand: brandSlug, p_date: reportDate })
    .maybeSingle<{ gmv: number | null; creators: number; loaded_at: string | null }>();

  if (csvErr) {
    // A failed READ is not an absence — reporting "the upload is missing"
    // because a query broke would send someone chasing Jen for a file that
    // exists. Same rule as the connections read.
    throw new Error(`[compass-verify] CSV side read failed for ${brandSlug} ${reportDate}: ${csvErr.message}`);
  }

  base.csvGmv = csvRow?.gmv ?? null;
  base.csvCreators = csvRow?.creators ?? 0;
  base.csvLoadedAt = csvRow?.loaded_at ?? null;

  // ── What Compass says.
  const fetched = await fetchDailyExport(brandSlug, reportDate, 'CREATOR', {
    ...options.request,
    windowType: 'PAST_24H',
    poll: options.poll,
  });

  if (!fetched.ok) {
    return {
      ...base,
      verdict: 'api_unavailable',
      taskId: fetched.taskId,
      // An unavailable API says NOTHING about the upload. It must never be
      // rendered as a problem with the data.
      detail: `Compass could not be read (${fetched.stage}): ${fetched.message}`,
    };
  }

  base.taskId = fetched.taskId;

  let rows: Record<string, unknown>[];
  try {
    const ab = fetched.bytes.buffer.slice(
      fetched.bytes.byteOffset,
      fetched.bytes.byteOffset + fetched.bytes.byteLength,
    ) as ArrayBuffer;
    const workbook = XLSX.read(ab, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }) : [];
  } catch (err) {
    return {
      ...base,
      verdict: 'api_unavailable',
      detail: `the Compass file could not be opened: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (rows.length === 0) {
    return { ...base, verdict: 'api_unavailable', detail: 'the Compass file had no rows' };
  }

  // Resolve the header labels ONCE against the first row, so a rename shows up
  // as a missing column rather than as a silent zero.
  const present = new Map<string, string>();
  for (const key of Object.keys(rows[0])) present.set(normalizeLabel(key), key);
  const col = (want: string): string | null => present.get(want) ?? null;

  const cName = col(COMPASS_CREATOR_COLUMNS.creator_name);
  const cGmv = col(COMPASS_CREATOR_COLUMNS.gmv);
  if (!cName || !cGmv) {
    // Summing a column that is not there would produce $0 and read as
    // "the API says this day earned nothing" — a fabricated fact.
    return {
      ...base,
      verdict: 'api_unavailable',
      detail:
        `the Compass file is missing the columns this check needs ` +
        `(creator name: ${cName ? 'ok' : 'MISSING'}, GMV: ${cGmv ? 'ok' : 'MISSING'}). ` +
        `Columns present: ${Object.keys(rows[0]).join(', ')}`,
    };
  }
  const cOrders = col(COMPASS_CREATOR_COLUMNS.orders);
  const cItems = col(COMPASS_CREATOR_COLUMNS.items_sold);
  const cRefunds = col(COMPASS_CREATOR_COLUMNS.refunds);

  let apiGmv = 0, apiOrders = 0, apiItems = 0, apiRefunds = 0;
  const handles = new Set<string>();
  for (const r of rows) {
    const handle = String(r[cName] ?? '').trim().toLowerCase();
    if (!handle) continue;
    handles.add(handle);
    apiGmv += toNumber(r[cGmv]);
    if (cOrders) apiOrders += toNumber(r[cOrders]);
    if (cItems) apiItems += toNumber(r[cItems]);
    if (cRefunds) apiRefunds += toNumber(r[cRefunds]);
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  base.apiGmv = round2(apiGmv);
  base.apiOrders = apiOrders;
  base.apiItemsSold = apiItems;
  base.apiRefunds = round2(apiRefunds);
  base.apiCreators = handles.size;

  // ── The verdict.
  if (base.csvGmv === null || (base.csvCreators ?? 0) === 0) {
    return {
      ...base,
      verdict: 'csv_missing',
      detail:
        `Compass has ${base.apiCreators} creators and $${base.apiGmv} for ${reportDate}, ` +
        `but nothing has been uploaded for that day.`,
    };
  }

  const delta = round2(apiGmv - base.csvGmv);
  const pct = base.csvGmv > 0 ? round2((delta / base.csvGmv) * 100) : null;
  base.gmvDelta = delta;
  base.gmvDeltaPct = pct;

  // ── Row coverage, checked SEPARATELY from money.
  //
  // A day can reconcile to the cent and still be missing thousands of
  // creators, because a row cap drops the zero-GMV tail first. Every dollar
  // ties out while roster counts, posting rates and "who was active" are all
  // wrong. GMV agreement is therefore NOT sufficient evidence of a good day.
  const creatorGap = (base.apiCreators ?? 0) - (base.csvCreators ?? 0);
  const creatorGapPct = (base.apiCreators ?? 0) > 0
    ? round2((creatorGap / (base.apiCreators ?? 1)) * 100)
    : 0;

  if (pct === null || Math.abs(pct) <= TOLERANCE_PCT) {
    if (creatorGapPct > TRUNCATION_PCT) {
      return {
        ...base,
        verdict: 'csv_truncated',
        detail:
          `GMV ties out exactly ($${base.apiGmv}), but the upload is missing ` +
          `${creatorGap.toLocaleString('en-US')} creators — ${base.apiCreators} in Compass vs ` +
          `${base.csvCreators} uploaded (${creatorGapPct}%). That is the row-cap signature: ` +
          `the export dropped its zero-GMV tail, so every dollar reconciles while coverage ` +
          `does not. Re-export ${reportDate} and re-upload it.`,
      };
    }
    return {
      ...base,
      verdict: 'match',
      detail:
        `Compass $${base.apiGmv} vs upload $${base.csvGmv} (${pct ?? 0}%), ` +
        `${base.apiCreators} vs ${base.csvCreators} creators.`,
    };
  }

  return {
    ...base,
    // POSITIVE delta means the API found more, i.e. the upload is SHORT —
    // the truncation signature. Negative is rarer and stranger, so it gets its
    // own verdict rather than being folded in.
    verdict: delta > 0 ? 'csv_short' : 'csv_over',
    detail:
      `Compass $${base.apiGmv} vs upload $${base.csvGmv} — ${delta > 0 ? '+' : ''}${pct}%. ` +
      `Creators: ${base.apiCreators} vs ${base.csvCreators}.` +
      (delta > 0
        ? ` The upload looks SHORT — re-export ${reportDate} and re-upload it.`
        : ` The upload is HIGHER than the API, which is unusual; check the day was not double-loaded.`),
  };
}

/** Persist a verdict. One row per brand-day, refreshed in place — a re-check is
 *  a correction, not a second opinion to accumulate. */
export async function saveVerification(v: CompassVerification): Promise<void> {
  const supabase = await createAdminClient();
  const { error } = await supabase
    .from('compass_verifications')
    .upsert(
      {
        brand_slug: v.brandSlug,
        report_date: v.reportDate,
        api_gmv: v.apiGmv, api_orders: v.apiOrders, api_items_sold: v.apiItemsSold,
        api_refunds: v.apiRefunds, api_creators: v.apiCreators,
        csv_gmv: v.csvGmv, csv_creators: v.csvCreators, csv_loaded_at: v.csvLoadedAt,
        gmv_delta: v.gmvDelta, gmv_delta_pct: v.gmvDeltaPct,
        verdict: v.verdict, detail: v.detail, task_id: v.taskId,
        checked_at: new Date().toISOString(),
      },
      { onConflict: 'brand_slug,report_date' },
    )
    .select('id');
  if (error) throw new Error(`[compass-verify] could not save verdict: ${error.message}`);
}
