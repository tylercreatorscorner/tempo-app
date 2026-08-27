/**
 * Client report share links — snapshot creation + helpers.
 *
 * A client report is a FROZEN SNAPSHOT: the mig-096 aggregate
 * (getBrandClientReportData) plus the mig-098 extras (windowed views,
 * per-video views for the watchable cards, 12-week trend, lifetime strip),
 * serialized into client_reports.snapshot at create time. The public
 * /r/[token] page and the PDF export both render from the snapshot, so the
 * numbers a client saw can never shift under them when data is re-uploaded.
 *
 * Everything here ties to the report's own source tables
 * (creator_performance / video_performance) — see mig 098's header for why
 * the trend does NOT read daily_creator_stats.
 */
import { createClient } from '@/lib/supabase/server';
import { getBrandRegistry, expandSlugs, brandLabel } from '@/lib/data/brand-registry';
import {
  getBrandClientReportData,
  type BrandClientReportData,
  type ReportPeriod,
} from '@/lib/data/brand-client-report';

export type ClientReportPeriod = ReportPeriod | { start: string; end: string };

export interface ClientReportSnapshot {
  v: 1;
  generatedAt: string;                     // ISO timestamp the numbers were frozen
  report: BrandClientReportData;           // Date fields are ISO strings at rest — revive on read
  views: number | null;                    // windowed views (null = no engagement data ingested)
  priorViews: number | null;
  videoViews: Record<string, number>;      // video_id → windowed views, for the watch cards
  weekly: { weekEnd: string; gmv: number }[];  // 12 buckets, oldest → newest, anchored to period end
  lifetime: {
    gmv: number;
    bestWeek: number | null;
    firstDate: string | null;              // first earning day on record
    videos: number | null;                 // lifetime distinct videos
  };
}

export interface SnapshotBuild {
  snapshot: ClientReportSnapshot;
  brandName: string;
  periodStart: string;                     // yyyy-mm-dd
  periodEnd: string;
  periodLabel: string;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Parse the {brand, period} API body's period field. Route files can only
 * export handler names, so this lives here for the create + preview routes.
 */
export function parseReportPeriod(raw: unknown): ClientReportPeriod | null {
  if (raw === '7d' || raw === '30d') return raw;
  if (raw && typeof raw === 'object') {
    const p = raw as { start?: unknown; end?: unknown };
    const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (isDate(p.start) && isDate(p.end) && p.start <= p.end) return { start: p.start, end: p.end };
  }
  return null;
}

/** Real TikTok video id out of a canonical watch URL (…/video/{id}). */
export function extractTikTokVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/video\/(\d+)/);
  return m ? m[1] : null;
}

/**
 * JSON round-trips turn the report's Date fields into ISO strings. Revive
 * them before handing the snapshot to anything expecting real Dates (the PDF
 * renderer, toLocaleDateString callers). Idempotent — new Date(Date) is fine.
 */
export function reviveReportDates(r: BrandClientReportData): BrandClientReportData {
  return {
    ...r,
    startDate: new Date(r.startDate),
    endDate: new Date(r.endDate),
    bestDay: r.bestDay ? { ...r.bestDay, date: new Date(r.bestDay.date) } : null,
    dailyPerformance: r.dailyPerformance.map((d) => ({ ...d, date: new Date(d.date) })),
  };
}

/**
 * Build the full frozen snapshot for a brand + period. Two sequential RPC
 * round-trips: the mig-096 aggregate (~2s single brand / ~9s all-brands),
 * then the mig-098 extras (~2-4s) which needs the resolved window and the
 * top-video ids from the first call. Throws on any failure — a client-facing
 * report must never freeze fabricated zeros.
 */
export async function buildClientReportSnapshot(
  brandSlug: string,
  period: ClientReportPeriod,
): Promise<SnapshotBuild> {
  const supabase = await createClient();
  const reg = await getBrandRegistry();
  const brandName = brandSlug === 'all' ? 'All Brands' : brandLabel(reg, brandSlug);

  const report = await getBrandClientReportData(brandSlug, brandName, period);

  // Mirror the fetcher's prior-window math (it doesn't return prior dates).
  const pEnd = new Date(report.startDate);
  pEnd.setDate(pEnd.getDate() - 1);
  const pStart = new Date(pEnd);
  pStart.setDate(pStart.getDate() - (report.periodLengthDays - 1));

  const dataSlugs = brandSlug && brandSlug !== 'all' ? expandSlugs(reg, brandSlug) : null;
  /**
   * View counts for the videos the report ACTUALLY shows.
   *
   * This used to take the first 3 of report.topVideos, which was wrong twice
   * over: the content section prefers the ROSTER leaderboard (cc.topVideos)
   * and falls back to the store one, and it now renders 5 rather than 3. The
   * mismatch meant a roster video could render with no view count while views
   * had been fetched for a store video that was never displayed.
   */
  const shownVideos =
    report.creatorsCorner.topVideos.length > 0 ? report.creatorsCorner.topVideos : report.topVideos;
  const videoIds = shownVideos
    .slice(0, 5)
    .map((v) => extractTikTokVideoId(v.videoUrl))
    .filter((id): id is string => id !== null);

  /**
   * Lifetime figures come from the cache when it can honestly cover this
   * window, and are computed live when it cannot.
   *
   * get_brand_report_extras costs ~12.4s for Lemme, and only ~600ms of that is
   * windowed work — the rest is two CTEs rescanning the brand's ENTIRE history
   * on every report, a cost that grows forever. brand_lifetime_daily (mig 156)
   * holds that as a DAILY SERIES, so "lifetime as of p_end" stays exact for a
   * historical window instead of silently becoming today's total.
   *
   * ⚠️ get_brand_lifetime returns NULL rather than guessing when its cache was
   * computed through a date EARLIER than this report needs — which happens
   * routinely right after an upload lands. That is the whole failsafe: we fall
   * back to the original function and eat the 12s. Slower, never wrong.
   *
   * The cache is verified against source on every refresh with a ZERO
   * tolerance (GMV is a deterministic sum), and every check is written to
   * brand_lifetime_cache_audit. brand_daily_stats is the cautionary tale: same
   * idea, no verification, and it is currently wrong by $1.2M on two brands
   * while refreshing every 20 minutes.
   */
  const { data: lifetimeRaw } = await supabase.rpc('get_brand_lifetime', {
    p_brands: dataSlugs,
    p_through: fmtDate(report.endDate),
  });
  const cachedLifetime = lifetimeRaw as
    | { gmv: number; first_date: string | null; videos: number;
        weekly: Array<{ week_end: string; gmv: number }>; best_week: number | null }
    | null;

  const extrasArgs = {
    p_data_slugs: dataSlugs,
    p_start: fmtDate(report.startDate),
    p_end: fmtDate(report.endDate),
    p_prior_start: fmtDate(pStart),
    p_prior_end: fmtDate(pEnd),
    p_video_ids: videoIds.length > 0 ? videoIds : null,
  };

  const { data: extrasRaw, error: extrasErr } = cachedLifetime
    ? await supabase.rpc('get_brand_report_extras_windowed', extrasArgs)
    : await supabase.rpc('get_brand_report_extras', extrasArgs);
  if (extrasErr) {
    throw new Error(`[client-reports] get_brand_report_extras failed: ${extrasErr.message}`);
  }
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const extrasBase = (extrasRaw ?? {}) as Record<string, any>;

  // Merge so everything downstream reads one shape regardless of which path
  // produced it. Verified identical on Lemme: gmv 3,145,993.18, best week
  // 469,620.95, first date 2026-04-24, 98,031 videos, and all 12 weekly
  // buckets matching to the cent.
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const extras: Record<string, any> = cachedLifetime
    ? {
        ...extrasBase,
        weekly: cachedLifetime.weekly ?? [],
        lifetime: {
          gmv: cachedLifetime.gmv,
          best_week: cachedLifetime.best_week,
          first_date: cachedLifetime.first_date,
        },
        lifetime_videos: cachedLifetime.videos,
      }
    : extrasBase;

  const videoViews: Record<string, number> = {};
  for (const row of (extras.video_views ?? []) as Array<{ video_id: string; views: number }>) {
    if (row.video_id) videoViews[row.video_id] = num(row.views);
  }

  const weekly = ((extras.weekly ?? []) as Array<{ week_end: string; gmv: number }>).map((w) => ({
    weekEnd: String(w.week_end),
    gmv: num(w.gmv),
  }));

  const life = extras.lifetime ?? {};
  const snapshot: ClientReportSnapshot = {
    v: 1,
    generatedAt: new Date().toISOString(),
    report,
    views: extras.views === null || extras.views === undefined ? null : num(extras.views),
    priorViews:
      extras.prior_views === null || extras.prior_views === undefined ? null : num(extras.prior_views),
    videoViews,
    weekly,
    lifetime: {
      gmv: num(life.gmv),
      bestWeek: life.best_week === null || life.best_week === undefined ? null : num(life.best_week),
      firstDate: life.first_date ? String(life.first_date) : null,
      videos:
        extras.lifetime_videos === null || extras.lifetime_videos === undefined
          ? null
          : num(extras.lifetime_videos),
    },
  };

  return {
    snapshot,
    brandName,
    periodStart: fmtDate(report.startDate),
    periodEnd: fmtDate(report.endDate),
    periodLabel: report.periodLabel,
  };
}

// ── Notes drafting ─────────────────────────────────────────────────
// A plain template over the frozen numbers — honest, no adjectives the data
// doesn't earn. The operator edits before sending; the UI labels it
// "drafted for you".

function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function periodWord(days: number): string {
  if (days <= 7) return 'week';
  if (days >= 28 && days <= 31) return 'month';
  return 'period';
}

export function draftClientReportNotes(s: ClientReportSnapshot): string {
  const r = s.report;
  const word = periodWord(r.periodLengthDays);
  const parts: string[] = [];

  if (r.gmvChangePct === null) {
    parts.push(`${r.brandName} put up ${money(r.totalGmv)} this ${word} - the first tracked ${word} of GMV.`);
  } else if (r.gmvChangePct >= 0) {
    parts.push(
      `${r.brandName} finished the ${word} at ${money(r.totalGmv)}, up ${Math.round(r.gmvChangePct)}% on the prior ${word}.`,
    );
  } else {
    let line = `${r.brandName} finished the ${word} at ${money(r.totalGmv)}, down ${Math.round(Math.abs(r.gmvChangePct))}% from the prior ${word}`;
    // Context guard: if the comparison week was the strongest in the trend
    // window, say so — a lone "down X%" against a viral spike reads worse
    // than reality. WEEKLY reports only: the trend buckets are 7-day slices
    // anchored to the period end, so for 30d/custom reports bucket len-2 sits
    // INSIDE the current period and the clause would misattribute the spike
    // to the comparison window.
    if (word === 'week' && s.weekly.length >= 3) {
      const priorBucket = s.weekly[s.weekly.length - 2];
      const maxGmv = Math.max(...s.weekly.map((w) => w.gmv));
      if (priorBucket && priorBucket.gmv === maxGmv) {
        line += ' - coming off the strongest week in the last 12, so the comparison is steep';
      }
    }
    parts.push(line + '.');
  }

  if (r.topCreator) {
    parts.push(
      `${r.topCreator.name.startsWith('@') ? r.topCreator.name : '@' + r.topCreator.name} led the roster with ${money(r.topCreator.gmv)} across ${r.topCreator.videos} posts.`,
    );
  }

  const cc = r.creatorsCorner;
  if (cc.gmv > 0) {
    let line = `Our signed creators delivered ${money(cc.gmv)} - ${Math.round(cc.pctOfStoreGmv)}% of store GMV`;
    if (cc.newlyActivatedCount > 0) {
      line += ` - with ${cc.newlyActivatedCount} creator${cc.newlyActivatedCount === 1 ? '' : 's'} newly activated`;
    }
    parts.push(line + '.');
  }

  if (r.bestDay) {
    parts.push(`${r.bestDay.weekday} was the strongest day at ${money(r.bestDay.gmv)}.`);
  }

  return parts.join(' ');
}
