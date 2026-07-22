/**
 * GET /api/upload/history?limit=20
 *
 * Returns the most recent uploads from activity_log. Each entry was written
 * by /api/upload/run on a successful upload. Includes table, brand, date,
 * row count, and uploader name (when available).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { getBrandRegistry, brandLabel } from '@/lib/data/brand-registry';

export const runtime = 'nodejs';

const TABLE_LABELS: Record<string, string> = {
  creator_performance: 'Creator Data',
  video_performance:   'Video Data',
  videos:              'Video List',
  product_performance: 'Product Data',
};

interface ActivityRow {
  id: string;
  created_at: string;
  // activity_log has user_name/user_email — NOT user_id. Selecting user_id
  // made PostgREST 42703 on every request, so history 500'd silently for ages.
  user_name: string | null;
  user_email: string | null;
  details: {
    table?: string;
    brand?: string;
    report_date?: string | null;
    row_count?: number;
    uploaded_by?: string;
  } | null;
}

export async function GET(request: NextRequest) {
  const profile = await requireAdmin();
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const limit = Math.max(1, Math.min(100, Number(request.nextUrl.searchParams.get('limit') ?? '20')));

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from('activity_log')
    .select('id, created_at, user_name, user_email, details')
    .eq('activity_type', 'upload')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reg = await getBrandRegistry();
  const items = (data as ActivityRow[] | null ?? []).map((r) => {
    const details = r.details ?? {};
    return {
      id: r.id,
      createdAt: r.created_at,
      table: details.table ?? '',
      tableLabel: details.table ? (TABLE_LABELS[details.table] ?? details.table) : '',
      brand: details.brand ?? '',
      brandLabel: details.brand ? brandLabel(reg, details.brand) : '',
      reportDate: details.report_date ?? null,
      rowCount: details.row_count ?? 0,
      uploadedBy: details.uploaded_by ?? r.user_name ?? r.user_email ?? 'unknown',
    };
  });

  return NextResponse.json({ items });
}
