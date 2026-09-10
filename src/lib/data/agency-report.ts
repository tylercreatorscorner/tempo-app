/**
 * The agency's own report: the whole portfolio, for leadership.
 *
 * ── How this differs from a client report ────────────────────────────────────
 *
 * A client report answers "what did my money buy" for ONE brand. This answers
 * "how is the business doing" across all of them, for a reader who does not
 * need persuading. It leads with movement and risk, and names the accounts
 * going backwards instead of contextualising them.
 *
 * ── What v2 fixes ─────────────────────────────────────────────────────────────
 *
 * 🚨 v1 LED WITH A NUMBER THAT CANNOT BE TRENDED. "22.1% of client stores" is a
 * blend over whichever clients exist that month: 2 clients in Oct 2025 at
 * 71.5%, 15 in Aug 2026 at 22.2%. Most of that fall is signing bigger clients
 * where we run a smaller slice, not performance. v2 adds a SAME-STORE series
 * (only clients present every month of the window), which is the comparable
 * one, and states its client count so nobody reads composition as decline.
 *
 * 🚨 v1 SORTED MOVEMENT BY DOLLARS ONLY, which buried the operational story.
 * M3 fell 12.6% while its own store grew 36.5% and ranked fifth worst at
 * -$1,635; Physicians Choice ranked third worst while holding its share
 * exactly. v2 carries each client's share-point change and its store's own
 * movement, so "the market moved" and "we moved" are separable.
 *
 * 🚨 v1 HAD NO PER-CLIENT RETURN. The portfolio read 4.2x while three clients
 * sat under 1.0x. v2 carries GMV per $1 committed per client and flags the
 * ones that cost more than they produce.
 *
 * ⚠️ SAME MEMBERSHIP RULE AS EVERY CLIENT REPORT, copied verbatim into
 * get_agency_portfolio and get_agency_trend, so a client's figure here and on
 * their own report are the same number.
 *
 * ⚠️ COMMITTED RETAINER, NOT EARNED. Client reports divide by retainer earned
 * (delivery-weighted per creator). Computing that portfolio-wide timed out, and
 * the cheap substitute counts a different population. The page says so.
 *
 * ⚠️ INVOICED IS NOT REVENUE. Invoices are per month AND per payee, so one
 * client can carry two (one per manager arrangement); they are summed per
 * client. Nothing here is a payment record, and a client with no invoice is
 * shown as not invoiced rather than as zero.
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
  /** Null when there is no prior to compare against, which is not zero growth. */
  momPct: number | null;
  /** Our share of that client's store this period. */
  sharePct: number | null;
  color: string;
  // ── v2. All optional: a report frozen under v1 lacks them and renders without.
  /** Our share of that client's store in the prior period. */
  priorSharePct?: number | null;
  /** Share this period minus share last period, in percentage points. */
  sharePts?: number | null;
  /** The client's own store movement, so our move can be read against it. */
  storeMomPct?: number | null;
  /** Roster GMV per $1 of committed monthly retainer. Null with no retainer. */
  returnX?: number | null;
  /** Sum of this period's invoices for the client, across payees. Null = none. */
  invoiced?: number | null;
  invoiceCount?: number;
  /** Active roster rows with no TikTok handle anywhere: signed, unmeasurable. */
  noHandle?: number;
}

export interface AgencyTrendPoint {
  /** YYYY-MM */
  month: string;
  /** "Mar" */
  label: string;
  /** Clients with any store GMV that month. Stated so composition is visible. */
  clients: number;
  rosterGmv: number;
  storeGmv: number;
  /** Same two figures over the SAME-STORE set only. */
  sameStoreRoster: number;
  sameStoreStore: number;
}

export interface AgencySnapshot {
  v: 1 | 2;
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
    // v2
    invoiced?: number;
    invoiceCount?: number;
    invoicedClients?: number;
    noHandle?: number;
  };
  brands: AgencyBrandRow[];
  /** v2. Six months ending with this period, plus which clients are same-store. */
  trend?: { points: AgencyTrendPoint[]; sameStore: string[] };
  /**
   * Anything that would make a figure misleading if read without it. Built at
   * BUILD time, so a frozen report carries the caveats that were true then.
   */
  caveats: string[];
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

type Admin = Awaited<ReturnType<typeof createAdminClient>>;

/**
 * Days inside the window with no creator_performance row for a client.
 *
 * ⚠️ A portfolio total silently absorbs a missing day. Naming the client and
 * the day is the difference between a total and a total you can trust.
 */
async function findGaps(supabase: Admin, start: string, end: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_agency_coverage_gaps', { p_start: start, p_end: end });
  if (error) {
    console.error('[agency-report] coverage gap read failed:', error.message);
    return [];
  }
  return ((data ?? []) as Array<{ brand_name: string; missing: string }>).map(
    (r) => `${r.brand_name} has no data for ${r.missing}, so its contribution here is short by that day`,
  );
}

/**
 * Six months ending with the report's month, per client, then summed two ways.
 *
 * 🚨 SAME-STORE MEANS PRESENT IN EVERY MONTH OF THE WINDOW, not "present now".
 * A client that joined in June has no March to compare against, and including
 * it would put new money into the later months only, which reads as growth.
 *
 * Non-fatal: a failed read leaves the report without its trend, never without
 * the rest of the page.
 */
async function buildTrend(supabase: Admin, end: Date): Promise<AgencySnapshot['trend']> {
  const y = end.getUTCFullYear();
  const m = end.getUTCMonth();
  const months: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    months.push({
      key: iso(d).slice(0, 7),
      label: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
    });
  }
  const start = `${months[0].key}-01`;

  const { data, error } = await supabase.rpc('get_agency_trend', { p_start: start, p_end: iso(end) });
  if (error) {
    console.error('[agency-report] trend read failed:', error.message);
    return undefined;
  }

  const rows = ((data ?? []) as Array<{ roster_slug: string; month: string; store_gmv: number; roster_gmv: number }>).map(
    (r) => ({
      slug: String(r.roster_slug),
      month: String(r.month).slice(0, 7),
      store: num(r.store_gmv),
      roster: num(r.roster_gmv),
    }),
  );

  const present = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.store <= 0) continue;
    if (!present.has(r.slug)) present.set(r.slug, new Set());
    present.get(r.slug)!.add(r.month);
  }
  const sameStore = [...present.entries()]
    .filter(([, ms]) => months.every((mo) => ms.has(mo.key)))
    .map(([slug]) => slug);
  const same = new Set(sameStore);

  const points: AgencyTrendPoint[] = months.map((mo) => {
    const inMonth = rows.filter((r) => r.month === mo.key);
    const ss = inMonth.filter((r) => same.has(r.slug));
    return {
      month: mo.key,
      label: mo.label,
      clients: inMonth.filter((r) => r.store > 0).length,
      rosterGmv: inMonth.reduce((a, r) => a + r.roster, 0),
      storeGmv: inMonth.reduce((a, r) => a + r.store, 0),
      sameStoreRoster: ss.reduce((a, r) => a + r.roster, 0),
      sameStoreStore: ss.reduce((a, r) => a + r.store, 0),
    };
  });

  return { points, sameStore };
}

/**
 * This period's invoices, summed per client across payees.
 *
 * ⚠️ Void or cancelled invoices are excluded: they were issued and withdrawn,
 * and counting them would bill a client twice on paper.
 */
async function loadInvoices(supabase: Admin, start: string): Promise<Map<string, { total: number; count: number }>> {
  const out = new Map<string, { total: number; count: number }>();
  const { data, error } = await supabase
    .from('invoices')
    .select('brand, total_amount, status')
    .like('period_month', `${start.slice(0, 7)}%`);
  if (error) {
    console.error('[agency-report] invoice read failed:', error.message);
    return out;
  }
  for (const r of (data ?? []) as Array<{ brand: string; total_amount: number; status: string | null }>) {
    const status = (r.status ?? '').toLowerCase();
    if (status === 'void' || status === 'cancelled' || status === 'canceled') continue;
    const cur = out.get(r.brand) ?? { total: 0, count: 0 };
    cur.total += num(r.total_amount);
    cur.count += 1;
    out.set(r.brand, cur);
  }
  return out;
}

async function loadRosterQuality(supabase: Admin): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { data, error } = await supabase.rpc('get_agency_roster_quality');
  if (error) {
    console.error('[agency-report] roster quality read failed:', error.message);
    return out;
  }
  for (const r of (data ?? []) as Array<{ brand: string; no_handle: number }>) {
    out.set(String(r.brand), num(r.no_handle));
  }
  return out;
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

  const [portfolio, reg, caveats, trend, invoices, quality] = await Promise.all([
    supabase.rpc('get_agency_portfolio', {
      p_start: start,
      p_end: end,
      p_prior_start: iso(priorStart),
      p_prior_end: iso(priorEnd),
    }),
    getBrandRegistry(),
    findGaps(supabase, start, end),
    buildTrend(supabase, e),
    loadInvoices(supabase, start),
    loadRosterQuality(supabase),
  ]);
  if (portfolio.error) {
    throw new Error(`[agency-report] get_agency_portfolio failed: ${portfolio.error.message}`);
  }

  const raw = (portfolio.data ?? {}) as { brands?: unknown[]; totals?: Record<string, unknown> };

  const brands: AgencyBrandRow[] = (raw.brands ?? []).map((b) => {
    const r = b as Record<string, unknown>;
    const slug = String(r.slug);
    const rosterGmv = num(r.rosterGmv);
    const priorRosterGmv = num(r.priorRosterGmv);
    const storeGmv = num(r.storeGmv);
    const priorStoreGmv = num(r.priorStoreGmv);
    const committedRetainer = num(r.committedRetainer);
    const sharePct = storeGmv > 0 ? (rosterGmv / storeGmv) * 100 : null;
    const priorSharePct = priorStoreGmv > 0 ? (priorRosterGmv / priorStoreGmv) * 100 : null;
    const inv = invoices.get(slug);
    return {
      slug,
      name: String(r.name),
      storeGmv,
      priorStoreGmv,
      rosterGmv,
      priorRosterGmv,
      signed: num(r.signed),
      retained: num(r.retained),
      committedRetainer,
      momPct: priorRosterGmv > 0 ? ((rosterGmv - priorRosterGmv) / priorRosterGmv) * 100 : null,
      sharePct,
      color: brandColor(reg, slug),
      priorSharePct,
      // Only comparable when there WAS a prior roster: a client that started
      // this period did not gain share, it arrived.
      sharePts: sharePct !== null && priorSharePct !== null && priorRosterGmv > 0 ? sharePct - priorSharePct : null,
      storeMomPct: priorStoreGmv > 0 ? ((storeGmv - priorStoreGmv) / priorStoreGmv) * 100 : null,
      returnX: committedRetainer > 0 ? rosterGmv / committedRetainer : null,
      invoiced: inv ? inv.total : null,
      invoiceCount: inv ? inv.count : 0,
      noHandle: quality.get(slug) ?? 0,
    };
  });

  const t = raw.totals ?? {};
  const inReport = brands.filter((b) => b.rosterGmv > 0 || b.committedRetainer > 0);

  return {
    v: 2,
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
      invoiced: brands.reduce((a, b) => a + (b.invoiced ?? 0), 0),
      invoiceCount: brands.reduce((a, b) => a + (b.invoiceCount ?? 0), 0),
      invoicedClients: brands.filter((b) => (b.invoiced ?? 0) > 0).length,
      noHandle: inReport.reduce((a, b) => a + (b.noHandle ?? 0), 0),
    },
    brands,
    trend,
    caveats,
  };
}
