/**
 * GET /api/upload/matrix?fileType=creator
 *
 * Returns a 14-day matrix of (brand × day) → has data / no data, for a given
 * file type. Used by the Data Status Matrix on /upload to show "I'm missing
 * Lemme on Tuesday" at a glance.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { ACTIVE_BRANDS, BRAND_DISPLAY_NAMES } from '@/lib/utils/constants';

export const runtime = 'nodejs';

const MATRIX_DAYS = 14;

const FILE_TYPE_TABLES: Record<string, { table: string; dateField: string }> = {
  creator:   { table: 'creator_performance', dateField: 'report_date' },
  video:     { table: 'video_performance',   dateField: 'report_date' },
  videolist: { table: 'videos',              dateField: 'post_date'   },
  product:   { table: 'product_performance', dateField: 'report_date' },
};

export async function GET(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const fileType = request.nextUrl.searchParams.get('fileType') || 'creator';
  const cfg = FILE_TYPE_TABLES[fileType];
  if (!cfg) return NextResponse.json({ error: 'Invalid fileType' }, { status: 400 });

  const admin = await createAdminClient();
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);

  // Build the date column list (newest first)
  const dates: string[] = [];
  for (let i = 0; i < MATRIX_DAYS; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  const oldestDate = dates[dates.length - 1];

  // For each brand, fetch which dates have data in the window
  const rows = await Promise.all(ACTIVE_BRANDS.map(async (brand) => {
    const { data: raw } = await admin
      .from(cfg.table)
      .select(cfg.dateField)
      .eq('brand', brand)
      .gte(cfg.dateField, oldestDate)
      .lte(cfg.dateField, dates[0]);
    // Cast through unknown — dynamic column name defeats Supabase's typed client
    const data = (raw as unknown as Array<Record<string, unknown>>) ?? [];
    const present = new Set(data.map(r => String(r[cfg.dateField])));
    return {
      brand,
      displayName: BRAND_DISPLAY_NAMES[brand] ?? brand,
      cells: dates.map(d => ({ date: d, present: present.has(d) })),
    };
  }));

  return NextResponse.json({ fileType, dates, rows });
}
