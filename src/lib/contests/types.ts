/**
 * Contest engine Phase 1 — the shared contract between the contest APIs and
 * the admin UI. PURE types only (this module is imported by client bundles):
 * no server imports, ever.
 *
 * Mirrors migration 108 (contests / contest_entrants / contest_winners /
 * creator_prizes). Raffle contests can be created and show live entry counts,
 * but the DRAW ships in a later phase — settle returns 400 for them.
 */

export type ContestScoring = 'gmv' | 'posts' | 'manual' | 'raffle';

export type RaffleEntryRule =
  | 'per_posting_day'
  | 'per_post'
  | 'per_gmv_step'
  | 'one_per_creator';

export type ContestStatus = 'draft' | 'live' | 'closed' | 'settled';

/** One prize tier. `amount` null for non-cash prizes ('$250 + featured'). */
export type ContestPrize = { place: number; label: string; amount: number | null };

export type ContestRow = {
  id: string;
  name: string;
  scope_kind: 'brand' | 'segment' | 'all';
  brand_slug: string | null;
  segment_id: string | null;
  scoring: ContestScoring;
  raffle_entry_rule: RaffleEntryRule | null;
  raffle_gmv_step: number | null;
  window_start: string;
  window_end: string;
  prizes: ContestPrize[];
  announce_discord: boolean;
  announce_wins: boolean;
  status: ContestStatus;
  settled_through: string | null;
  created_at: string;
  launched_at: string | null;
  settled_at: string | null;
  entrant_count: number;
};

/** One ranked entrant. Standard competition ranking: ties share a rank, the
 *  next rank skips. For raffle contests `score` = live entry count. */
export type StandingRow = {
  creator_id: string | null;
  display_name: string;
  handles: string[];
  score: number;
  rank: number;
};

export type ContestDetail = {
  contest: ContestRow;
  /** Null for draft, settled, and manual-scoring contests. */
  standings: StandingRow[] | null;
  /** Latest rollup day the standings are scored through (honest cutoff —
   *  never pretend the window end was fully scored if uploads lag). */
  scoredThrough: string | null;
  winners: Array<{
    place: number;
    creator_id: string | null;
    display_name: string;
    score: number | null;
  }>;
  /** The FROZEN cohort (populates the manual winner picker). Null for drafts —
   *  nothing is frozen until launch. */
  entrants: Array<{
    creator_id: string | null;
    display_name: string;
    handles: string[];
  }> | null;
};
