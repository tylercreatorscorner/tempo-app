/**
 * Top Agency Affiliates — cross-brand creator leaderboard.
 *
 * Calls the get_affiliate_leaderboard RPC (migration 071) over the pg_cron
 * roster_creator_daily rollup, then enriches the (≤limit) returned rows with a
 * real name + avatar (for creators we've identified) and a "managed" flag. ALL
 * affiliates are ranked — the point is to surface high-GMV UNMANAGED creators who
 * already sell across several of the agency's brands (recruitment targets).
 */
import { createAdminClient } from '@/lib/supabase/server';

export interface AffiliateBrandGmv {
  brand: string; // umbrella brand display name
  gmv: number;
}
export interface AffiliateRow {
  identity: string;
  handle: string;
  creatorId: string | null;
  /** Real name when we know it; null → the UI shows @handle. */
  name: string | null;
  avatar: string | null;
  isManaged: boolean;
  agencyGmv: number;
  /** # distinct umbrella brands with GMV > 0 in the period. */
  brandOverlap: number;
  breakdown: AffiliateBrandGmv[];
}
export interface AffiliateLeaderboardResult {
  rows: AffiliateRow[];
  totalGmv: number;
  hasData: boolean;
}

interface RpcRow {
  identity: string;
  top_handle: string;
  creator_id: string | null;
  agency_gmv: number | string;
  brand_overlap: number;
  breakdown: { brand: string; gmv: number | string }[] | null;
}

const EMPTY: AffiliateLeaderboardResult = { rows: [], totalGmv: 0, hasData: false };

/**
 * @param brandSlugs data-store slugs (umbrella-expanded); [] → empty (fail-closed).
 * @param startDate/endDate inclusive 'YYYY-MM-DD'
 */
export async function getAffiliateLeaderboard(
  brandSlugs: string[] | null,
  startDate: string,
  endDate: string,
  limit = 100,
): Promise<AffiliateLeaderboardResult> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc('get_affiliate_leaderboard', {
    p_start_date: startDate,
    p_end_date: endDate,
    p_brand_slugs: brandSlugs,
    p_limit: limit,
  });
  if (error) {
    console.error('[affiliate-leaderboard] rpc failed:', error.message);
    return EMPTY;
  }
  const raw = (data as RpcRow[] | null) ?? [];
  if (raw.length === 0) return EMPTY;

  // Enrich the linked creators (≤limit) with name + avatar, and flag the managed ones.
  const creatorIds = Array.from(new Set(raw.map((r) => r.creator_id).filter((v): v is string => !!v)));
  const meta = new Map<string, { name: string | null; avatar: string | null }>();
  const managed = new Set<string>();
  if (creatorIds.length > 0) {
    const [cvRes, mcRes] = await Promise.all([
      supabase.from('creators_v2').select('id, real_name, discord_avatar').in('id', creatorIds),
      supabase.from('managed_creators').select('creator_id').in('creator_id', creatorIds).is('archived_at', null),
    ]);
    for (const c of (cvRes.data as { id: string; real_name: string | null; discord_avatar: string | null }[] | null) ?? []) {
      meta.set(c.id, { name: c.real_name, avatar: c.discord_avatar });
    }
    for (const m of (mcRes.data as { creator_id: string }[] | null) ?? []) {
      managed.add(m.creator_id);
    }
  }

  const rows: AffiliateRow[] = raw.map((r) => {
    const m = r.creator_id ? meta.get(r.creator_id) : undefined;
    return {
      identity: r.identity,
      handle: r.top_handle,
      creatorId: r.creator_id,
      name: m?.name ?? null,
      avatar: m?.avatar ?? null,
      isManaged: r.creator_id ? managed.has(r.creator_id) : false,
      agencyGmv: Number(r.agency_gmv) || 0,
      brandOverlap: r.brand_overlap,
      breakdown: (r.breakdown ?? []).map((b) => ({ brand: b.brand, gmv: Number(b.gmv) || 0 })),
    };
  });

  return { rows, totalGmv: rows.reduce((s, r) => s + r.agencyGmv, 0), hasData: true };
}
