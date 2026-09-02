/**
 * Reporting overview — one row per client brand.
 *
 * The reporting page used to be a chronological outbox. The work it supports
 * is not chronological: it is per client, low volume, and gated on whether the
 * data can honestly support a report. So this returns, for each brand the
 * operator can report on: how complete its data is, when it was last reported
 * to, and whether the client opened it.
 *
 * Coverage sits here rather than in a page-level banner because the answer is
 * per brand. Five cross-brand overwrites and the repair that followed left
 * real gaps in individual brands while every other brand was fine.
 */
import { NextResponse } from 'next/server';
import { getWorkspaceScope, isBrandInScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { getBrandRegistry, expandSlugs, brandLabel, brandColor } from '@/lib/data/brand-registry';
import { buildShareMessage } from '@/lib/data/client-reports';

export const runtime = 'nodejs';

const COVERAGE_DAYS = 14;

export interface ReportingBrandRow {
  slug: string;
  name: string;
  color: string;
  coverage: {
    daysExpected: number;
    daysPresent: number;
    /** yyyy-mm-dd, oldest first, for the tick meter. */
    presentDays: string[];
    missingDays: string[];
    windowStart: string | null;
    windowEnd: string | null;
    /** Latest day this brand has ANY data for. Null = never. */
    lastDataDay: string | null;
    /** Days between the brand's last data day and the freshest day overall. */
    daysBehind: number | null;
  };
  lastReport: {
    createdAt: string;
    periodLabel: string | null;
    viewedAt: string | null;
    revokedAt: string | null;
    url: string | null;
    token: string;
    /**
     * The paste-ready client message, built SERVER SIDE so there is exactly
     * one definition of it. Assembled from the report's own stored notes and
     * plan, so what the operator sends and what the client reads on the page
     * cannot disagree.
     *
     * Null when the report carries no notes and no plan: an empty message is
     * worse than no button.
     */
    shareMessage: string | null;
  } | null;
  reportCount: number;
}

interface CoverageBrand {
  brand: string;
  days: string[];
  last_day: string | null;
}

function dayList(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + 'T12:00:00Z');
  const last = new Date(end + 'T12:00:00Z');
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T12:00:00Z').getTime() - new Date(a + 'T12:00:00Z').getTime()) / 86_400_000,
  );
}

export async function GET() {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createAdminClient();
  const reg = await getBrandRegistry();

  const [covRes, reportsRes] = await Promise.all([
    supabase.rpc('get_reporting_coverage', { p_days: COVERAGE_DAYS }),
    supabase
      .from('client_reports')
      .select('id, token, brand_slug, period_label, created_at, viewed_at, revoked_at, notes, plan')
      .order('created_at', { ascending: false }),
  ]);

  // A failed coverage read must not render as "every brand has no data" — that
  // would gate off reporting entirely and look like a data outage.
  if (covRes.error) {
    return NextResponse.json(
      { error: `Coverage lookup failed: ${covRes.error.message}` }, { status: 500 });
  }
  if (reportsRes.error) {
    return NextResponse.json(
      { error: `Report history lookup failed: ${reportsRes.error.message}` }, { status: 500 });
  }

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const cov = (covRes.data ?? {}) as Record<string, any>;
  const windowStart: string | null = cov.window_start ?? null;
  const windowEnd: string | null = cov.window_end ?? null;
  const byDataSlug = new Map<string, CoverageBrand>();
  for (const b of (cov.brands ?? []) as CoverageBrand[]) byDataSlug.set(b.brand, b);

  // Freshest day anywhere, so "days behind" compares a brand against the
  // pipeline's actual frontier rather than against today.
  const freshestOverall = windowEnd;

  const reportsBySlug = new Map<string, typeof reportsRes.data>();
  for (const r of reportsRes.data ?? []) {
    const list = reportsBySlug.get(r.brand_slug) ?? [];
    list.push(r);
    reportsBySlug.set(r.brand_slug, list);
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || '';

  // Same visible set as the reporting brand picker: top-level brands only, so
  // an umbrella shows once rather than once per store.
  const visible = reg.rows.filter((b) => !b.is_archived && b.parent_brand_id == null);

  const rows: ReportingBrandRow[] = visible
    .filter((b) => isBrandInScope(scope, { slug: b.slug }))
    .map((b) => {
      const dataSlugs = expandSlugs(reg, b.slug);

      // Union across an umbrella's stores: a day counts if ANY store reported.
      const present = new Set<string>();
      let lastDataDay: string | null = null;
      for (const s of dataSlugs) {
        const c = byDataSlug.get(s);
        if (!c) continue;
        for (const d of c.days) present.add(d);
        if (c.last_day && (!lastDataDay || c.last_day > lastDataDay)) lastDataDay = c.last_day;
      }

      const expectedDays = windowStart && windowEnd ? dayList(windowStart, windowEnd) : [];
      const presentDays = expectedDays.filter((d) => present.has(d));
      const missingDays = expectedDays.filter((d) => !present.has(d));

      const brandReports = reportsBySlug.get(b.slug) ?? [];
      const latest = brandReports[0] ?? null;
      /**
       * ⚠️ The message comes from the most recent LIVE report, which is not
       * always `latest`. `latest` deliberately includes revoked reports so the
       * row can show a "Revoked" badge, but a message whose link 404s would be
       * pasted to a client before anyone noticed, and a brand whose newest
       * report happens to be revoked still has a good one to send.
       */
      const shareable = brandReports.find((x) => !x.revoked_at) ?? null;

      return {
        slug: b.slug,
        name: brandLabel(reg, b.slug),
        color: brandColor(reg, b.slug),
        coverage: {
          daysExpected: expectedDays.length || COVERAGE_DAYS,
          daysPresent: presentDays.length,
          presentDays,
          missingDays,
          windowStart,
          windowEnd,
          lastDataDay,
          daysBehind:
            lastDataDay && freshestOverall ? daysBetween(lastDataDay, freshestOverall) : null,
        },
        lastReport: latest
          ? {
              createdAt: latest.created_at,
              periodLabel: latest.period_label,
              viewedAt: latest.viewed_at,
              revokedAt: latest.revoked_at,
              shareMessage: shareable
                ? buildShareMessage(
                    brandLabel(reg, b.slug),
                    shareable.period_label,
                    shareable.notes,
                    shareable.plan,
                    `${origin}/r/${shareable.token}`,
                  )
                : null,
              // Relative when no canonical origin is configured — the link is
              // opened from inside the app, so it resolves either way.
              url: `${origin}/r/${latest.token}`,
              token: latest.token,
            }
          : null,
        reportCount: brandReports.length,
      };
    });

  // Owed first: never reported, then longest since the last report. A brand
  // you have not reported on is the thing this page exists to surface.
  rows.sort((a, b) => {
    if (!a.lastReport && !b.lastReport) return a.name.localeCompare(b.name);
    if (!a.lastReport) return -1;
    if (!b.lastReport) return 1;
    return a.lastReport.createdAt.localeCompare(b.lastReport.createdAt);
  });

  return NextResponse.json({ brands: rows, coverageDays: COVERAGE_DAYS, windowStart, windowEnd });
}
