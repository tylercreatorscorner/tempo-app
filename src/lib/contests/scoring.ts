/**
 * Contest scoring — turn a contest + its FROZEN entrants into ranked
 * standings.
 *
 * Scores come from get_contest_scores (mig 109), which reads ONLY the pg_cron
 * roster rollups (mig 059) — never raw fact tables. The RPC is called once
 * with the UNION of every entrant's handles; rows are re-grouped per HUMAN
 * here (sum across their handles — the contest_entrants freeze already
 * deduped people, mig 108).
 *
 * scoredThrough is the honest cutoff: the latest rollup day, NOT the window
 * end — if uploads lag, standings are only scored through what actually
 * landed, and every surface says so.
 */
import { createAdminClient } from '@/lib/supabase/server';
import { getBrandRegistry, expandSlugs } from '@/lib/data/brand-registry';
import type { ContestScoring, RaffleEntryRule, StandingRow } from './types';

export interface ScoringEntrant {
  creator_id: string | null;
  display_name: string | null;
  handles: string[];
}

export interface ScorableContest {
  scope_kind: 'brand' | 'segment' | 'all';
  brand_slug: string | null;
  scoring: ContestScoring;
  raffle_entry_rule: RaffleEntryRule | null;
  raffle_gmv_step: number | null;
  /** yyyy-MM-dd, inclusive. */
  window_start: string;
  window_end: string;
}

/**
 * The rollup brand filter for a contest's scores. Brand-scoped contests score
 * WITHIN their brand (umbrella-expanded to data-store slugs — the standing
 * rule; never a raw umbrella slug against the store-grain rollups). Segment-
 * and everyone-scoped contests score agency-wide (null = no filter).
 */
async function contestBrandSlugs(
  contest: Pick<ScorableContest, 'scope_kind' | 'brand_slug'>,
): Promise<string[] | null> {
  if (contest.scope_kind !== 'brand') return null;
  if (!contest.brand_slug) {
    throw new Error('[contests/scoring] brand-scoped contest has no brand_slug');
  }
  return expandSlugs(await getBrandRegistry(), contest.brand_slug);
}

interface ScoreRow {
  handle: string;
  gmv: number | string | null;
  posts: number | string | null;
  posting_days: number | string | null;
}

/** Latest day present in the scoring rollup (get_contest_scored_through,
 *  mig 109), narrowed to the given data-store slugs when non-null — a
 *  brand-scoped contest's cutoff must reflect THAT brand's upload lag.
 *  Throws on failure — a freshness read must not silently vanish. */
export async function getContestScoredThrough(
  brandSlugs: string[] | null = null,
): Promise<string | null> {
  const admin = await createAdminClient();
  const { data, error } = await admin.rpc('get_contest_scored_through', {
    p_brand_slugs: brandSlugs,
  });
  if (error) {
    throw new Error(`[contests/scoring] get_contest_scored_through failed: ${error.message}`);
  }
  return (data as string | null) ?? null;
}

export interface ContestStandingsResult {
  /** Null for manual scoring (no computed standings by definition). */
  standings: StandingRow[] | null;
  scoredThrough: string | null;
}

export async function computeContestStandings(
  contest: ScorableContest,
  entrants: ScoringEntrant[],
): Promise<ContestStandingsResult> {
  const brandSlugs = await contestBrandSlugs(contest);
  const scoredThrough = await getContestScoredThrough(brandSlugs);
  if (contest.scoring === 'manual') return { standings: null, scoredThrough };

  const rule = contest.raffle_entry_rule;
  const step = contest.raffle_gmv_step;
  if (contest.scoring === 'raffle') {
    if (!rule) throw new Error('[contests/scoring] raffle contest has no raffle_entry_rule');
    if (rule === 'per_gmv_step' && !(typeof step === 'number' && step > 0)) {
      throw new Error('[contests/scoring] per_gmv_step raffle has no positive raffle_gmv_step');
    }
  }

  const allHandles = Array.from(
    new Set(
      entrants.flatMap((e) => e.handles.map((h) => h.trim().toLowerCase())).filter(Boolean),
    ),
  );

  const byHandle = new Map<string, { gmv: number; posts: number; postingDays: number }>();
  if (allHandles.length > 0) {
    // RPC results are exempt from the PostgREST 1000-row cap, and the handle
    // array travels in the POST body — no URL-length chunking needed.
    const admin = await createAdminClient();
    const { data, error } = await admin.rpc('get_contest_scores', {
      p_handles: allHandles,
      p_start: contest.window_start,
      p_end: contest.window_end,
      p_brand_slugs: brandSlugs,
    });
    // A failed score read must THROW → the route 500s. Never render fake 0s.
    if (error) {
      throw new Error(`[contests/scoring] get_contest_scores failed: ${error.message}`);
    }
    for (const r of (data as ScoreRow[] | null) ?? []) {
      byHandle.set(r.handle, {
        gmv: Number(r.gmv) || 0,
        posts: Number(r.posts) || 0,
        postingDays: Number(r.posting_days) || 0,
      });
    }
  }

  const scored = entrants.map((e) => {
    let gmv = 0;
    let posts = 0;
    let postingDays = 0;
    for (const h of e.handles) {
      const s = byHandle.get(h.trim().toLowerCase());
      if (!s) continue;
      gmv += s.gmv;
      posts += s.posts;
      // Known + accepted for Phase 1: posting_days is per-handle, so a person
      // posting from two handles on the same day counts 2 days here (affects
      // per_posting_day raffles only; true dedup needs per-day RPC rows).
      postingDays += s.postingDays;
    }
    let score: number;
    if (contest.scoring === 'gmv') {
      score = gmv;
    } else if (contest.scoring === 'posts') {
      score = posts;
    } else {
      // raffle — entries per the contest's entry rule.
      if (rule === 'per_posting_day') score = postingDays;
      else if (rule === 'per_post') score = posts;
      else if (rule === 'per_gmv_step') score = Math.floor(gmv / (step as number));
      else score = 1; // one_per_creator — one entry for being in the contest
    }
    return {
      creator_id: e.creator_id,
      display_name: e.display_name || e.handles[0] || 'Unknown creator',
      handles: e.handles,
      score,
    };
  });

  // Standard competition ranking: ties share a rank, the next rank skips.
  // The name tie-break only stabilizes ORDER within a tie — never the rank.
  scored.sort((a, b) => b.score - a.score || a.display_name.localeCompare(b.display_name));
  const standings: StandingRow[] = scored.map((s, i) => ({ ...s, rank: i + 1 }));
  for (let i = 1; i < standings.length; i++) {
    if (standings[i].score === standings[i - 1].score) standings[i].rank = standings[i - 1].rank;
  }

  return { standings, scoredThrough };
}
