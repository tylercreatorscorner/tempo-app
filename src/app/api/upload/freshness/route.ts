/**
 * GET /api/upload/freshness
 *
 * Returns per-brand, per-file-type freshness data for the upload page.
 * Each brand reports:
 *   - Latest report_date per file type, over the THREE reports that make up the
 *     expected daily set (see FILE_TYPES)
 *   - Overall status (current / behind / stale / no_data) based on creator data
 *   - Detected gaps (days within the last 30 with no creator data, surrounded by days that have it)
 *   - Detected future-dated rows (always invalid — TikTok data can't be from the future)
 *
 * Implementation note: previously fanned out one query per brand per file type
 * (24+ DB round trips for 6 brands). Now uses one query per source table, each
 * pulling all brands at once. Aggregation happens in JS. Cuts panel-load
 * latency roughly 5×.
 *
 * Brand list is dynamic — pulled from brands_v2 (filtered to is_archived=false
 * and excluding the `leefar` umbrella) so newly-added brands appear without
 * a code deploy.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { EXPECTED_DAILY_FILES } from '@/lib/upload/file-detection';

export const runtime = 'nodejs';

// The expected daily set — THREE reports per brand, not four. The Video List
// row is retired: TikTok merged that export into the Video Data schema
// (~2026-07-13), so the *_Video_List_*.xlsx file now lands in
// video_performance and is already covered by the 'video' row below. Tracking
// it separately (via the activity_log upload evidence of mig 112) would report
// a permanently-missing report for a file that no longer exists as its own
// thing. Keep this list aligned with EXPECTED_DAILY_FILE_TYPES in
// lib/upload/file-detection.ts.
// One entry per expected daily export — `fileType` ties each back to
// EXPECTED_DAILY_FILES so the gap checklist names the file the way TikTok
// actually ships it (the video report is still *_Video_List_*, the product
// report *_Transaction_Analysis_*).
const FILE_TYPES = [
  { key: 'creator', fileType: 'creator',          label: 'C', name: 'Creator Data', table: 'creator_performance', dateField: 'report_date' },
  { key: 'video',   fileType: 'video',            label: 'V', name: 'Video Data',   table: 'video_performance',   dateField: 'report_date' },
  { key: 'product', fileType: 'affiliateproduct', label: 'P', name: 'Product Data', table: 'product_performance', dateField: 'report_date' },
] as const;

const EXPORT_TOKEN_BY_TYPE = new Map(EXPECTED_DAILY_FILES.map(f => [f.type, f.exportToken]));

const MATRIX_DAYS = 30;
const UMBRELLA_BRAND_SLUGS = new Set(['leefar']);

type FileStatus = 'ok' | 'stale' | 'missing' | 'never';
type BrandStatus = 'current' | 'behind' | 'stale' | 'never';

export async function GET() {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = await createAdminClient();
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const windowStart = new Date(today);
  windowStart.setUTCDate(windowStart.getUTCDate() - MATRIX_DAYS);
  const windowStartStr = windowStart.toISOString().split('T')[0];

  // Generate every date string in the gap-check window (newest first)
  const allDates: string[] = [];
  for (let i = 1; i <= MATRIX_DAYS; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    allDates.push(d.toISOString().split('T')[0]);
  }

  // ── Pull active brands from brands_v2 (dynamic, no hardcoded list)
  const { data: brandRows } = await admin
    .from('brands_v2')
    .select('slug, name')
    .eq('is_archived', false)
    .eq('tenant_id', profile.tenant_id)
    .order('name');
  const activeBrands = (brandRows as Array<{ slug: string; name: string }> | null ?? [])
    .filter(b => !UMBRELLA_BRAND_SLUGS.has(b.slug));
  const activeBrandSlugs = activeBrands.map(b => b.slug);
  const brandLabelBySlug = new Map(activeBrands.map(b => [b.slug, b.name]));

  // ── One parallel pull per source table — window via a DISTINCT-aggregating
  //    RPC, future rows via the raw SELECT with an explicit LIMIT that's small
  //    enough to never hit the row cap. The window query used to be a raw SELECT
  //    too, which returned ~15k rows/day/brand and silently hit PostgREST's
  //    db-max-rows cap for busy tenants — dropping brands alphabetically past
  //    the cutoff. get_upload_coverage pre-aggregates in Postgres so we get
  //    O(brands × days) rows back regardless of tenant size.
  // Future window starts TOMORROW, not today: videos posted earlier today
  // legitimately appear in a same-day video export with post_date = today
  // (confirmed 2026-07-22 by decoding the timestamp embedded in the TikTok
  // video IDs), and a today-dated report file is allowed with a warning at
  // upload. Only strictly-future dates are impossible.
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(today.getUTCDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  // +30 days, not +7: TikTok lets creators schedule posts up to a month out,
  // and the 2026-07-22 audit found rows 11 days ahead that a 7-day window
  // would have missed. The RPC returns DISTINCT dates, so the wider window
  // costs nothing.
  const futureEnd = new Date(today);
  futureEnd.setUTCDate(today.getUTCDate() + 30);
  const futureEndStr = futureEnd.toISOString().split('T')[0];
  const filePulls = await Promise.all(FILE_TYPES.map(async (ft) => {
    const [windowResult, futureResult] = await Promise.all([
      admin.rpc('get_upload_coverage', {
        p_table:  ft.table,
        p_brands: activeBrandSlugs,
        p_start:  windowStartStr,
        p_end:    yesterdayStr,
      }),
      // Future rows: capped tightly since anything >0 is already an anomaly.
      admin.rpc('get_upload_coverage', {
        p_table:  ft.table,
        p_brands: activeBrandSlugs,
        p_start:  tomorrowStr,
        p_end:    futureEndStr,
      }),
    ]);
    return {
      ft,
      windowRows: (windowResult.data as unknown as Array<{ brand: string; coverage_date: string }> | null) ?? [],
      futureRows: (futureResult.data as unknown as Array<{ brand: string; coverage_date: string }> | null) ?? [],
    };
  }));

  // ── Index per-brand-per-file-type dates
  // shape: brandDates.get(brand).get(fileTypeKey) → Set<dateStr>
  const brandDates = new Map<string, Map<string, Set<string>>>();
  for (const slug of activeBrandSlugs) {
    const inner = new Map<string, Set<string>>();
    for (const ft of FILE_TYPES) inner.set(ft.key, new Set());
    brandDates.set(slug, inner);
  }
  const futureIssues: { brand: string; fileType: string; dates: string[] }[] = [];
  for (const { ft, windowRows, futureRows } of filePulls) {
    for (const row of windowRows) {
      brandDates.get(row.brand)?.get(ft.key)?.add(String(row.coverage_date));
    }
    if (futureRows.length > 0) {
      // Group future rows by brand
      const byBrand = new Map<string, Set<string>>();
      for (const row of futureRows) {
        if (!byBrand.has(row.brand)) byBrand.set(row.brand, new Set());
        byBrand.get(row.brand)!.add(String(row.coverage_date));
      }
      for (const [slug, dates] of byBrand) {
        futureIssues.push({
          brand: brandLabelBySlug.get(slug) ?? slug,
          fileType: ft.name,
          dates: Array.from(dates),
        });
      }
    }
  }

  type FilesMap = Record<string, { status: FileStatus; latestDate: string | null; label: string; name: string }>;
  interface BrandFreshness {
    brand: string;
    displayName: string;
    latestDate: string | null;
    status: BrandStatus;
    statusLabel: string;
    daysBehind: number;
    gaps: string[];
    files: FilesMap;
  }

  const brandResults: BrandFreshness[] = activeBrandSlugs.map(slug => {
    const inner = brandDates.get(slug)!;
    const fileStatuses: FilesMap = {};
    let creatorDates = new Set<string>();
    let overallLatest: string | null = null;

    for (const ft of FILE_TYPES) {
      const dates = inner.get(ft.key)!;
      const sorted = Array.from(dates).sort().reverse();
      const latest = sorted[0] ?? null;

      let status: FileStatus;
      if (!latest) {
        status = 'never';
      } else {
        const latestObj = new Date(latest + 'T12:00:00Z');
        const daysDiff = Math.floor((yesterday.getTime() - latestObj.getTime()) / (1000 * 60 * 60 * 24));
        status = daysDiff <= 0 ? 'ok' : daysDiff <= 2 ? 'stale' : 'missing';
      }
      fileStatuses[ft.key] = { status, latestDate: latest, label: ft.label, name: ft.name };

      if (ft.key === 'creator') {
        overallLatest = latest;
        creatorDates = dates;
      }
    }

    let status: BrandStatus = 'never';
    let statusLabel = 'No Data';
    let daysBehind = -1;
    if (overallLatest) {
      const latestObj = new Date(overallLatest + 'T12:00:00Z');
      daysBehind = Math.floor((yesterday.getTime() - latestObj.getTime()) / (1000 * 60 * 60 * 24));
      if (daysBehind <= 0)      { status = 'current'; statusLabel = 'Current'; }
      else if (daysBehind <= 2) { status = 'behind';  statusLabel = `${daysBehind}d behind`; }
      else                      { status = 'stale';   statusLabel = `${daysBehind}d stale`; }
    }

    const gaps: string[] = [];
    for (let i = 0; i < allDates.length; i++) {
      const dateStr = allDates[i];
      if (dateStr > yesterdayStr) continue;
      if (creatorDates.has(dateStr)) continue;
      const newer = allDates.slice(0, i).some(d => creatorDates.has(d));
      const older = allDates.slice(i + 1).some(d => creatorDates.has(d));
      if (newer && older) {
        const gapDate = new Date(dateStr + 'T12:00:00Z');
        gaps.push(gapDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      }
    }

    return {
      brand: slug,
      displayName: brandLabelBySlug.get(slug) ?? slug,
      latestDate: overallLatest,
      status,
      statusLabel,
      daysBehind,
      gaps,
      files: fileStatuses,
    };
  });

  return NextResponse.json({
    brands: brandResults,
    futureIssues,
    fileTypes: FILE_TYPES.map(ft => ({
      key: ft.key,
      label: ft.label,
      name: ft.name,
      exportToken: EXPORT_TOKEN_BY_TYPE.get(ft.fileType) ?? ft.name.replace(/\s+/g, '_'),
    })),
  });
}
