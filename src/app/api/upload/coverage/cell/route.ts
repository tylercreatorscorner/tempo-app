/**
 * GET /api/upload/coverage/cell?brand=lemme&type=creator&date=2026-07-21
 *
 * Everything known about ONE cell of the coverage ledger, for the drawer the
 * operator opens after the matrix has told them something is wrong:
 *
 *   - the same state the matrix computed (identical inputs, identical function —
 *     the drawer must never disagree with the grid it was opened from)
 *   - what this brand+table normally lands, so "5,000" is obviously wrong
 *   - the neighbouring days, which is what actually settles "is this a truncated
 *     upload or did this brand just have a quiet Tuesday?"
 *   - the ingestion_runs history (migration 116) — the write-side record
 *   - the last activity_log upload entry, i.e. who uploaded what, and when
 *
 * Kept as a SEPARATE request from the matrix on purpose: the matrix is ~2,700
 * cells and must stay cheap, and none of the above is needed until someone
 * clicks. Everything here is keyed to a single (brand, table, date).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import {
  AWAITING_WINDOW_DAYS,
  coverageAnchors,
  computePeerReady,
  TYPE_TO_TABLE,
  TYPE_LABEL,
  cellKey,
  classifyCell,
  toRunFacts,
  type CellState,
  type CoverageBoundsRow,
  type CoverageMatrixRow,
  type CoverageSource,
  type CoverageTypeKey,
  type IngestionRunRow,
  type RunStatus,
} from '@/lib/data/upload-coverage';

export const runtime = 'nodejs';

/** Days either side shown as context in the drawer. */
const NEIGHBOUR_DAYS = 7;

/**
 * Must match the matrix route so the drawer and the grid agree exactly — hence
 * derived from the same exported constant rather than re-typed here.
 */
const LIVE_DAYS = AWAITING_WINDOW_DAYS + 2;
const BASELINE_WINDOW = 7;

interface CoverageRunOut {
  id: string;
  source: CoverageSource;
  status: RunStatus;
  rowsWritten: number | null;
  rowsExpected: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

interface ActivityRow {
  created_at: string;
  user_name: string | null;
  user_email: string | null;
  details: { table?: string; report_date?: string | null; row_count?: number; uploaded_by?: string } | null;
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function shiftDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const brand = (sp.get('brand') ?? '').trim();
  const type = (sp.get('type') ?? '').trim() as CoverageTypeKey;
  const date = (sp.get('date') ?? '').trim();

  if (!brand) return NextResponse.json({ error: 'brand is required' }, { status: 400 });
  if (!TYPE_TO_TABLE[type]) {
    return NextResponse.json(
      { error: `type must be one of ${Object.keys(TYPE_TO_TABLE).join(', ')}` },
      { status: 400 },
    );
  }
  if (!isoDate.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }

  const table = TYPE_TO_TABLE[type];
  const admin = await createAdminClient();
  const now = new Date();

  // Brand identity — also the tenant check. A cell read must not become a way to
  // probe another workspace's brand slugs.
  const { data: brandRow, error: brandErr } = await admin
    .from('brands_v2')
    .select('slug, name, is_archived')
    .eq('tenant_id', profile.tenant_id);
  if (brandErr) {
    return NextResponse.json({ error: `brands_v2 read failed: ${brandErr.message}` }, { status: 500 });
  }
  // The whole brand list, not just this one: peer readiness is a fleet-level
  // fact, and the drawer must reach the same verdict as the grid it was opened
  // from. brands_v2 is tiny.
  const allBrandRows = (brandRow as { slug: string; name: string; is_archived: boolean }[] | null) ?? [];
  const brandMeta = allBrandRows.find((b) => b.slug === brand);
  if (!brandMeta) return NextResponse.json({ error: 'Unknown brand' }, { status: 404 });
  const peerSlugs = allBrandRows.map((b) => b.slug);

  const windowStart = shiftDays(date, -NEIGHBOUR_DAYS);

  // p_end is the GRID's anchor, not this cell's window end.
  //
  // The RPC derives live_cut = p_end - p_live_days, so passing windowEnd
  // (date + 7) put live_cut five days into the FUTURE and the live branch
  // matched nothing — the drawer was served entirely from the up-to-10-minute
  // rollup, including the freshest days the grid reads live. That is how the
  // drawer came to report MISSING for a day the grid had just rendered green,
  // and told the operator to re-upload the file they had uploaded minutes
  // earlier. Anchoring on renderThrough makes live_cut identical in both routes.
  const { renderThrough, judgeThrough } = coverageAnchors(new Date());

  // peerReady is only ever consulted for a day inside the awaiting window, so
  // the fleet is only worth fetching for those. Everywhere else this stays a
  // single-brand read. (p_start widening for an old cell only widens the cheap
  // rollup half — the live fact-table aggregate is bounded by p_live_days.)
  const needsPeers = date > judgeThrough;
  const [matrixRes, boundsRes, runsRes, activityRes] = await Promise.all([
    admin.rpc('get_upload_coverage_matrix', {
      p_brands: needsPeers ? peerSlugs : [brand],
      p_start: windowStart,
      p_end: renderThrough,
      p_live_days: LIVE_DAYS,
      p_window: BASELINE_WINDOW,
    }),
    admin.rpc('get_upload_coverage_bounds', { p_brands: [brand] }),
    admin
      .from('ingestion_runs')
      .select(
        'id, source, brand_slug, target_table, report_date, status, rows_written, rows_expected, error, started_at, finished_at',
      )
      .eq('brand_slug', brand)
      .eq('target_table', table)
      .eq('report_date', date)
      .order('started_at', { ascending: false })
      .limit(50),
    // The upload audit log. Chunked uploads write one row per chunk, so this is
    // "the last chunk that landed", which is the timestamp the operator cares
    // about. Rows only exist since the log's 2026-07-22 repair (it was inserting
    // a phantom user_id and silently failing before that), so its absence on an
    // older day proves nothing and is reported as null rather than as evidence.
    admin
      .from('activity_log')
      .select('created_at, user_name, user_email, details')
      .eq('activity_type', 'upload')
      .eq('brand', brand)
      .contains('details', { table, report_date: date })
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  for (const [label, res] of [
    ['get_upload_coverage_matrix', matrixRes],
    ['get_upload_coverage_bounds', boundsRes],
    ['ingestion_runs', runsRes],
    ['activity_log', activityRes],
  ] as const) {
    if (res.error) {
      return NextResponse.json({ error: `${label} failed: ${res.error.message}` }, { status: 500 });
    }
  }

  const matrixRows = ((matrixRes.data as unknown as CoverageMatrixRow[] | null) ?? []).filter(
    (r) => r.target_table === table,
  );
  const byDate = new Map<string, CoverageMatrixRow>();
  for (const r of matrixRows) byDate.set(cellKey(r.brand_slug, r.target_table, String(r.report_date)), r);

  const boundsRow = ((boundsRes.data as unknown as CoverageBoundsRow[] | null) ?? []).find(
    (b) => b.target_table === table,
  );

  const runRows = (runsRes.data as unknown as IngestionRunRow[] | null) ?? [];
  const runs: CoverageRunOut[] = runRows.map((r) => ({
    id: r.id,
    source: r.source,
    status: r.status,
    rowsWritten: r.rows_written,
    rowsExpected: r.rows_expected,
    error: r.error,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  }));

  const peerReadyKeys = needsPeers ? computePeerReady(matrixRows, [date]) : new Set<string>();

  const self = byDate.get(cellKey(brand, table, date));
  const state: CellState = classifyCell({
    date,
    rows: self ? self.row_count : null,
    trailingMedian: self?.trailing_median ?? null,
    leadingMedian: self?.leading_median ?? null,
    run: runRows.length > 0 ? toRunFacts(runRows[0]) : null,
    brandArchived: brandMeta.is_archived,
    judgeThrough,
    peerReady: peerReadyKeys.has(`${table}|${date}`),
    firstDate: boundsRow?.first_date ?? null,
    now,
  });

  const activityRow = ((activityRes.data as unknown as ActivityRow[] | null) ?? [])[0] ?? null;
  const lastUpload = activityRow
    ? {
        createdAt: activityRow.created_at,
        uploadedBy:
          activityRow.details?.uploaded_by ?? activityRow.user_name ?? activityRow.user_email ?? null,
        rowCount: activityRow.details?.row_count ?? null,
      }
    : null;

  // The neighbourhood. This is the number that makes a partial obvious: 348 next
  // to 9,705 / 9,590 / 9,853 needs no explanation.
  const neighbours: { date: string; rows: number | null }[] = [];
  for (let i = NEIGHBOUR_DAYS; i >= -NEIGHBOUR_DAYS; i--) {
    const d = shiftDays(date, -i);
    const row = byDate.get(cellKey(brand, table, d));
    neighbours.push({ date: d, rows: row ? row.row_count : null });
  }

  return NextResponse.json({
    brand,
    brandLabel: brandMeta.name,
    type,
    typeLabel: TYPE_LABEL[type],
    table,
    date,
    state,
    // The 28-day median for this brand+table — the "normally lands" number.
    // Falls back to the local trailing baseline when the rollup has no history.
    medianRows: boundsRow?.median_rows ?? self?.trailing_median ?? null,
    firstDate: boundsRow?.first_date ?? null,
    lastDate: boundsRow?.last_date ?? null,
    trailingMedian: self?.trailing_median ?? null,
    leadingMedian: self?.leading_median ?? null,
    isLive: self?.is_live ?? false,
    neighbours,
    runs,
    lastUpload,
    generatedAt: now.toISOString(),
  });
}
