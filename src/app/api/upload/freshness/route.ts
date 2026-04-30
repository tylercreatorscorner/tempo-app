/**
 * GET /api/upload/freshness
 *
 * Returns per-brand, per-file-type freshness data for the upload page.
 * Each brand reports:
 *   - Latest date in each of the 4 source tables (creator/video/videolist/product)
 *   - Overall status (current / behind / stale / no_data) based on creator data
 *   - Detected gaps (days within the last 30 with no creator data, surrounded by days that have it)
 *   - Detected future-dated rows (always invalid — TikTok data can't be from the future)
 *
 * Used by the FreshnessPanel component on /upload to give Tyler at-a-glance
 * "what have I uploaded recently / what's missing" visibility.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { ACTIVE_BRANDS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

export const runtime = 'nodejs';

const FILE_TYPES: Array<{ key: string; label: string; name: string; table: string; dateField: string }> = [
  { key: 'creator',   label: 'C', name: 'Creator Data',  table: 'creator_performance', dateField: 'report_date' },
  { key: 'video',     label: 'V', name: 'Video Data',    table: 'video_performance',   dateField: 'report_date' },
  { key: 'videolist', label: 'L', name: 'Video List',    table: 'videos',              dateField: 'post_date'   },
  { key: 'product',   label: 'P', name: 'Product Data',  table: 'product_performance', dateField: 'report_date' },
];

const MATRIX_DAYS = 30;

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

  // Build the date strings for the gap check
  const allDates: string[] = [];
  for (let i = 1; i <= MATRIX_DAYS; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    allDates.push(d.toISOString().split('T')[0]);
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

  const futureIssues: { brand: string; fileType: string; dates: string[] }[] = [];

  // Fan out: 4 file types × N brands = ~24 quick queries. All in parallel.
  const brandResults = await Promise.all(ACTIVE_BRANDS.map(async (brand): Promise<BrandFreshness> => {
    const fileStatuses: FilesMap = {};
    let overallLatest: string | null = null;
    let creatorDates = new Set<string>();

    await Promise.all(FILE_TYPES.map(async (ft) => {
      // Latest in window. Supabase's typed client returns GenericStringError[]
      // when the selected column is a dynamic string (ft.dateField), so we cast
      // through unknown to a generic record shape we can index into.
      const { data: rowsRaw } = await admin
        .from(ft.table)
        .select(ft.dateField)
        .eq('brand', brand)
        .gte(ft.dateField, windowStartStr)
        .lte(ft.dateField, yesterdayStr)
        .order(ft.dateField, { ascending: false });
      const rows = (rowsRaw as unknown as Array<Record<string, unknown>>) ?? [];

      // Future-dated check (always invalid)
      const { data: futureRaw } = await admin
        .from(ft.table)
        .select(ft.dateField)
        .eq('brand', brand)
        .gt(ft.dateField, yesterdayStr)
        .limit(5);
      const future = (futureRaw as unknown as Array<Record<string, unknown>>) ?? [];
      if (future.length > 0) {
        const dates = Array.from(new Set(future.map(r => String(r[ft.dateField]))));
        futureIssues.push({ brand: BRAND_DISPLAY_NAMES[brand] ?? brand, fileType: ft.name, dates });
      }

      const dates = new Set(rows.map(r => String(r[ft.dateField])));
      const latest = rows.length > 0 ? String(rows[0][ft.dateField]) : null;
      let status: FileStatus;
      if (!latest) {
        status = 'never';
      } else {
        const latestObj = new Date(latest + 'T12:00:00Z');
        const daysDiff = Math.floor((yesterday.getTime() - latestObj.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff <= 0)      status = 'ok';
        else if (daysDiff <= 2) status = 'stale';
        else                    status = 'missing';
      }
      fileStatuses[ft.key] = { status, latestDate: latest, label: ft.label, name: ft.name };

      if (ft.key === 'creator') {
        overallLatest = latest;
        creatorDates = dates;
      }
    }));

    // Overall status (anchored on creator data — primary KPI source)
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

    // Gaps: days inside the window where creator data is missing but data exists on both sides
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
      brand,
      displayName: BRAND_DISPLAY_NAMES[brand] ?? brand,
      latestDate: overallLatest,
      status,
      statusLabel,
      daysBehind,
      gaps,
      files: fileStatuses,
    };
  }));

  return NextResponse.json({
    brands: brandResults,
    futureIssues,
    fileTypes: FILE_TYPES.map(ft => ({ key: ft.key, label: ft.label, name: ft.name })),
  });
}
