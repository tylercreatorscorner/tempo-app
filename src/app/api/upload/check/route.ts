/**
 * GET /api/upload/check?table=&brand=&date=
 *
 * Returns the count of existing rows for a given (table, brand, report_date)
 * tuple — used by the upload UI to show a confirmation modal before
 * overwriting existing data. The "videos" table doesn't have report_date so
 * it's excluded from the overwrite check (it gets upserted by video_id only).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const ALLOWED_TABLES = new Set([
  'creator_performance',
  'video_performance',
  'product_performance',
]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const table = searchParams.get('table') || '';
  const brand = searchParams.get('brand') || '';
  const date  = searchParams.get('date')  || '';

  if (!ALLOWED_TABLES.has(table)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
  }
  if (!brand || !date) {
    return NextResponse.json({ error: 'Missing brand or date' }, { status: 400 });
  }

  const admin = await createAdminClient();
  const { count, error } = await admin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('brand', brand)
    .eq('report_date', date);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ existingCount: count ?? 0 });
}
