'use client';

/**
 * Reporting — generate Discord posts, brand-client PDFs, and long-form text
 * reports, or schedule them for automated delivery.
 *
 * Chrome is built on the Pulse kit; the generator cards live in
 * ./generate-cards and the schedules list + modal in ./schedules-tab.
 */

import { useState, useEffect } from 'react';
import {
  ChefHat, Flame, TrendingUp, BarChart3, Clock, Send, Users, Wand2, AlertCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { SegmentedControl } from '@/components/ui/segmented';
import { BrandClientReportCard, ReportCard, PostCard } from './generate-cards';
import { SchedulesTab } from './schedules-tab';

type TabId = 'generate' | 'schedules';

// ── Main Page ───────────────────────────────────────────────────────
export default function ReportingPage() {
  const [activeTab, setActiveTab] = useState<TabId>('generate');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Content"
        title="Reporting"
        subtitle="Generate reports for your creators, brand clients, and internal team, or schedule them to run automatically."
      />

      <SegmentedControl<TabId>
        ariaLabel="Reporting view"
        options={[
          {
            value: 'generate',
            label: <span className="flex items-center gap-2"><Wand2 className="h-4 w-4" />Generate</span>,
          },
          {
            value: 'schedules',
            label: <span className="flex items-center gap-2"><Clock className="h-4 w-4" />Schedules</span>,
          },
        ]}
        value={activeTab}
        onValueChange={setActiveTab}
      />

      {activeTab === 'generate'  && <GenerateTab />}
      {activeTab === 'schedules' && <SchedulesTab />}
    </div>
  );
}

// ── Generate Tab — audience-grouped sections ────────────────────────
function GenerateTab() {
  return (
    <div className="space-y-10">
      <FreshnessBanner />

      {/* For your creators (Discord posts) */}
      <AudienceSection
        eyebrow="For your creators"
        title="Discord posts"
        subtitle="Quick text updates to hype your team in your internal Discord."
        accent="creators"
      >
        <PostCard title="Daily Drop" icon={TrendingUp} type="daily-drop" showPeriod={false}
          description="Yesterday's numbers at a glance." />
        <PostCard title="What's Cooking?" icon={Flame} type="whats-cooking"
          description="Top performing videos of the period: hot content that's driving sales." />
        <PostCard title="Who's Cooking?" icon={ChefHat} type="whos-cooking"
          description="Top creators leaderboard. Celebrate your top performers." />
      </AudienceSection>

      {/* For brand clients (Slack/email — outward-facing) */}
      <AudienceSection
        eyebrow="For brand clients"
        title="Brand reports"
        subtitle="Polished, multi-page PDF reports you share with brand contacts. Replaces the manual deck."
        accent="clients"
      >
        <BrandClientReportCard />
      </AudienceSection>

      {/* For internal team (long-form text) */}
      <AudienceSection
        eyebrow="For internal review"
        title="Long-form reports"
        subtitle="Detailed text reports for your team review, not for sharing externally."
        accent="internal"
      >
        <ReportCard
          title="Performance Summary"
          description="Weekly or monthly overview of GMV, top creators, top videos, and trends."
          icon={BarChart3}
          iconBg="bg-[var(--cat-1)]/10"
          iconColor="text-[var(--cat-1)]"
          type="performance-summary"
          showPeriod
          features={['Total GMV & trend', 'Top 10 creators', 'Top 10 videos', 'Week-over-week change']}
        />
        <ReportCard
          title="Creator Activity"
          description="Creator status breakdown: who's crushing it, who's on track, who needs a nudge."
          icon={Users}
          iconBg="bg-[var(--pulse-accent-2)]/10"
          iconColor="text-[var(--pulse-accent-2)]"
          type="creator-activity"
          showPeriod
          features={['Status grouping', 'Posting frequency', 'Days since last video', 'GMV per creator']}
        />
        <ReportCard
          title="Brand Report"
          description="Internal narrative report on a single brand. (For client-facing, use the Brand reports section.)"
          icon={Send}
          iconBg="bg-[var(--cat-2)]/10"
          iconColor="text-[var(--cat-2)]"
          type="brand-report"
          showPeriod
          features={['Brand GMV summary', 'Top creators & videos', 'Week-over-week trends', 'Internal use']}
        />
      </AudienceSection>
    </div>
  );
}

// ── Audience Section wrapper ────────────────────────────────────────
// Per-audience accent dots keep distinct hues via the Pulse categorical /
// accent tokens (never raw palette classes).
const ACCENT_COLORS = {
  creators: 'var(--primary)',
  clients:  'var(--pulse-accent-2)',
  internal: 'var(--cat-1)',
} as const;

function AudienceSection({
  eyebrow, title, subtitle, accent, children,
}: {
  eyebrow: string; title: string; subtitle: string;
  accent: keyof typeof ACCENT_COLORS; children: React.ReactNode;
}) {
  const color = ACCENT_COLORS[accent];
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        <div aria-hidden="true" className="mt-2.5 h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color }}>{eyebrow}</div>
          <h2 className="mt-0.5 text-xl font-bold text-foreground">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

// ── Freshness Banner — warns when data is stale ─────────────────────
type FreshnessState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ok'; daysOld: number | null; latest: string | null };

function FreshnessBanner() {
  const [state, setState] = useState<FreshnessState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/reporting/freshness?brand=all')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        if (cancelled) return;
        setState({
          status: 'ok',
          // Only trust a real number — anything else renders as "unknown",
          // never "undefined days old".
          daysOld: typeof d.daysOld === 'number' ? d.daysOld : null,
          latest: d.latestReportDate ?? null,
        });
      })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; };
  }, []);

  if (state.status === 'loading') return null;

  // The freshness check is a staleness safety net: a failed check must never
  // silently vanish, so it degrades to a muted one-liner.
  if (state.status === 'error') {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        Couldn&apos;t check data freshness. Reports may anchor to an older upload date.
      </p>
    );
  }

  if (state.daysOld === null || state.daysOld <= 3) return null;

  const dateLabel = state.latest
    ? new Date(state.latest + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'unknown';

  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--pulse-warn)]/25 bg-[var(--pulse-warn-bg)] px-4 py-3">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pulse-warn)]" />
      <div className="text-xs text-foreground">
        <strong>Data is {state.daysOld} days old.</strong> Last upload processed: {dateLabel} (UTC).
        Reports below anchor to that date, so period windows show the most recent data available, not today&apos;s.
      </div>
    </div>
  );
}
