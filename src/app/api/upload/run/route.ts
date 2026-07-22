/**
 * POST /api/upload/run
 *
 * Body: { table, brand, reportDate, records, overwrite }
 *
 * Routes the upload through a Postgres RPC that does delete + bulk insert
 * atomically inside a single transaction with `SET LOCAL statement_timeout = '60s'`.
 * That bypasses the 8s authenticator-role timeout that PostgREST inherits at
 * session start — SET LOCAL applies regardless of the role's GUC config.
 *
 * Each upload = one HTTP request to the RPC = one Postgres transaction.
 * No batching loop, no delete-then-fail-to-insert window — if the bulk
 * insert fails for any reason, the delete rolls back too.
 *
 * Auth: owner/admin only via requireAdmin(). Server-side validation hard-blocks
 * uploads where total GMV is $0 but orders > 0 (column-mapping failure
 * signature) BEFORE the RPC is called, so we never destructive-overwrite
 * good data with broken data.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/require-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const IDEMPOTENCY_TTL_HOURS = 24;

type UploadTable = 'creator_performance' | 'video_performance' | 'videos' | 'product_performance';

const RPC_NAME: Record<UploadTable, string> = {
  creator_performance: 'upload_creator_performance_atomic',
  video_performance:   'upload_video_performance_atomic',
  product_performance: 'upload_product_performance_atomic',
  videos:              'upload_videos_atomic',
};

export async function POST(request: NextRequest) {
  // ── Auth: must be owner or admin role.
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
  const isUploadTable = (t: unknown): t is UploadTable =>
    typeof t === 'string' && t in RPC_NAME;
  if (!isUploadTable(table)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
  }
  if (!brand) return NextResponse.json({ error: 'Missing brand' }, { status: 400 });
  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json({ error: 'Missing records' }, { status: 400 });
  }

  // 'videos' is keyed by (video_id, brand) only — no report_date column.
  const requiresReportDate = table !== 'videos';
  if (requiresReportDate && !reportDate) {
    return NextResponse.json({ error: 'Missing reportDate' }, { status: 400 });
  }

  // ── Server-side future-date guard. The client validates too
  // (validateReportDate), but the server is the enforcement point: TikTok
  // data lags ~1 day, so a report date after today is invalid by definition.
  const todayGuard = new Date();
  todayGuard.setUTCHours(12, 0, 0, 0);
  const todayStr = todayGuard.toISOString().split('T')[0];
  if (requiresReportDate && typeof reportDate === 'string' && reportDate > todayStr) {
    return NextResponse.json({
      error: `BLOCKED: report date ${reportDate} is in the future — TikTok data can't be from the future. Fix the date field and retry.`,
    }, { status: 400 });
  }

  // Video List exports include SCHEDULED (not-yet-published) videos carrying
  // their future publish date and all-zero stats (confirmed 2026-07-22: 21
  // rows across 8 brands, every one gmv=0/impressions=0, video IDs minted
  // days before the stored date). Drop those rows — each video re-appears in
  // the next export once it actually publishes. post_date === today is kept:
  // videos posted earlier today legitimately show up in a same-day export.
  let droppedFutureRows = 0;
  let uploadRecords = records;
  if (table === 'videos') {
    uploadRecords = records.filter(r => {
      const pd = (r as Record<string, unknown>).post_date;
      if (typeof pd === 'string' && pd > todayStr) {
        droppedFutureRows++;
        return false;
      }
      return true;
    });
    if (uploadRecords.length === 0) {
      return NextResponse.json({
        error: `BLOCKED: all ${records.length} rows have future post dates — scheduled-only export or wrong file.`,
      }, { status: 400 });
    }
  }

  // ── Server-side hard-block: zero GMV with non-zero orders means the GMV
  // column wasn't matched. Catch this BEFORE we call any destructive RPC.
  const tablesNeedingGmvCheck = new Set<UploadTable>(['creator_performance', 'video_performance', 'product_performance']);
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

  // ── Idempotency check — sha256 the (table, brand, date, records) tuple. If
  //    we've already processed an identical payload within the TTL window,
  //    short-circuit and return the cached result. Prevents a duplicate
  //    upload from doing a destructive overwrite + reinsert when the data
  //    is the same anyway. Common scenario: user re-uploads the same file
  //    thinking the first attempt failed.
  const payloadHash = createHash('sha256')
    .update(JSON.stringify({ table, brand, reportDate, records: uploadRecords }))
    .digest('hex');

  const ttlCutoff = new Date(Date.now() - IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const { data: cached } = await admin
    .from('upload_idempotency')
    .select('row_count, created_at')
    .eq('hash', payloadHash)
    .gte('created_at', ttlCutoff)
    .maybeSingle();

  if (cached) {
    const ageMin = Math.round((Date.now() - new Date(cached.created_at).getTime()) / 60_000);
    return NextResponse.json({
      ok: true,
      upserted: cached.row_count,
      deleted: 0,
      idempotent: true,
      message: `Identical upload was processed ${ageMin}m ago — no-op (idempotency).`,
    });
  }

  // ── Single RPC call — does delete (if overwrite) + bulk insert atomically
  //    inside a transaction with SET LOCAL statement_timeout = '60s' and an
  //    advisory lock on (brand, report_date) to serialize concurrent uploads.
  try {
    const rpcArgs =
      table === 'videos'
        ? { p_records: uploadRecords }
        : { p_brand: brand, p_report_date: reportDate, p_records: uploadRecords, p_overwrite: !!overwrite };

    const { data, error } = await admin.rpc(RPC_NAME[table], rpcArgs);
    if (error) {
      return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 });
    }

    const upserted = (data as { upserted?: number } | null)?.upserted ?? 0;
    const deleted  = (data as { deleted?:  number } | null)?.deleted  ?? 0;

    // Record idempotency hash for the next 24h
    try {
      await admin.from('upload_idempotency').insert({
        hash: payloadHash,
        table_name: table,
        brand,
        report_date: reportDate ?? null,
        row_count: upserted,
        user_id: profile.user_id,
      });
    } catch {
      // Hash insert is best-effort — never fail the upload if the audit-style
      // record can't be stored. Worst case: the next duplicate upload runs
      // again instead of being deduped.
    }

    // ── Activity log (best-effort — don't fail the upload if this errors).
    // activity_log has user_name/user_email/brand/description — NOT user_id.
    // The old insert set user_id, failed on every upload, and the catch
    // swallowed it: ZERO Tempo uploads were ever logged, which blinded the
    // history panel AND the who-uploaded-what forensics during the Jen
    // "brands not reflecting" incident. Log the failure at minimum.
    try {
      const { error: logErr } = await admin.from('activity_log').insert({
        activity_type: 'upload',
        brand,
        user_name: profile.name ?? null,
        user_email: profile.email ?? null,
        description: `Uploaded ${table} for ${brand} (${reportDate ?? 'no date'}): ${upserted} rows`,
        details: {
          table,
          brand,
          report_date: reportDate ?? null,
          row_count: upserted,
          deleted_count: deleted,
          uploaded_by: profile.name ?? profile.email ?? 'unknown',
        },
      });
      if (logErr) console.error('[upload/run] activity_log insert failed:', logErr.message);
    } catch (e) {
      console.error('[upload/run] activity_log insert threw:', e);
    }

    return NextResponse.json({
      ok: true,
      upserted,
      deleted,
      ...(droppedFutureRows > 0 ? { droppedFutureRows } : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
