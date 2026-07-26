/**
 * Dual-ingest registry helpers: derive identity-only `videos` rows from a Video
 * Data payload, and drop TikTok's scheduled (not-yet-published) rows.
 *
 * Lifted verbatim out of src/app/api/upload/run/route.ts when the Compass API
 * ingestion path needed the same derivation. Both paths write video_performance
 * from the same export, so both owe the `videos` registry the same identity
 * rows — a second copy of this logic would let one path quietly stop feeding
 * post counts.
 *
 * Pure — no DB, no next/headers.
 */

/** Identity fields only. The RPC never touches lifetime-snapshot stat columns. */
export interface VideoIdentityRecord {
  video_id: string;
  brand: string;
  creator_name: string;
  video_name: string;
  post_date: string | null;
}

/**
 * TikTok exports include SCHEDULED (not-yet-published) videos carrying their
 * future publish date and all-zero stats (confirmed 2026-07-22: 21 rows across
 * 8 brands, every one gmv=0/impressions=0, video IDs minted days before the
 * stored date). Drop those rows — each video re-appears in the next export
 * once it actually publishes. post_date === today is kept: videos posted
 * earlier today legitimately show up in a same-day export.
 */
export function dropScheduledRows<T extends { post_date?: unknown }>(
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

/**
 * TikTok video ids are snowflakes: the top 32 bits are the creation unix
 * timestamp in seconds. Used when a Video Data row lacks post_date so the
 * registry row still gets one. Non-numeric or implausible ids → null — the
 * RPC only fills NULL post_dates, but a junk date would stick, so no date
 * beats a wrong one.
 */
export function derivePostDateFromId(videoId: string): string | null {
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
 * Derive identity-only registry rows from a Video Data payload. TikTok merged
 * the Video List export into the Video Data schema (~2026-07-13), so for
 * flipped shops this is the only remaining source of `videos` registry rows.
 * Stats are deliberately NOT derived — upsert_video_identities (mig 110)
 * never touches the lifetime-snapshot stat columns. video_link is not sent
 * either: the RPC derives the canonical permalink from creator_name +
 * video_id (mig 119), because the file's link column is now an expiring
 * signed CDN URL.
 */
export function deriveVideoIdentities(
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
