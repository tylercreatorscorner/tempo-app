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

export const runtime = 'nodejs';

const MATRIX_DAYS = 14;
const UMBRELLA_BRAND_SLUGS = new Set(['leefar']);

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

  // Pull active brands from brands_v2 (excluding the leefar umbrella)
  const { data: brandRows } = await admin
    .from('brands_v2')
    .select('slug, name')
    .eq('is_archived', false)
    .order('name');
  const activeBrands = (brandRows as Array<{ slug: string; name: string }> | null ?? [])
    .filter(b => !UMBRELLA_BRAND_SLUGS.has(b.slug));
  const activeBrandSlugs = activeBrands.map(b => b.slug);

  // Single query (instead of N) — pulls every brand's date set in one call
  const { data: raw } = await admin
    .from(cfg.table)
    .select(`brand, ${cfg.dateField}`)
    .in('brand', activeBrandSlugs)
    .gte(cfg.dateField, oldestDate)
    .lte(cfg.dateField, dates[0]);
  const datesByBrand = new Map<string, Set<string>>();
  for (const slug of activeBrandSlugs) datesByBrand.set(slug, new Set());
  for (const row of (raw as unknown as Array<Record<string, unknown>> | null ?? [])) {
    const slug = String(row.brand);
    datesByBrand.get(slug)?.add(String(row[cfg.dateField]));
  }

  const rows = activeBrands.map(b => ({
    brand: b.slug,
    displayName: b.name,
    cells: dates.map(d => ({ date: d, present: datesByBrand.get(b.slug)?.has(d) ?? false })),
  }));

  return NextResponse.json({ fileType, dates, rows });
}
