/**
 * GET /api/upload/coverage?days=30
 *
 * The coverage ledger: every expected brand-day, and whether we actually have
 * it. Four states, never blurred — complete / partial / missing / not_expected.
 *
 * This is the surface that would have caught both of the failures that motivated
 * it: the six brands that went dark on 2026-07-09 (thirty red MISSING cells,
 * instead of dashboards quietly serving ten-day-old numbers), and the days
 * stranded at exact 5,000-row multiples by a per-chunk guard, which every other
 * freshness signal in the codebase reports as green because rows exist.
 *
 * PERFORMANCE. ~30 brands x 30 days x 3 reports is ~2,700 cells over fact tables
 * holding 2.7M / 2.2M / 62K rows. Measured on prod 2026-07-26:
 *   - a 30-day GROUP BY (brand, report_date) is 396 ms + 581 ms + 11 ms, and the
 *     ledger needs 37 days of it for the baselines — over a second warm, several
 *     cold, for a page opened every morning. So counts come from the
 *     upload_coverage_daily rollup (migration 123), refreshed by pg_cron.
 *   - the freshest 2 days are still read live from the fact tables (208 ms
 *     measured) so cron lag can never report a just-uploaded day as missing.
 *     Telling the operator to re-upload a day that was already fine is the same
 *     crying-wolf failure as a bad heuristic.
 *
 * NEVER catch-to-zero. A failed read here renders as "data missing" and sends
 * the operator re-uploading days that are fine, so every read either succeeds or
 * 500s with the reason attached.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { fetchAllRows } from '@/lib/data/fetch-all-rows';
import {
  AWAITING_WINDOW_DAYS,
  coverageAnchors,
  computePeerReady,
  COVERAGE_TABLES,
  DEAD_RUN_MS,
  TABLE_TO_TYPE,
  buildDayList,
  cellKey,
  classifyCell,
  deriveExportLayout,
  toRunFacts,
  type CoverageBoundsRow,
  type CoverageBrand,
  type CoverageCell,
  type CoverageMatrixRow,
  type CoverageResponse,
  type CoverageTypeKey,
  type ExportLayoutRow,
  type IngestionRunRow,
  type RunFacts,
} from '@/lib/data/upload-coverage';

export const runtime = 'nodejs';

/** The umbrella has no exports of its own; its stores are tracked individually. */
const UMBRELLA_BRAND_SLUGS = new Set(['leefar']);

const MAX_DAYS = 90;
const DEFAULT_DAYS = 30;

/**
 * Days read live from the fact tables rather than the 10-minute rollup.
 *
 * Must cover the awaiting window PLUS the newest judged columns — those are the
 * only cells that can raise a fresh alarm, and serving them from the cron
 * rollup means an operator who repairs one watches it stay red for up to ten
 * minutes after the page refetches. Measured cost of the extra two days on the
 * worst table (video_performance): 148ms vs 117ms.
 */
const LIVE_DAYS = AWAITING_WINDOW_DAYS + 2;

/** Baseline window, each side. Must match the RPC's p_window. */
const BASELINE_WINDOW = 7;

/** How stale the rollup may get before we say so out loud. */
const ROLLUP_STALE_MS = 45 * 60 * 1000;

interface BrandRow {
  slug: string;
  name: string;
  is_archived: boolean;
}

export async function GET(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const daysParam = Number(request.nextUrl.searchParams.get('days') ?? DEFAULT_DAYS);
  const days = Number.isFinite(daysParam)
    ? Math.max(1, Math.min(MAX_DAYS, Math.trunc(daysParam)))
    : DEFAULT_DAYS;

  const admin = await createAdminClient();
  const now = new Date();

  // Two frontiers, both from the wall clock — see coverageAnchors(). We RENDER
  // through yesterday and JUDGE through three days back; the columns between are
  // inside TikTok's publication window and are shown without a verdict. Rendering
  // through yesterday and judging it too is what made every healthy brand read
  // "Silent 1d" in red every morning.
  const { renderThrough, judgeThrough } = coverageAnchors(now);
  const anchor = new Date(`${renderThrough}T12:00:00Z`);
  const dayList = buildDayList(days, anchor); // newest first
  const endDate = dayList[0];
  const startDate = dayList[dayList.length - 1];

  // ── Brands ────────────────────────────────────────────────────────────────
  const { data: brandData, error: brandErr } = await admin
    .from('brands_v2')
    .select('slug, name, is_archived')
    .eq('tenant_id', profile.tenant_id)
    .order('name');
  if (brandErr) {
    return NextResponse.json(
      { error: `brands_v2 read failed: ${brandErr.message}` },
      { status: 500 },
    );
  }
  const allBrands = ((brandData as BrandRow[] | null) ?? []).filter(
    (b) => !UMBRELLA_BRAND_SLUGS.has(b.slug),
  );
  const allSlugs = allBrands.map((b) => b.slug);

  if (allSlugs.length === 0) {
    return NextResponse.json<CoverageResponse>({
      days: dayList,
      brands: [],
      generatedAt: now.toISOString(),
      judgeThrough,
      warnings: ['No brands found for this workspace.'],
    });
  }

  // ── Facts ─────────────────────────────────────────────────────────────────
  // Four reads, all small: the matrix is O(brands x days x tables) and the other
  // three are O(brands x tables) or smaller. None of them is a fact-table scan
  // from this process's point of view.
  const [matrixRes, boundsRes, layoutRes, videoGmvRes] = await Promise.all([
    admin.rpc('get_upload_coverage_matrix', {
      p_brands: allSlugs,
      p_start: startDate,
      p_end: endDate,
      p_live_days: LIVE_DAYS,
      p_window: BASELINE_WINDOW,
    }),
    admin.rpc('get_upload_coverage_bounds', { p_brands: allSlugs }),
    admin.rpc('get_upload_export_layout', { p_brands: allSlugs }),
    // The money cross-check for video cells. IN PARALLEL deliberately: it costs
    // ~8s on a 30-day all-brands window because it touches both fact tables, so
    // running it in sequence would add that to every page load instead of
    // hiding it behind the matrix read.
    admin.rpc('get_video_gmv_coverage', {
      p_brands: allSlugs,
      p_start: startDate,
      p_end: endDate,
    }),
  ]);

  // A failed money-adjacent read must surface, not render as an empty grid.
  // An empty grid here reads as "everything is missing", which is the most
  // expensive possible lie on this page.
  for (const [label, res] of [
    ['get_upload_coverage_matrix', matrixRes],
    ['get_upload_coverage_bounds', boundsRes],
    ['get_upload_export_layout', layoutRes],
  ] as const) {
    if (res.error) {
      return NextResponse.json(
        { error: `${label} failed: ${res.error.message}` },
        { status: 500 },
      );
    }
  }

  const matrixRows = (matrixRes.data as unknown as CoverageMatrixRow[] | null) ?? [];
  const boundsRows = (boundsRes.data as unknown as CoverageBoundsRow[] | null) ?? [];
  const layoutRows = (layoutRes.data as unknown as ExportLayoutRow[] | null) ?? [];

  // ── The write-side ledger (migration 116) ────────────────────────────────
  let runRows: IngestionRunRow[];
  try {
    runRows = await fetchAllRows<IngestionRunRow>(
      () =>
        admin
          .from('ingestion_runs')
          .select(
            'id, source, brand_slug, target_table, report_date, status, rows_written, rows_expected, error, started_at, finished_at',
          )
          .gte('report_date', startDate)
          .lte('report_date', endDate)
          .order('started_at', { ascending: false }),
      'coverage/ingestion_runs',
    );
  } catch (e) {
    return NextResponse.json(
      { error: `ingestion_runs read failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  // ── Index ─────────────────────────────────────────────────────────────────
  /**
   * brand|date -> percentage of this day's video GMV that actually landed.
   *
   * ⚠️ NON-FATAL BY DESIGN, and it must stay that way. This detector is an
   * enhancement to a page whose job is to tell the truth about coverage; if its
   * read fails, every video cell must fall back to the row-count verdicts it had
   * before, NOT render as broken. An absent entry means "not judged", never
   * "passed" — classifyCell treats undefined as the check not having run.
   */
  const videoGmvPct = new Map<string, number>();
  if (videoGmvRes.error) {
    console.error('[coverage] video GMV cross-check failed, falling back to row counts only:',
      videoGmvRes.error.message);
  } else {
    for (const r of (videoGmvRes.data ?? []) as Array<{
      brand_slug: string; report_date: string; pct_of_expected: number | string | null;
    }>) {
      const pct = typeof r.pct_of_expected === 'number' ? r.pct_of_expected : Number(r.pct_of_expected);
      if (Number.isFinite(pct)) videoGmvPct.set(`${r.brand_slug}|${String(r.report_date)}`, pct);
    }
  }

  const counts = new Map<string, CoverageMatrixRow>();
  let oldestRollupRefresh: number | null = null;
  for (const r of matrixRows) {
    counts.set(cellKey(r.brand_slug, r.target_table, String(r.report_date)), r);
    if (!r.is_live && r.refreshed_at) {
      const t = new Date(r.refreshed_at).getTime();
      if (oldestRollupRefresh === null || t < oldestRollupRefresh) oldestRollupRefresh = t;
    }
  }

  // Newest run per cell. runRows arrives sorted started_at DESC, so first wins.
  const runs = new Map<string, RunFacts>();
  let deadRuns = 0;
  let oldestRunSeen: string | null = null;
  for (const r of runRows) {
    if (!r.report_date) continue;
    const k = cellKey(r.brand_slug, r.target_table, String(r.report_date));
    if (!runs.has(k)) runs.set(k, toRunFacts(r));
    if (oldestRunSeen === null || r.started_at < oldestRunSeen) oldestRunSeen = r.started_at;
    if (r.status === 'running' && now.getTime() - new Date(r.started_at).getTime() > DEAD_RUN_MS) {
      deadRuns += 1;
    }
  }

  const bounds = new Map<string, CoverageBoundsRow>();
  for (const b of boundsRows) bounds.set(`${b.brand_slug}|${b.target_table}`, b);

  const layouts = new Map<string, ExportLayoutRow>();
  for (const l of layoutRows) layouts.set(l.brand_slug, l);

  const warnings: string[] = [];

  // If the rollup has never been seeded, `bounds` is empty and every type would
  // silently be judged "not produced by this brand" — a completely green,
  // completely empty ledger. That failure mode is worse than any false red, so
  // it fails loud: expect all three reports and say why.
  const boundsUsable = boundsRows.length > 0;
  if (!boundsUsable) {
    warnings.push(
      'The coverage rollup (upload_coverage_daily) returned no history, so expected reports ' +
        'could not be derived from what each brand actually produces. Falling back to expecting ' +
        'all three reports from every active brand. Run select public.refresh_upload_coverage(60).',
    );
  }

  // ── Assemble ──────────────────────────────────────────────────────────────
  const brands: CoverageBrand[] = [];
  const splitExportBrands: string[] = [];
  const noPipelineBrands: string[] = [];

  // ── Peer readiness ────────────────────────────────────────────────────────
  // See computePeerReady(): a day inside the awaiting window is already proven
  // ingestible once all but at most one of a table's producers have rows for it,
  // so one brand's hole surfaces at D+2 instead of waiting out the calendar
  // floor. Shared with the drawer route so the two cannot reach different
  // verdicts for the same cell.
  const peerReadyKeys = computePeerReady(counts.values(), dayList);

  for (const b of allBrands) {
    // Which reports do we expect of this brand? Observed history, not a
    // hardcoded list: a report is expected once the brand has actually produced
    // it. A brand that has never written product_performance gets no product
    // cells rather than a month of red for a report it does not ship — the
    // fastest way to teach an operator that red means nothing is to show them
    // red that does not matter.
    const expectedTypes = COVERAGE_TABLES.filter(
      (t) => !boundsUsable || bounds.has(`${b.slug}|${t.table}`),
    );

    // brands_v2 carries brands that have never fed the upload pipeline at all
    // (roster-and-retainer-only brands). A row of thirty empty cells for each of
    // them buries the six brands that genuinely went dark. They are excluded
    // from the grid and NAMED in the warnings instead — "should this brand be
    // uploading?" is a real question, it just is not a coverage failure.
    if (expectedTypes.length === 0) {
      // An archived brand with no history is simply gone; naming it would be
      // noise. Only a LIVE brand that has never uploaded is worth a question.
      if (!b.is_archived) noPipelineBrands.push(b.name);
      continue;
    }

    // An archived brand with no rows in the window is just noise on the page.
    // An archived brand that DOES have rows stays visible (greyed, never counted
    // as a failure) because its numbers are still feeding historical reporting.
    if (b.is_archived) {
      const hasRows = expectedTypes.some((t) =>
        dayList.some((d) => (counts.get(cellKey(b.slug, t.table, d))?.row_count ?? 0) > 0),
      );
      if (!hasRows) continue;
    }

    const layout = layouts.get(b.slug);
    const exportLayout = deriveExportLayout(
      layout?.last_impressions_write ?? null,
      layout?.last_videos_write ?? null,
      now,
    );
    if (exportLayout === 'split' && !b.is_archived) splitExportBrands.push(b.name);

    const cells: CoverageCell[] = dayList.map((date) => {
      const types: Partial<Record<CoverageTypeKey, ReturnType<typeof classifyCell>>> = {};
      for (const t of expectedTypes) {
        const key = cellKey(b.slug, t.table, date);
        const row = counts.get(key);
        types[TABLE_TO_TYPE[t.table]] = classifyCell({
          date,
          rows: row ? row.row_count : null,
          trailingMedian: row?.trailing_median ?? null,
          leadingMedian: row?.leading_median ?? null,
          run: runs.get(key) ?? null,
          brandArchived: b.is_archived,
          firstDate: bounds.get(`${b.slug}|${t.table}`)?.first_date ?? null,
          judgeThrough,
          peerReady: peerReadyKeys.has(`${t.table}|${date}`),
          // Video cells only: the cross-check compares video_performance
          // against creator_performance, so it says nothing about the creator
          // or product files.
          videoGmvPct:
            t.table === 'video_performance'
              ? videoGmvPct.get(`${b.slug}|${date}`) ?? null
              : null,
          now,
        });
      }
      return { date, types };
    });

    brands.push({
      slug: b.slug,
      label: b.name,
      expected: !b.is_archived,
      cells,
      exportLayout,
    });
  }

  // ── Warnings — the honest caveats, not decoration ────────────────────────
  if (oldestRollupRefresh !== null && now.getTime() - oldestRollupRefresh > ROLLUP_STALE_MS) {
    const mins = Math.round((now.getTime() - oldestRollupRefresh) / 60000);
    warnings.push(
      `Counts older than ${LIVE_DAYS} days come from a rollup last refreshed ${mins} minutes ago ` +
        `(pg_cron job refresh-upload-coverage). The most recent ${LIVE_DAYS} days are read live and are current.`,
    );
  }

  // The run ledger only started on 2026-07-24. Days before it are judged by
  // row-count shape alone, and the operator should know which half of the page
  // has write-side evidence behind it.
  if (oldestRunSeen && oldestRunSeen.slice(0, 10) > startDate) {
    warnings.push(
      `The ingestion run ledger has no rows before ${oldestRunSeen.slice(0, 10)}; earlier days are ` +
        'judged by row-count heuristics alone (an exact 5,000-row chunk multiple, or a day far below ' +
        'what the brand normally lands).',
    );
  } else if (runRows.length === 0) {
    warnings.push(
      'No ingestion_runs rows cover this window, so every cell is judged by row-count heuristics ' +
        'alone. Run-level evidence (failed, partial, or dead-in-flight jobs) starts once the ' +
        'ingest paths write the ledger.',
    );
  }

  if (deadRuns > 0) {
    warnings.push(
      `${deadRuns} ingestion run${deadRuns === 1 ? '' : 's'} in this window ${deadRuns === 1 ? 'is' : 'are'} ` +
        "still marked 'running' more than an hour after starting — those jobs died without reporting an error.",
    );
  }

  if (noPipelineBrands.length > 0) {
    warnings.push(
      `Not shown — no TikTok export has ever landed for ${noPipelineBrands.join(', ')}, so there is ` +
        'nothing to be missing. If any of these should be uploading daily, that is a gap this page ' +
        'cannot see.',
    );
  }

  if (splitExportBrands.length > 0) {
    warnings.push(
      `${splitExportBrands.join(', ')} still appear to ship the pre-merge split TikTok export ` +
        '(their Video List file carries engagement numbers into `videos`). All three tracked reports ' +
        'land in the same tables under either layout, so this does not change what is expected — ' +
        'but the file the operator downloads differs.',
    );
  }

  const body: CoverageResponse = {
    days: dayList,
    brands,
    generatedAt: now.toISOString(),
    judgeThrough,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
  return NextResponse.json(body);
}
