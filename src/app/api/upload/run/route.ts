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
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/require-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TABLE_CONFLICT: Record<string, string> = {
  creator_performance: 'creator_name,brand,report_date',
  video_performance:   'video_id,product_id,brand,report_date',
  videos:              'video_id,brand',
  product_performance: 'product_id,brand,report_date',
};

// Smaller batches reduce per-row-trigger work per HTTP request, which matters
// because PostgREST uses the `authenticator` role (statement_timeout=8s).
// 500 was blowing past 8s for creator_performance uploads when its per-row
// sync trigger to daily_creator_stats fires for every inserted row.
// Tradeoff: more HTTP roundtrips per upload, but each completes in well
// under 8s and the upload is idempotent so partial-success is recoverable.
const BATCH_SIZE = 100;

export async function POST(request: NextRequest) {
  // ── Auth: must be owner or admin role. Creators / brand clients / unprofiled
  // users cannot upload data — even if they somehow reach this endpoint.
  const profile = await requireAdmin();
  if (!profile) {
    return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 });
  }

  const admin = await createAdminClient();

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

  // ── Server-side validation (defense-in-depth before any destructive op).
  // The client validates first, but if a future column rename slips past the
  // client, we never want to delete real data and fail to replace it. If GMV
  // is $0 across the file but orders > 0, that's always a column-mapping
  // failure — refuse to delete.
  const tablesNeedingGmvCheck = new Set(['creator_performance', 'video_performance', 'product_performance']);
  if (tablesNeedingGmvCheck.has(table)) {
    let totalGmv = 0;
    let totalOrders = 0;
    for (const r of records) {
      const g = (r as Record<string, unknown>).gmv;
      const o = (r as Record<string, unknown>).orders;
      if (typeof g === 'number') totalGmv += g;
      if (typeof o === 'number') totalOrders += o;
    }
    if (totalGmv === 0 && totalOrders > 0) {
      return NextResponse.json({
        error:
          `BLOCKED: total GMV is $0 across ${records.length} rows but ${totalOrders.toLocaleString()} orders are present. ` +
          `Column mapping likely failed. Refusing to overwrite existing data.`,
      }, { status: 400 });
    }
  }

  try {
    // ── Optionally clear existing rows for this (brand, report_date) before inserting.
    // Validation already passed by here, so a delete-then-fail-to-insert outcome
    // is highly unlikely. (If the upsert errors mid-batch we return an error
    // and the data is partially restored from the new file — the client can retry.)
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
        user_id: profile.user_id,
        details: {
          table,
          brand,
          report_date: reportDate ?? null,
          row_count: upserted,
          uploaded_by: profile.name ?? profile.email ?? 'unknown',
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
