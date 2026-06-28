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
import { requireAdmin } from '@/lib/auth/require-admin';

const ALLOWED_TABLES = new Set([
  'creator_performance',
  'video_performance',
  'product_performance',
]);

export async function GET(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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

  // Scope by tenant via the brand: the fact tables are keyed by brand slug and
  // product_performance has no tenant_id, so verify the brand belongs to the
  // caller's tenant before counting (otherwise any admin could probe any
  // tenant's brand/date).
  const { data: brandRow } = await admin
    .from('brands_v2')
    .select('id')
    .eq('slug', brand)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle();
  if (!brandRow) return NextResponse.json({ error: 'Brand not in your tenant' }, { status: 404 });

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
