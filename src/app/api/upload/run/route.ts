/**
 * POST /api/upload/run
 *
 * Body: { table, brand, reportDate, records, overwrite }
 *
 * Server-side upsert path. The client parses the XLSX in-browser (no server
 * file upload needed — files can be 10MB+ and we don't want to babysit
 * uploads). We accept already-parsed records and either:
 *   - upsert directly (no existing data), or
 *   - delete existing for that (brand, report_date) tuple, then insert
 *     (when overwrite=true and existing rows were detected).
 *
 * Uses createAdminClient() to bypass RLS — only authenticated users with a
 * user_profile (any role) can hit this route.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TABLE_CONFLICT: Record<string, string> = {
  creator_performance: 'creator_name,brand,report_date',
  video_performance:   'video_id,product_id,brand,report_date',
  videos:              'video_id,brand',
  product_performance: 'product_id,brand,report_date',
};

const BATCH_SIZE = 500;

export async function POST(request: NextRequest) {
  // ── Auth: must be a logged-in user with a profile
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createAdminClient();
  const { data: profile } = await admin
    .from('user_profiles')
    .select('user_id, role, name')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: 'Forbidden — no user profile' }, { status: 403 });

  // ── Body
  let body: {
    table?: string;
    brand?: string;
    reportDate?: string;
    records?: Record<string, unknown>[];
    overwrite?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { table, brand, reportDate, records, overwrite } = body;
  if (!table || !TABLE_CONFLICT[table]) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
  }
  if (!brand) return NextResponse.json({ error: 'Missing brand' }, { status: 400 });
  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json({ error: 'Missing records' }, { status: 400 });
  }

  // The 'videos' table is keyed by (video_id, brand) only — no report_date column.
  // Other tables require reportDate to scope deletes.
  const requiresReportDate = table !== 'videos';
  if (requiresReportDate && !reportDate) {
    return NextResponse.json({ error: 'Missing reportDate' }, { status: 400 });
  }

  try {
    // ── Optionally clear existing rows for this (brand, report_date) before inserting
    if (overwrite && requiresReportDate) {
      const { error: delErr } = await admin
        .from(table)
        .delete()
        .eq('brand', brand)
        .eq('report_date', reportDate);
      if (delErr) {
        return NextResponse.json({ error: `Delete failed: ${delErr.message}` }, { status: 500 });
      }
    }

    // ── Batched upsert
    let upserted = 0;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const { error } = await admin.from(table).upsert(batch, {
        onConflict: TABLE_CONFLICT[table],
      });
      if (error) {
        return NextResponse.json({
          error: `Upsert failed at batch ${i / BATCH_SIZE + 1}: ${error.message}`,
          upsertedSoFar: upserted,
        }, { status: 500 });
      }
      upserted += batch.length;
    }

    // ── Activity log (best-effort — don't fail the upload if this errors)
    try {
      await admin.from('activity_log').insert({
        activity_type: 'upload',
        user_id: user.id,
        details: {
          table,
          brand,
          report_date: reportDate ?? null,
          row_count: upserted,
          uploaded_by: profile.name ?? user.email ?? 'unknown',
        },
      });
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: true, upserted });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
