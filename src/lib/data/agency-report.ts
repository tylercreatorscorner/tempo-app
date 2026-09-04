/**
 * The agency's own report: the whole portfolio, for leadership.
 *
 * ── How this differs from a client report, and why ──────────────────────────
 *
 * A client report answers "what did my money buy" for ONE brand. This answers
 * "how is the business doing" across all of them, for a reader who is not a
 * client and does not need persuading. So it leads with movement and risk
 * rather than with contribution, and it names the accounts that are going
 * backwards instead of contextualising them.
 *
 * ⚠️ SAME MEMBERSHIP RULE AS EVERY CLIENT REPORT. get_agency_portfolio copies
 * the handle union and the per-day archived_at test verbatim, so a figure here
 * and the same figure on a client's own page cannot disagree. Verified against
 * an independent query: 2,122 signed, $603,200/mo committed, to the dollar.
 *
 * 🚨 COMMITTED RETAINER, NOT EARNED. Client reports divide GMV by retainer
 * EARNED, which is delivery-weighted per creator. Computing that portfolio-wide
 * means joining daily_video_product_stats across every client for a month,
 * which does not finish; and the cheap substitute (roster_creator_posts) counts
 * a different population — 11,515 posts for Cata-Kor in August against the
 * 1,258 its own report states. Rather than put two different return multiples
 * in front of the same people, this reports what the agency is committed to
 * each month, which is exact, and says so wherever the number appears.
 */
import { createAdminClient } from '@/lib/supabase/server';
import { getBrandRegistry } from '@/lib/data/brand-registry';
import { brandColor } from '@/lib/data/brand-registry-core';

export interface AgencyBrandRow {
  slug: string;
  name: string;
  storeGmv: number;
  priorStoreGmv: number;
  rosterGmv: number;
  priorRosterGmv: number;
  signed: number;
  retained: number;
  committedRetainer: number;
  /** Null when there is no prior to compare against, which is not zero growth:
   *  Caramela Beauty started in August and has no July at all. */
  momPct: number | null;
  /** Our share of that client's store this period. */
  sharePct: number | null;
  color: string;
}

export interface AgencySnapshot {
  v: 1;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  priorLabel: string;
  totals: {
    clients: number;
    storeGmv: number;
    priorStoreGmv: number;
    rosterGmv: number;
    priorRosterGmv: number;
    signed: number;
    retained: number;
    committedRetainer: number;
  };
  brands: AgencyBrandRow[];
  /**
   * Anything that would make a figure on this page misleading if read without
   * it. Assembled at BUILD time, not render time, so a report frozen tonight
   * carries the caveats that were true tonight.
   */
  caveats: string[];
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Days in [start, end] with no creator_performance row for a brand.
 *
 * ⚠️ A portfolio total silently absorbs a missing day: Serene Herbs has no
 * Aug 9, so the August roster figure is short by whatever that Sunday earned,
 * and nothing on the page would say so. Naming the brand and the day is the
 * difference between a total and a total you can trust.
 */
async function findGaps(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  start: string,
  end: string,
): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_agency_coverage_gaps', {
    p_start: start,
    p_end: end,
  });
  if (error) {
    console.error('[agency-report] coverage gap read failed:', error.message);
    return [];
  }
  return ((data ?? []) as Array<{ brand_name: string; missing: string }>).map(
    (r) => `${r.brand_name} has no data for ${r.missing}, so its contribution here is short by that day`,
  );
}

export async function buildAgencySnapshot(start: string, end: string): Promise<AgencySnapshot> {
  const supabase = await createAdminClient();

  // Prior period is the SAME length ending the day before this one starts, so
  // a month compares against a month and a fortnight against a fortnight.
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
  const priorEnd = new Date(s.getTime() - 86_400_000);
  const priorStart = new Date(priorEnd.getTime() - (days - 1) * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc('get_agency_portfolio', {
    p_start: start,
    p_end: end,
    p_prior_start: iso(priorStart),
    p_prior_end: iso(priorEnd),
  });
  if (error) throw new Error(`[agency-report] get_agency_portfolio failed: ${error.message}`);

  const raw = (data ?? {}) as { brands?: unknown[]; totals?: Record<string, unknown> };
  const reg = await getBrandRegistry();

  const brands: AgencyBrandRow[] = (raw.brands ?? []).map((b) => {
    const r = b as Record<string, unknown>;
    const rosterGmv = num(r.rosterGmv);
    const priorRosterGmv = num(r.priorRosterGmv);
    const storeGmv = num(r.storeGmv);
    return {
      slug: String(r.slug),
      name: String(r.name),
      storeGmv,
      priorStoreGmv: num(r.priorStoreGmv),
      rosterGmv,
      priorRosterGmv,
      signed: num(r.signed),
      retained: num(r.retained),
      committedRetainer: num(r.committedRetainer),
      // Null, not zero: no prior means "nothing to compare", and a brand that
      // started this period would otherwise read as infinite growth.
      momPct: priorRosterGmv > 0 ? ((rosterGmv - priorRosterGmv) / priorRosterGmv) * 100 : null,
      sharePct: storeGmv > 0 ? (rosterGmv / storeGmv) * 100 : null,
      color: brandColor(reg, String(r.slug)),
    };
  });

  const t = raw.totals ?? {};
  const caveats = await findGaps(supabase, start, end);

  return {
    v: 1,
    generatedAt: new Date().toISOString(),
    periodStart: start,
    periodEnd: end,
    periodLabel: monthLabel(e),
    priorLabel: monthLabel(priorEnd),
    totals: {
      clients: num(t.clients),
      storeGmv: num(t.storeGmv),
      priorStoreGmv: num(t.priorStoreGmv),
      rosterGmv: num(t.rosterGmv),
      priorRosterGmv: num(t.priorRosterGmv),
      signed: num(t.signed),
      retained: num(t.retained),
      committedRetainer: num(t.committedRetainer),
    },
    brands,
    caveats,
  };
}
