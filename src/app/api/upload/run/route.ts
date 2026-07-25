/**
 * POST /api/upload/run
 *
 * Body: { table, brand, reportDate, records, overwrite,
 *         fileHash?, chunkIndex?, chunkCount?, fileTotals? }
 *
 * Chunked-upload contract (the last four fields; ALL optional so stale open
 * tabs and direct callers keep working): the client splits one parsed file
 * into strictly sequential ~3MB chunks and sends, on every request,
 *   - fileHash:   sha256 hex over the WHOLE file's parsed payload
 *   - chunkIndex: 0-based position, chunkCount: total chunks
 *   - fileTotals: { gmv, orders, rows } summed over the WHOLE parsed file
 * so both the $0-GMV guard and idempotency operate at FILE grain, not chunk
 * grain (TikTok files are GMV-desc sorted and ~99% $0 rows — chunk sums are
 * meaningless past the head).
 *
 * PAYLOAD SHAPE: `records` is forwarded to the RPC verbatim as jsonb — this
 * route never enumerates metric fields. So the 27 columns added in mig 120
 * (the creator GMV attribution split, per-video funnel/quality metrics, the
 * product period totals) ride along with no change here; each RPC picks them
 * out by key. Two properties of that pass-through are load-bearing and must
 * survive any future payload optimisation:
 *   - A field carrying JSON `null` means "TikTok didn't send this column".
 *     The RPCs insert those columns WITHOUT a COALESCE, so null and an absent
 *     key both land as SQL NULL — distinct from a real 0 (house rule after
 *     the fake-$0 incident). Never substitute 0 for a missing metric here.
 *   - The $0-GMV guard below reads only `gmv`/`orders`, which stay non-null
 *     numbers; the nullable mig-120 fields are deliberately not part of it.
 *
 * Routes the upload through a Postgres RPC that does delete + bulk insert
 * atomically inside a single transaction with `SET LOCAL statement_timeout = '60s'`.
 * That bypasses the 8s authenticator-role timeout that PostgREST inherits at
 * session start — SET LOCAL applies regardless of the role's GUC config.
 *
 * Each chunk = one HTTP request to the RPC = one Postgres transaction.
 * No delete-then-fail-to-insert window — if the bulk insert fails for any
 * reason, the delete rolls back too.
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

/**
 * TikTok exports include SCHEDULED (not-yet-published) videos carrying their
 * future publish date and all-zero stats (confirmed 2026-07-22: 21 rows across
 * 8 brands, every one gmv=0/impressions=0, video IDs minted days before the
 * stored date). Drop those rows — each video re-appears in the next export
 * once it actually publishes. post_date === today is kept: videos posted
 * earlier today legitimately show up in a same-day export. Shared by the
 * `videos` upload branch and the video_performance → registry identity path.
 */
function dropScheduledRows<T extends { post_date?: unknown }>(
  rows: T[],
  todayStr: string,
): { kept: T[]; dropped: number } {
  let dropped = 0;
  const kept = rows.filter(r => {
    const pd = r.post_date;
    if (typeof pd === 'string' && pd > todayStr) {
      dropped++;
      return false;
    }
    return true;
  });
  return { kept, dropped };
}

// No video_link: the RPC DERIVES it from creator_name + video_id (mig 119).
// TikTok's "Video link" column is now an expiring signed CDN URL (~2-day life,
// host tiktokcdn-us.com), and mig 110's ON CONFLICT let it overwrite the good
// canonical link on every upload. Never send the file's value for this field.
interface VideoIdentityRecord {
  video_id: string;
  brand: string;
  creator_name: string;
  video_name: string;
  post_date: string | null;
}

/**
 * TikTok video ids are snowflakes: the top 32 bits are the creation unix
 * timestamp in seconds. Used when a Video Data row lacks post_date so the
 * registry row still gets one. Non-numeric or implausible ids → null — the
 * RPC only fills NULL post_dates, but a junk date would stick, so no date
 * beats a wrong one.
 */
function derivePostDateFromId(videoId: string): string | null {
  if (!/^\d+$/.test(videoId)) return null;
  try {
    // BigInt(32), not a 32n literal — tsconfig targets ES2017, where bigint
    // literals are a compile error (runtime is nodejs, bigints are fine).
    const seconds = Number(BigInt(videoId) >> BigInt(32));
    if (seconds <= 0 || !Number.isSafeInteger(seconds)) return null;
    const iso = new Date(seconds * 1000).toISOString().split('T')[0];
    return iso >= '2016-01-01' ? iso : null;
  } catch {
    return null;
  }
}

/**
 * Derive identity-only registry rows from a Video Data chunk. TikTok merged
 * the Video List export into the Video Data schema (~2026-07-13), so for
 * flipped shops this is the only remaining source of `videos` registry rows.
 * Stats are deliberately NOT derived — upsert_video_identities (mig 110)
 * never touches the lifetime-snapshot stat columns. video_link is not sent
 * either: the RPC derives the canonical permalink from creator_name +
 * video_id (mig 119), because the file's link column is now an expiring
 * signed CDN URL.
 */
function deriveVideoIdentities(
  records: Record<string, unknown>[],
  todayStr: string,
): VideoIdentityRecord[] {
  const byId = new Map<string, VideoIdentityRecord>();
  for (const r of records) {
    const videoId = typeof r.video_id === 'string' ? r.video_id.trim() : '';
    const creatorName = typeof r.creator_name === 'string' ? r.creator_name.trim() : '';
    // creator_name is NOT NULL in prod; empty video_id can't key the registry.
    if (!videoId || !creatorName) continue;
    const videoName = typeof r.video_title === 'string' ? r.video_title : '';
    const postDate =
      typeof r.post_date === 'string' && r.post_date !== ''
        ? r.post_date
        : derivePostDateFromId(videoId);
    const existing = byId.get(videoId);
    if (!existing) {
      byId.set(videoId, {
        video_id: videoId,
        brand: typeof r.brand === 'string' ? r.brand : '',
        creator_name: creatorName,
        video_name: videoName,
        post_date: postDate,
      });
    } else {
      // Per-product rows repeat the video; keep the first non-empty value.
      if (!existing.video_name && videoName) existing.video_name = videoName;
      if (!existing.post_date && postDate) existing.post_date = postDate;
    }
  }
  return dropScheduledRows([...byId.values()], todayStr).kept;
}

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
    // Chunked-upload contract — all optional (stale clients omit them).
    fileHash?: string;
    chunkIndex?: number;
    chunkCount?: number;
    fileTotals?: { gmv?: number; orders?: number; rows?: number };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { table, brand, reportDate, records, overwrite, fileHash, chunkIndex, chunkCount, fileTotals } = body;

  // Malformed chunk metadata degrades to "treat as single-request legacy" /
  // "never record file-grain idempotency" — always the safe direction
  // (re-running an upload is idempotent; wrongly no-oping one is not).
  const chunkIdx =
    typeof chunkIndex === 'number' && Number.isInteger(chunkIndex) && chunkIndex >= 0
      ? chunkIndex
      : null;
  const chunkCnt =
    typeof chunkCount === 'number' && Number.isInteger(chunkCount) && chunkCount > 0
      ? chunkCount
      : null;
  const isFirstChunk = chunkIdx === null || chunkIdx === 0;
  const isFinalChunk = (chunkIdx ?? 0) === (chunkCnt ?? 1) - 1;

  let totals: { gmv: number; orders: number; rows: number | null } | null = null;
  if (fileTotals && typeof fileTotals.gmv === 'number' && typeof fileTotals.orders === 'number') {
    totals = {
      gmv: fileTotals.gmv,
      orders: fileTotals.orders,
      rows: typeof fileTotals.rows === 'number' ? fileTotals.rows : null,
    };
  }
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

  // Scheduled-row drop for the Video List branch (see dropScheduledRows).
  let droppedFutureRows = 0;
  let uploadRecords = records;
  if (table === 'videos') {
    const { kept, dropped } = dropScheduledRows(records, todayStr);
    uploadRecords = kept;
    droppedFutureRows = dropped;
    if (uploadRecords.length === 0) {
      return NextResponse.json({
        error: `BLOCKED: all ${records.length} rows have future post dates — scheduled-only export or wrong file.`,
      }, { status: 400 });
    }
  }

  // ── Server-side hard-block: zero GMV with non-zero orders means the GMV
  // column wasn't matched. Catch this BEFORE we call any destructive RPC.
  // Deliberately NOT keyed off `overwrite`: merge-mode uploads corrupt rows
  // just as surely via ON CONFLICT DO UPDATE, so a broken mapping is blocked
  // either way.
  const tablesNeedingGmvCheck = new Set<UploadTable>(['creator_performance', 'video_performance', 'product_performance']);
  if (tablesNeedingGmvCheck.has(table)) {
    if (totals) {
      // FILE-grain guard. TikTok exports are GMV-desc sorted and ~99% $0
      // rows, so a single chunk's sums say nothing about the file — a tail
      // chunk holding one refund row (orders>0, gmv=0) is normal, not a
      // mapping failure. Only whole-file totals carry the failure signature;
      // never evaluate the chunk's own sums when fileTotals is present.
      if (totals.gmv === 0 && totals.orders > 0) {
        const rowsTxt = totals.rows !== null ? ` across ${totals.rows.toLocaleString()} rows` : '';
        return NextResponse.json({
          error:
            `BLOCKED: this file's total GMV is $0${rowsTxt} but ${totals.orders.toLocaleString()} orders are present — ` +
            `the GMV column wasn't matched, so saving it would corrupt good data. Nothing from this file was written. ` +
            `Re-export the file from TikTok (check that the GMV column is present) and upload it again. ` +
            `If an earlier attempt half-loaded this day, re-upload the fixed file with Overwrite ON to replace the day cleanly.`,
        }, { status: 400 });
      }
    } else if (isFirstChunk) {
      // Legacy fallback (stale clients / direct callers without fileTotals):
      // per-chunk sums, but ONLY on the first (or only) request. GMV-desc
      // files carry all their GMV in the head, so a chunk-0 check still
      // catches mapping failures — without the tail false-positives that
      // used to abort uploads mid-file at exact 5,000-row multiples.
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
            `BLOCKED: total GMV is $0 across ${records.length} rows but ${totalOrders.toLocaleString()} orders are present — ` +
            `the GMV column wasn't matched, so saving it would corrupt good data. Nothing was written. ` +
            `Re-export the file from TikTok (check that the GMV column is present) and upload it again. ` +
            `If an earlier attempt half-loaded this day, re-upload the fixed file with Overwrite ON to replace the day cleanly.`,
        }, { status: 400 });
      }
    }
  }

  // ── Idempotency — short-circuit if this payload already committed within
  //    the TTL window. Prevents a duplicate upload from doing a destructive
  //    overwrite + reinsert when the data is the same anyway. Two grains:
  //
  //    FILE grain (new clients, perf tables): the client sends `fileHash` — a
  //    sha256 over the WHOLE file's parsed payload — on every chunk. A hit
  //    means the entire file committed within the TTL; the response carries
  //    skipRemaining so the client stops the whole file. The hash is recorded
  //    only when the FINAL chunk succeeds (see below), so a mid-file abort
  //    records nothing and a retry re-runs from chunk 0 — including the
  //    healing overwrite DELETE.
  //
  //    Per-chunk grain (stale clients / direct callers, and ALWAYS for
  //    `videos`): sha256 the (table, brand, date, records) tuple. `videos`
  //    stays per-chunk deliberately — it has no reportDate, is a pure upsert,
  //    and each chunk is independently idempotent.
  const fileGrainHash =
    table !== 'videos' && typeof fileHash === 'string' && fileHash.length > 0 ? fileHash : null;
  const idemHash =
    fileGrainHash ??
    createHash('sha256')
      .update(JSON.stringify({ table, brand, reportDate, records: uploadRecords }))
      .digest('hex');

  const ttlCutoff = new Date(Date.now() - IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const { data: cached } = await admin
    .from('upload_idempotency')
    .select('row_count, created_at')
    .eq('hash', idemHash)
    .gte('created_at', ttlCutoff)
    .maybeSingle();

  if (cached) {
    const ageMin = Math.round((Date.now() - new Date(cached.created_at).getTime()) / 60_000);
    return NextResponse.json({
      ok: true,
      upserted: cached.row_count,
      deleted: 0,
      idempotent: true,
      ...(fileGrainHash !== null ? { skipRemaining: true } : {}),
      message:
        fileGrainHash !== null
          ? `This exact file was fully processed ${ageMin}m ago — no-op (idempotency). ` +
            `Nothing to re-run; upload a newer export, or wait ${IDEMPOTENCY_TTL_HOURS}h to force a re-run.`
          : `Identical upload was processed ${ageMin}m ago — no-op (idempotency).`,
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

    // ── TRANSITION HEALING: this request's overwrite DELETE just replaced the
    // day, so idempotency hashes previously recorded for this (table, brand,
    // date) — per-chunk rows from the pre-fileHash era, or other files for
    // the same day — are stale and must never no-op later chunks of this
    // fresh upload. upload_idempotency is a pure dedupe cache; deleting rows
    // here cannot touch data. Scoped to the TTL window (older rows are
    // already ignored by the lookup) and excludes this request's own hash.
    if (overwrite && isFirstChunk && requiresReportDate) {
      try {
        await admin
          .from('upload_idempotency')
          .delete()
          .eq('table_name', table)
          .eq('brand', brand)
          .eq('report_date', reportDate)
          .neq('hash', idemHash)
          .gte('created_at', ttlCutoff);
      } catch {
        // Best-effort — a failed cache purge only risks a spurious no-op.
      }
    }

    // ── Dual-ingest registry writes. TikTok merged the Video List export
    // into the Video Data schema (~2026-07-13), so for flipped shops this
    // upload is the only remaining source of `videos` registry rows (post
    // counts, identity joins). Identity fields only — the RPC never touches
    // the lifetime-snapshot stat columns (mig 079/110). Runs only after the
    // stats RPC committed, never on the idempotent short-circuit. A registry
    // failure must NOT fail the chunk (the stats already landed) — it
    // degrades to a response warning the client can surface.
    //
    // ORDERING (load-bearing): this block must run BEFORE the idempotency
    // hash is recorded below. The file-grain hash means "this file is fully
    // processed — skip retries for 24h", so it may only exist once BOTH the
    // stats RPC and the registry attempt have happened. If the hash were
    // recorded first and the registry call then failed (or the function died
    // between the two), a retry would hit the hash → skipRemaining → the
    // registry path unreachable for 24h. Re-running both on a retry is safe:
    // the stats RPC re-upsert and the identity upsert are both pure ON
    // CONFLICT operations.
    let registryUpserts: number | null = null;
    let registryWarning: string | undefined;
    if (table === 'video_performance') {
      try {
        const identities = deriveVideoIdentities(uploadRecords, todayStr);
        if (identities.length > 0) {
          const { data: regData, error: regError } = await admin.rpc('upsert_video_identities', {
            p_records: identities,
          });
          if (regError) {
            registryWarning =
              `Stats saved, but the video registry update failed: ${regError.message}. ` +
              `Post counts may lag until a later upload refreshes these videos.`;
          } else {
            registryUpserts = (regData as { upserted?: number } | null)?.upserted ?? 0;
          }
        } else {
          registryUpserts = 0;
        }
      } catch (e) {
        registryWarning =
          `Stats saved, but the video registry update failed: ${e instanceof Error ? e.message : 'unknown error'}. ` +
          `Post counts may lag until a later upload refreshes these videos.`;
      }
    }

    // Record the idempotency hash for the next 24h. Deliberately AFTER the
    // dual-ingest registry attempt above — see the ORDERING note there.
    //
    // FILE-GRAIN INVARIANT (load-bearing): when the client sent fileHash, the
    // hash covers the WHOLE file, so it may be recorded only once the whole
    // file has committed. Chunks are stateless requests — the server tracks
    // nothing between them. "Final chunk succeeded ⇒ whole file committed"
    // holds ONLY because the client's chunk loop is strictly sequential and
    // aborts on the first failure. Do NOT parallelize chunks of one file
    // client-side: the final chunk could then land while an earlier chunk
    // failed, recording a file-complete hash for a half-written day — which
    // would no-op the healing re-upload (the exact bug this replaces).
    // Failed/blocked chunks never reach this point, so no hash is ever
    // recorded for them.
    if (fileGrainHash === null || isFinalChunk) {
      try {
        await admin.from('upload_idempotency').insert({
          hash: idemHash,
          table_name: table,
          brand,
          report_date: reportDate ?? null,
          // File-grain rows carry the FILE's parsed row count so the
          // idempotent no-op response reports the file's size, not the last
          // chunk's.
          row_count: fileGrainHash !== null && totals?.rows != null ? totals.rows : upserted,
          user_id: profile.user_id,
        });
      } catch {
        // Hash insert is best-effort — never fail the upload if the audit-style
        // record can't be stored. Worst case: the next duplicate upload runs
        // again instead of being deduped.
      }
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
          // Audit trail for dual-ingest: null = registry write failed
          // (registryWarning surfaced to the operator in the response).
          ...(table === 'video_performance' ? { registry_upserts: registryUpserts } : {}),
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
      ...(registryUpserts !== null ? { registryUpserts } : {}),
      ...(registryWarning ? { registryWarning } : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
