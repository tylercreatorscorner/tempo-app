/**
 * Creator cohort-retention — the data layer behind /retention.
 *
 * Calls the get_cohort_retention RPC (migration 067), which reads the pg_cron
 * roster_creator_posts rollup, and shapes it into a dense heatmap matrix plus a
 * handful of derived insight figures.
 *
 * Definitions (locked with the owner):
 *   cohort  = the month of a creator's FIRST managed post (behavioural).
 *   active  = the creator posted >=1 real video that calendar month.
 * The RPC dedups multi-handle creators to one creator_id, so a person counts once.
 */
import { createAdminClient } from '@/lib/supabase/server';

export interface CohortCell {
  monthIndex: number;
  active: number;
  /** active / cohort size, 0–100. */
  pct: number;
}

export interface CohortRow {
  /** 'YYYY-MM-01'. */
  cohortMonth: string;
  /** 'May 2025'. */
  label: string;
  size: number;
  /** Dense, index 0..(months observable for this cohort); 0-filled for gaps. */
  cells: CohortCell[];
}

export interface CohortInsights {
  totalCreators: number;
  cohortCount: number;
  /** Avg share of a cohort gone by month 1 (0–100). Null if not computable. */
  avgM1DropoffPct: number | null;
  /** Highest / lowest month-1 retention cohort (censored oldest excluded). */
  best: { label: string; pct: number } | null;
  weakest: { label: string; pct: number } | null;
  /** Avg month-1 retention of the most recent cohorts (0–100). */
  recentM1Pct: number | null;
  /** Recent vs older month-1 retention, in percentage points. */
  trendPp: number | null;
}

export interface CohortRetentionResult {
  rows: CohortRow[];
  /** Widest column across all cohorts (0-based). */
  maxMonthIndex: number;
  /** Label of the last COMPLETE month included, e.g. 'Jun 2026'. */
  frontierLabel: string | null;
  insights: CohortInsights;
  hasData: boolean;
}

interface RpcRow {
  cohort_month: string;
  month_index: number;
  active_creators: number;
  cohort_size: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** m1 is 1-based. */
function ymLabel(y: number, m1: number): string {
  return `${MONTHS[m1 - 1]} ${y}`;
}
/** Absolute month ordinal, so diffs are just subtraction. m1 is 1-based. */
function ord(y: number, m1: number): number {
  return y * 12 + (m1 - 1);
}

const EMPTY: CohortRetentionResult = {
  rows: [],
  maxMonthIndex: 0,
  frontierLabel: null,
  insights: {
    totalCreators: 0,
    cohortCount: 0,
    avgM1DropoffPct: null,
    best: null,
    weakest: null,
    recentM1Pct: null,
    trendPp: null,
  },
  hasData: false,
};

const MIN_COHORT_SIZE = 15; // ignore tiny cohorts when picking best/weakest

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/**
 * @param brandSlugs data-store slugs (umbrella-expanded). [] → empty (fail-closed);
 *                   the caller always passes an explicit scope, never null.
 */
export async function getCohortRetention(brandSlugs: string[] | null): Promise<CohortRetentionResult> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc('get_cohort_retention', { p_brand_slugs: brandSlugs });
  if (error) {
    console.error('[cohort-retention] rpc failed:', error.message);
    return EMPTY;
  }
  const raw = (data as RpcRow[] | null) ?? [];
  if (raw.length === 0) return EMPTY;

  // Frontier = last COMPLETE month. Excluding the in-progress current month keeps
  // a cohort's newest cell from reading as an artificially-low partial month.
  const now = new Date();
  const frontierOrd = ord(now.getFullYear(), now.getMonth() + 1) - 1;

  // Group RPC rows by cohort.
  const byCohort = new Map<string, { size: number; active: Map<number, number> }>();
  for (const r of raw) {
    let g = byCohort.get(r.cohort_month);
    if (!g) {
      g = { size: r.cohort_size, active: new Map() };
      byCohort.set(r.cohort_month, g);
    }
    g.active.set(r.month_index, r.active_creators);
  }

  const rows: CohortRow[] = [];
  let maxMonthIndex = 0;
  for (const [cohortMonth, g] of byCohort) {
    const [ys, ms] = cohortMonth.split('-');
    const cohortOrd = ord(Number(ys), Number(ms));
    const observable = frontierOrd - cohortOrd;
    if (observable < 0) continue; // cohort only has the in-progress current month
    const cells: CohortCell[] = [];
    for (let i = 0; i <= observable; i++) {
      const active = g.active.get(i) ?? 0;
      cells.push({ monthIndex: i, active, pct: g.size > 0 ? (active / g.size) * 100 : 0 });
    }
    if (observable > maxMonthIndex) maxMonthIndex = observable;
    rows.push({ cohortMonth, label: ymLabel(Number(ys), Number(ms)), size: g.size, cells });
  }

  if (rows.length === 0) return EMPTY;
  rows.sort((a, b) => a.cohortMonth.localeCompare(b.cohortMonth));

  const frontierY = Math.floor(frontierOrd / 12);
  const frontierM = (frontierOrd % 12) + 1;

  // ── Insights ──────────────────────────────────────────────────────────────
  // Exclude the oldest cohort: it's left-censored (creators already active when
  // tracking began all bucket into it), so its retention reads misleadingly high.
  const pool = rows.length > 2 ? rows.slice(1) : rows;
  const withM1 = pool.filter((r) => r.cells.length > 1);
  const m1pct = (r: CohortRow) => r.cells[1].pct;

  const avgM1DropoffPct = withM1.length ? 100 - avg(withM1.map(m1pct)) : null;

  const ranked = withM1.filter((r) => r.size >= MIN_COHORT_SIZE);
  const rankPool = ranked.length ? ranked : withM1;
  let best: CohortInsights['best'] = null;
  let weakest: CohortInsights['weakest'] = null;
  if (rankPool.length) {
    const sorted = [...rankPool].sort((a, b) => m1pct(b) - m1pct(a));
    best = { label: sorted[0].label, pct: m1pct(sorted[0]) };
    weakest = { label: sorted[sorted.length - 1].label, pct: m1pct(sorted[sorted.length - 1]) };
  }

  let recentM1Pct: number | null = null;
  let trendPp: number | null = null;
  if (withM1.length >= 2) {
    const recent = withM1.slice(-3);
    recentM1Pct = avg(recent.map(m1pct));
    if (withM1.length >= 4) {
      const older = withM1.slice(0, 3);
      trendPp = recentM1Pct - avg(older.map(m1pct));
    }
  }

  return {
    rows,
    maxMonthIndex,
    frontierLabel: ymLabel(frontierY, frontierM),
    insights: {
      totalCreators: rows.reduce((a, r) => a + r.size, 0),
      cohortCount: rows.length,
      avgM1DropoffPct,
      best,
      weakest,
      recentM1Pct,
      trendPp,
    },
    hasData: true,
  };
}
