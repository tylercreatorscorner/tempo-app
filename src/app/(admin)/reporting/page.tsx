'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Clipboard, Check, Loader2, ChefHat, Flame, TrendingUp,
  BarChart3, Calendar, Clock, Send, Users, Trash2, Pencil,
  Wand2, Sparkles, AlertCircle, Download, Briefcase,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { useTenant } from '@/hooks/use-tenant';
import { FREQUENCIES } from '@/lib/data/schedule-frequency';
import { ModalOverlay } from '@/components/ui/modal-overlay';

interface BrandListEntry {
  slug: string;
  name: string;
  is_archived: boolean;
  is_umbrella: boolean;
  /** Set when this is a per-store child of an umbrella (e.g. leefar_nutrition).
   *  Null for top-level brands. Replaces the hardcoded HIDDEN_FROM_PICKER set. */
  parent_brand_id: string | null;
}

/**
 * Live brand list — single source-of-truth fetched once at page mount and
 * shared across all dropdowns via the BrandsContext below. Replaces the old
 * hardcoded ACTIVE_BRANDS constant so adding a brand to brands_v2 shows up
 * here without a redeploy.
 */
function useLiveBrands(): BrandListEntry[] | null {
  const [brands, setBrands] = useState<BrandListEntry[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/brands')
      .then(r => r.json())
      .then((d: { brands?: BrandListEntry[] }) => {
        if (cancelled) return;
        const live = (d.brands ?? [])
          .filter(b => !b.is_archived)
          .map(b => ({ slug: b.slug, name: b.name, is_archived: b.is_archived, is_umbrella: b.is_umbrella, parent_brand_id: b.parent_brand_id ?? null }));
        setBrands(live);
      })
      .catch(() => { if (!cancelled) setBrands([]); });
    return () => { cancelled = true; };
  }, []);
  return brands;
}

const TABS = [
  { id: 'generate',  label: 'Generate',  icon: Wand2 },
  { id: 'schedules', label: 'Schedules', icon: Clock },
] as const;

type TabId = typeof TABS[number]['id'];

/**
 * Hook: returns the brand options the current user is allowed to see.
 * Sourced live from /api/brands → brands_v2 (filtered by allowed_brands RBAC),
 * with an "All Brands" entry prepended unless the user is restricted to one brand.
 *
 * Falls back to an empty list while the brands fetch is in flight; consumers
 * default to 'all' so dropdowns are still usable during the brief loading window.
 */
function useBrandOptions(opts?: { collapseUmbrella?: boolean }) {
  const { allowedBrands } = useTenant();
  const brands = useLiveBrands();
  const brandMeta = useBrandMeta();
  const collapseUmbrella = opts?.collapseUmbrella ?? false;
  return useMemo(() => {
    if (!brands) return [{ value: 'all', label: 'All Brands' }];
    const allowed = allowedBrands && allowedBrands.length > 0
      ? brands.filter(b => allowedBrands.includes(b.slug))
      : brands;
    // Two views of an umbrella brand (LeeFar). Generators that aggregate the
    // umbrella back to its stores (Discord posts, Brand Client Report — both
    // expand via expandBrandToDataSlugs) show the single umbrella and hide the
    // per-store slugs, so the user picks "LeeFar" once and gets one consolidated
    // output. The text reports are per-store (they don't aggregate), so they keep
    // showing the stores and hide the umbrella (its slug has no data of its own).
    const visible = collapseUmbrella
      ? allowed.filter(b => b.parent_brand_id == null)
      : allowed.filter(b => !b.is_umbrella);
    const brandOpts = visible.map(b => ({
      value: b.slug,
      // Prefer the DB-driven display name (or static override fallback) when
      // present; otherwise fall back to the canonical name from brands_v2.
      label: brandMeta.label(b.slug) || b.name,
    }));
    if (visible.length === 1) return brandOpts; // Restricted to one brand → no "All"
    return [{ value: 'all', label: 'All Brands' }, ...brandOpts];
  }, [allowedBrands, brands, collapseUmbrella, brandMeta]);
}

// ── Main Page ───────────────────────────────────────────────────────
export default function ReportingPage() {
  const [activeTab, setActiveTab] = useState<TabId>('generate');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-[var(--foreground)]">Reporting</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Generate reports for your creators, brand clients, and internal team — or schedule them to run automatically.
        </p>
      </div>

      {/* Tab Bar — pill style matching My Creators / Analytics */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
              activeTab === id
                ? 'bg-card text-[var(--foreground)] shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
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
        accent="pink"
      >
        <PostCard title="Daily Drop" icon={TrendingUp} type="daily-drop" showPeriod={false}
          description="Yesterday's numbers at a glance." />
        <PostCard title="What's Cooking?" icon={Flame} type="whats-cooking"
          description="Top performing videos of the period — hot content that's driving sales." />
        <PostCard title="Who's Cooking?" icon={ChefHat} type="whos-cooking"
          description="Top creators leaderboard. Celebrate your top performers." />
      </AudienceSection>

      {/* For brand clients (Slack/email — outward-facing) */}
      <AudienceSection
        eyebrow="For brand clients"
        title="Brand reports"
        subtitle="Polished, multi-page PDF reports you share with brand contacts. Replaces the manual deck."
        accent="purple"
      >
        <BrandClientReportCard />
      </AudienceSection>

      {/* For internal team (long-form text) */}
      <AudienceSection
        eyebrow="For internal review"
        title="Long-form reports"
        subtitle="Detailed text reports for your team review — not for sharing externally."
        accent="blue"
      >
        <ReportCard
          title="Performance Summary"
          description="Weekly or monthly overview of GMV, top creators, top videos, and trends."
          icon={BarChart3}
          iconBg="bg-blue-500/10"
          iconColor="text-blue-600"
          type="performance-summary"
          showPeriod
          features={['Total GMV & trend', 'Top 10 creators', 'Top 10 videos', 'Week-over-week change']}
        />
        <ReportCard
          title="Creator Activity"
          description="Creator status breakdown — who's crushing it, who's on track, who needs a nudge."
          icon={Users}
          iconBg="bg-purple-500/10"
          iconColor="text-purple-600"
          type="creator-activity"
          showPeriod
          features={['Status grouping', 'Posting frequency', 'Days since last video', 'GMV per creator']}
        />
        <ReportCard
          title="Brand Report"
          description="Internal narrative report on a single brand. (For client-facing, use the Brand reports section.)"
          icon={Send}
          iconBg="bg-green-500/10"
          iconColor="text-green-600"
          type="brand-report"
          showPeriod
          features={['Brand GMV summary', 'Top creators & videos', 'Week-over-week trends', 'Internal use']}
        />
      </AudienceSection>
    </div>
  );
}

// ── Audience Section wrapper ────────────────────────────────────────
const ACCENT_STYLES = {
  pink:   { dot: 'bg-[var(--primary)]',  eyebrow: 'text-[var(--primary)]' },
  purple: { dot: 'bg-purple-600', eyebrow: 'text-purple-600' },
  blue:   { dot: 'bg-blue-600',   eyebrow: 'text-blue-600' },
} as const;

function AudienceSection({
  eyebrow, title, subtitle, accent, children,
}: {
  eyebrow: string; title: string; subtitle: string;
  accent: keyof typeof ACCENT_STYLES; children: React.ReactNode;
}) {
  const styles = ACCENT_STYLES[accent];
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        <div aria-hidden="true" className={cn('h-2 w-2 rounded-full mt-2.5', styles.dot)} />
        <div>
          <div className={cn('text-[10px] font-bold uppercase tracking-[0.15em]', styles.eyebrow)}>{eyebrow}</div>
          <h2 className="text-xl font-bold text-[var(--foreground)] mt-0.5">{title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
        {children}
      </div>
    </section>
  );
}

// ── Freshness Banner — warns when data is stale ─────────────────────
function FreshnessBanner() {
  const [state, setState] = useState<{ daysOld: number | null; latest: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/reporting/freshness?brand=all')
      .then(r => r.json())
      .then(d => { if (!cancelled) setState({ daysOld: d.daysOld, latest: d.latestReportDate }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!state || state.daysOld === null || state.daysOld <= 3) return null;

  const dateLabel = state.latest
    ? new Date(state.latest + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'unknown';

  return (
    <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3 flex items-start gap-3">
      <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
      <div className="text-xs text-amber-900">
        <strong>Data is {state.daysOld} days old.</strong> Last upload processed: {dateLabel} (UTC).
        Reports below anchor to that date — period windows will show the most recent data available, not today's.
      </div>
    </div>
  );
}

// ── Brand Client Report Card ────────────────────────────────────────
// Replaces the old throwaway one-pager with a deck-quality multi-page PDF
// (cover · exec summary · KPIs · managed/organic · new/returning · daily perf ·
// top creators · top videos · top products · per-product creator breakdown).
function BrandClientReportCard() {
  const brandOptions = useBrandOptions({ collapseUmbrella: true });
  const [brand, setBrand] = useState(brandOptions[0]?.value ?? 'all');

  // Custom reporting window — defaults to the last 7 days.
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [startDate, setStartDate] = useState(() => new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [pdfLoading, setPdfLoading] = useState(false);
  const [slackLoading, setSlackLoading] = useState(false);
  const [slackText, setSlackText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brandLabel = brandOptions.find(b => b.value === brand)?.label ?? brand;
  const rangeValid = startDate <= endDate;
  const query = `brand=${encodeURIComponent(brand)}&start=${startDate}&end=${endDate}&name=${encodeURIComponent(brandLabel)}`;

  const applyPreset = (kind: '7d' | '30d' | 'mtd') => {
    const end = new Date();
    const start = kind === 'mtd'
      ? new Date(end.getFullYear(), end.getMonth(), 1)
      : new Date(Date.now() - (kind === '30d' ? 29 : 6) * 86_400_000);
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  };

  const downloadPdf = useCallback(async () => {
    setPdfLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/brand-client-pdf?${query}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `brand-report.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF download failed');
    } finally {
      setPdfLoading(false);
    }
  }, [query]);

  const generateSlack = useCallback(async () => {
    setSlackLoading(true);
    setError(null);
    setSlackText(null);
    try {
      const res = await fetch(`/api/brand-client-summary?${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSlackText(data.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build Slack message');
    } finally {
      setSlackLoading(false);
    }
  }, [query]);

  const copySlack = async () => {
    if (!slackText) return;
    try {
      await navigator.clipboard.writeText(slackText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed — select and copy manually from the preview.');
    }
  };

  return (
    <div className="col-span-full rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-5">
        {/* Left: Configuration */}
        <div className="lg:col-span-3 p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--foreground)]">Brand Client Report</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Polished PDF + a ready-to-paste Slack message. Send both to your brand contacts.</p>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Brand</label>
            <select
              value={brand}
              onChange={e => setBrand(e.target.value)}
              className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
            >
              {brandOptions.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Reporting period</label>
            <div className="flex gap-1 p-1 bg-muted rounded-xl mb-2">
              {[{ k: '7d', l: 'Last 7d' }, { k: '30d', l: 'Last 30d' }, { k: 'mtd', l: 'This month' }].map(p => (
                <button
                  key={p.k}
                  onClick={() => applyPreset(p.k as '7d' | '30d' | 'mtd')}
                  className="flex-1 text-xs font-semibold py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card/70 transition-colors"
                >
                  {p.l}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <input
                  type="date" value={startDate} max={endDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                />
              </div>
              <div className="relative">
                <input
                  type="date" value={endDate} min={startDate} max={today}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                />
              </div>
            </div>
            {!rangeValid && <p className="text-[11px] text-red-500 mt-1">Start date must be on or before the end date.</p>}
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 text-red-600 text-xs">{error}</div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={downloadPdf}
              disabled={pdfLoading || !rangeValid}
              className="flex-1 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {pdfLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Building (~10–20s)…</> : <><Download className="h-4 w-4" />Download PDF</>}
            </button>
            <button
              onClick={generateSlack}
              disabled={slackLoading || !rangeValid}
              className="flex-1 py-3 rounded-xl border border-border hover:bg-muted text-[var(--foreground)] font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {slackLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Building…</> : <><Send className="h-4 w-4" />Slack message</>}
            </button>
          </div>

          {/* Slack message — copy/paste alongside the PDF */}
          {slackText && (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-2 bg-[#4A154B] flex items-center justify-between">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">📨 Slack message</span>
                <button
                  onClick={copySlack}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors',
                    copied ? 'bg-green-500 text-white' : 'bg-card/15 hover:bg-card/25 text-white'
                  )}
                >
                  {copied ? <><Check className="h-3.5 w-3.5" />Copied</> : <><Clipboard className="h-3.5 w-3.5" />Copy</>}
                </button>
              </div>
              <div className="p-4 bg-card border-l-4 border-[#4A154B] max-h-[320px] overflow-auto">
                <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">{slackText}</pre>
              </div>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Filename: <code className="text-muted-foreground">{brandLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-custom-report-{endDate}.pdf</code>
          </p>
        </div>

        {/* Right: Sections preview */}
        <div className="lg:col-span-2 bg-gradient-to-br from-purple-50 via-primary/10 to-white border-l border-border p-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-purple-500 mb-3">What's inside</div>
          <ul className="space-y-2 text-xs text-foreground">
            {[
              'Branded cover page with reporting period',
              'Executive summary (narrative paragraph)',
              'Top creator · top video · best day highlights',
              'KPI strip with WoW deltas (orders, creators, videos)',
              'Managed vs organic split with donut visual',
              'New vs returning creators breakdown',
              'Day-of-week + daily performance with peak day',
              'Top 10 creators leaderboard with progress bars',
              'Top 10 videos with creator attribution',
              'Top 10 products with order counts',
              'Per-product creator breakdown (top 5 × top 3)',
            ].map(s => (
              <li key={s} className="flex items-start gap-2">
                <Sparkles className="h-3 w-3 text-purple-500 mt-0.5 shrink-0" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ── Schedules Tab ───────────────────────────────────────────────────

interface ScheduleRow {
  id: string;
  report_type: string;
  source: string;
  brand: string;
  period: string;
  cron_label: string;
  destination_kind: string;
  webhook_url: string;
  channel_label: string | null;
  active: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_error: string | null;
  next_run_at: string | null;
  created_at: string;
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  // discord-posts source
  'daily-drop':           'Daily Drop',
  'whats-cooking':        "What's Cooking?",
  'whos-cooking':         "Who's Cooking?",
  // reporting source
  'performance-summary':  'Performance Summary',
  'creator-activity':     'Creator Activity',
  'brand-report':         'Brand Report',
};

function relativeTimeAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'Soon';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function relativeTimeUntil(iso: string | null): string {
  if (!iso) return '—';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return 'Pending';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `in ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `in ${hr}h`;
  const d = Math.floor(hr / 24);
  return `in ${d}d`;
}

function SchedulesTab() {
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const brandMeta = useBrandMeta();

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch('/api/schedules');
      const data = await res.json();
      setSchedules(data.schedules ?? []);
    } catch {
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  const toggleActive = async (s: ScheduleRow) => {
    await fetch(`/api/schedules/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !s.active }),
    });
    fetchSchedules();
  };

  const deleteSchedule = async (s: ScheduleRow) => {
    if (!confirm(`Delete the ${REPORT_TYPE_LABELS[s.report_type] ?? s.report_type} schedule?`)) return;
    await fetch(`/api/schedules/${s.id}`, { method: 'DELETE' });
    fetchSchedules();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Automated report delivery to Discord and Slack channels.</p>
        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:bg-[#d1177d] transition-colors"
        >
          <Calendar className="h-4 w-4" />
          New Schedule
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-card border border-border shadow-sm p-12 text-center">
          <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
        </div>
      ) : schedules.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border shadow-sm p-16 text-center">
          <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No schedules yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Set up an automated schedule to deliver any report or post on a recurring basis to a Discord or Slack channel.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 border-b border-border">
              <tr>
                {['Report', 'Brand', 'Frequency', 'Destination', 'Last Sent', 'Next Run', 'Status', ''].map(h => (
                  <th key={h} className="text-left py-3 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {schedules.map(s => (
                <tr key={s.id} className="hover:bg-muted/60 transition-colors">
                  <td className="py-3 px-4 font-medium text-[var(--foreground)]">{REPORT_TYPE_LABELS[s.report_type] ?? s.report_type}</td>
                  <td className="py-3 px-4 text-muted-foreground">{brandMeta.label(s.brand)}</td>
                  <td className="py-3 px-4 text-muted-foreground text-xs">{s.cron_label}</td>
                  <td className="py-3 px-4">
                    <span className={cn(
                      'inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium',
                      s.destination_kind === 'discord' ? 'bg-[#5865F2]/10 text-[#5865F2]' : 'bg-green-500/10 text-green-500'
                    )}>
                      {s.destination_kind === 'discord' ? '💬' : '📨'} {s.channel_label || s.destination_kind}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs">
                    <div className="text-muted-foreground">{relativeTimeAgo(s.last_run_at)}</div>
                    {s.last_run_status === 'failed' && (
                      <div className="text-[10px] text-red-500" title={s.last_run_error ?? ''}>last run failed</div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground">{s.active ? relativeTimeUntil(s.next_run_at) : 'Paused'}</td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => toggleActive(s)}
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-semibold transition-colors',
                        s.active ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/15' : 'bg-muted text-muted-foreground hover:bg-secondary'
                      )}
                    >
                      {s.active ? 'Active' : 'Paused'}
                    </button>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditing(s); setShowModal(true); }}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteSchedule(s)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ScheduleModal
          editing={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSaved={() => { setShowModal(false); setEditing(null); fetchSchedules(); }}
        />
      )}
    </div>
  );
}

// ── Schedule Modal — create or edit a schedule ──────────────────────
function ScheduleModal({
  editing, onClose, onSaved,
}: { editing: ScheduleRow | null; onClose: () => void; onSaved: () => void }) {
  const [source, setSource] = useState<string>(editing?.source ?? 'discord-posts');
  // Discord-post schedules aggregate the LeeFar umbrella; text-report schedules
  // are per-store. Collapse the umbrella only for the former.
  const brandOptions = useBrandOptions({ collapseUmbrella: source === 'discord-posts' });
  const [reportType, setReportType] = useState<string>(editing?.report_type ?? 'daily-drop');
  const [brand, setBrand] = useState(editing?.brand ?? brandOptions[0]?.value ?? 'all');
  const [period, setPeriod] = useState(editing?.period ?? '7d');
  const [cronLabel, setCronLabel] = useState(editing?.cron_label ?? FREQUENCIES[0].label);
  const [webhookUrl, setWebhookUrl] = useState(editing?.webhook_url ?? '');
  const [channelLabel, setChannelLabel] = useState(editing?.channel_label ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reportOptions = source === 'discord-posts'
    ? [
        { value: 'daily-drop',          label: 'Daily Drop' },
        { value: 'whats-cooking',       label: "What's Cooking?" },
        { value: 'whos-cooking',        label: "Who's Cooking?" },
      ]
    : [
        { value: 'performance-summary', label: 'Performance Summary' },
        { value: 'creator-activity',    label: 'Creator Activity' },
        { value: 'brand-report',        label: 'Brand Report' },
      ];

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        source, report_type: reportType, brand, period,
        cron_label: cronLabel,
        webhook_url: webhookUrl,
        channel_label: channelLabel || null,
      };
      const res = editing
        ? await fetch(`/api/schedules/${editing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch('/api/schedules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
    <div className="absolute inset-0 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <div
        className="relative bg-card rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-[var(--foreground)]">{editing ? 'Edit Schedule' : 'New Schedule'}</h3>

        <div className="space-y-3">
          {/* Source */}
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Type</label>
            <div className="flex gap-1 p-1 bg-muted rounded-xl">
              {[
                { v: 'discord-posts', l: 'Quick Post' },
                { v: 'reporting',     l: 'Long Report' },
              ].map(o => (
                <button
                  key={o.v}
                  onClick={() => {
                    setSource(o.v);
                    setReportType(o.v === 'discord-posts' ? 'daily-drop' : 'performance-summary');
                  }}
                  className={cn(
                    'flex-1 text-sm font-semibold py-1.5 rounded-lg transition-colors',
                    source === o.v ? 'bg-card text-[var(--foreground)] shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          {/* Report */}
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Report</label>
            <select
              value={reportType}
              onChange={e => setReportType(e.target.value)}
              className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
            >
              {reportOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Brand */}
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Brand</label>
            <select
              value={brand}
              onChange={e => setBrand(e.target.value)}
              className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
            >
              {brandOptions.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>

          {/* Period (only for periodic reports) */}
          {(source === 'reporting' || ['whats-cooking', 'whos-cooking'].includes(reportType)) && (
            <div>
              <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Lookback Period</label>
              <div className="flex gap-1 p-1 bg-muted rounded-xl">
                {[{ v: '7d', l: '7 Days' }, { v: '30d', l: '30 Days' }].map(p => (
                  <button
                    key={p.v}
                    onClick={() => setPeriod(p.v)}
                    className={cn(
                      'flex-1 text-sm font-semibold py-1.5 rounded-lg transition-colors',
                      period === p.v ? 'bg-card text-[var(--foreground)] shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {p.l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Frequency */}
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Send</label>
            <select
              value={cronLabel}
              onChange={e => setCronLabel(e.target.value)}
              className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
            >
              {FREQUENCIES.map(f => <option key={f.label} value={f.label}>{f.label}</option>)}
            </select>
          </div>

          {/* Webhook URL */}
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Webhook URL <span className="text-muted-foreground font-normal normal-case ml-1">(Discord or Slack incoming webhook)</span>
            </label>
            <input
              type="url"
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
              placeholder="https://discord.com/api/webhooks/…  or  https://hooks.slack.com/services/…"
              className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] font-mono"
            />
          </div>

          {/* Channel label (display) */}
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Label <span className="text-muted-foreground font-normal normal-case ml-1">(display only — e.g. #daily-updates)</span>
            </label>
            <input
              type="text"
              value={channelLabel}
              onChange={e => setChannelLabel(e.target.value)}
              placeholder="#channel-name"
              className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
            />
          </div>
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-500/10 text-red-600 text-xs">{error}</div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !webhookUrl}
            className="flex-1 py-2.5 rounded-xl bg-[var(--primary)] hover:bg-[#d1177d] text-white text-sm font-semibold disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? 'Save Changes' : 'Create Schedule'}
          </button>
        </div>
      </div>
    </div>
    </ModalOverlay>
  );
}

// ── Report Card ─────────────────────────────────────────────────────
function ReportCard({
  title, description, icon: Icon, iconBg, iconColor, type, showPeriod, features,
}: {
  title: string; description: string; icon: typeof BarChart3;
  iconBg: string; iconColor: string; type: string;
  showPeriod?: boolean; features: string[];
}) {
  const brandOptions = useBrandOptions();
  const [brand, setBrand] = useState(brandOptions[0]?.value ?? 'all');
  const [period, setPeriod] = useState<'7d' | '30d'>('7d');
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reporting?type=${type}&brand=${brand}&period=${period}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setText(data.text);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
      setText(null);
    } finally {
      setLoading(false);
    }
  }, [type, brand, period]);

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed — clipboard access blocked. Select and copy manually from the preview.');
    }
  };

  return (
    <div className="rounded-2xl bg-card border border-border shadow-sm flex flex-col">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3 mb-2">
          <div className={`h-10 w-10 rounded-lg ${iconBg} flex items-center justify-center`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <h3 className="font-bold text-[var(--foreground)]">{title}</h3>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="px-5 py-4 space-y-3">
        <select
          value={brand}
          onChange={e => setBrand(e.target.value)}
          className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
        >
          {brandOptions.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>

        {showPeriod && (
          <div className="flex gap-1 p-1 bg-muted rounded-xl">
            {[{ v: '7d', l: 'Weekly' }, { v: '30d', l: 'Monthly' }].map(p => (
              <button
                key={p.v}
                onClick={() => setPeriod(p.v as '7d' | '30d')}
                className={cn(
                  'flex-1 text-sm font-semibold py-1.5 rounded-lg transition-colors',
                  period === p.v ? 'bg-card text-[var(--foreground)] shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {p.l}
              </button>
            ))}
          </div>
        )}

        {/* Features list */}
        <div className="space-y-1">
          {features.map(f => (
            <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-1 h-1 rounded-full bg-[var(--primary)]" />
              {f}
            </div>
          ))}
        </div>

        <button
          onClick={generate}
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-[var(--primary)] hover:bg-[#d1177d] text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</> : 'Generate Report'}
        </button>
      </div>

      {error && (
        <div className="mx-5 mb-4 px-3 py-2 rounded-lg bg-red-500/10 text-red-600 text-xs">{error}</div>
      )}

      {text && (
        <div className="px-5 pb-5 space-y-3">
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-2 bg-muted/80 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Preview</span>
              <button
                onClick={handleCopy}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors',
                  copied ? 'bg-green-500 text-white' : 'bg-secondary hover:bg-secondary text-foreground'
                )}
              >
                {copied ? <><Check className="h-3.5 w-3.5" />Copied</> : <><Clipboard className="h-3.5 w-3.5" />Copy</>}
              </button>
            </div>
            <div className="p-4 bg-card max-h-[400px] overflow-auto">
              <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">{text}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Post Generator Card ─────────────────────────────────────────────
function PostCard({
  title, icon: Icon, type, showPeriod = true, description, slackOnly = false, pdfEndpoint,
}: {
  title: string; icon: typeof Flame; type: string; showPeriod?: boolean; description: string;
  slackOnly?: boolean; pdfEndpoint?: string;
}) {
  const brandOptions = useBrandOptions({ collapseUmbrella: true });
  const [brand, setBrand] = useState(brandOptions[0]?.value ?? 'all');
  const [period, setPeriod] = useState<'7d' | '30d'>('7d');
  const [format, setFormat] = useState<'discord' | 'slack'>(slackOnly ? 'slack' : 'discord');
  const [text, setText] = useState<string | null>(null);
  const [stats, setStats] = useState<{ totalGmv: number; videoCount: number; creatorCount: number } | null>(null);
  const [mentionMap, setMentionMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const downloadPdf = useCallback(async () => {
    if (!pdfEndpoint) return;
    setPdfLoading(true);
    try {
      const res = await fetch(`${pdfEndpoint}?brand=${brand}`);
      if (!res.ok) throw new Error(`PDF generation failed (${res.status})`);
      const blob = await res.blob();
      // Read filename from Content-Disposition if present
      const cd = res.headers.get('content-disposition') || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `brand-update-${brand}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF download failed');
    } finally {
      setPdfLoading(false);
    }
  }, [pdfEndpoint, brand]);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = `/api/discord-posts?type=${type}&brand=${brand}&period=${period}`;
      const res = await fetch(endpoint);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      let output = data.text;

      // Convert to Slack format if needed (skip for slackOnly — already Slack-formatted server-side)
      if (format === 'slack' && !slackOnly) {
        output = toSlackFormat(output);
      }

      setText(output);
      setStats(data.stats);
      setMentionMap(data.mentionMap || {});
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate post');
    } finally {
      setLoading(false);
    }
  }, [type, brand, period, format, slackOnly]);

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed — clipboard access blocked. Select and copy manually from the preview.');
    }
  };

  return (
    <div className="rounded-2xl bg-card border border-border shadow-sm flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-[var(--primary)]" />
          </div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">{title}</h2>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {/* Controls */}
      <div className="px-5 py-4 space-y-3">
        <select
          value={brand}
          onChange={e => setBrand(e.target.value)}
          className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)]"
        >
          {brandOptions.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>

        {showPeriod && (
          <div className="flex gap-1 p-1 bg-muted rounded-xl">
            {[{ v: '7d', l: '7 Day' }, { v: '30d', l: 'Monthly' }].map(p => (
              <button
                key={p.v}
                onClick={() => setPeriod(p.v as '7d' | '30d')}
                className={cn(
                  'flex-1 text-sm font-semibold py-1.5 rounded-lg transition-colors',
                  period === p.v ? 'bg-card text-[var(--foreground)] shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {p.l}
              </button>
            ))}
          </div>
        )}

        {/* Format Toggle */}
        {slackOnly ? (
          <div className="flex items-center justify-center gap-1.5 p-1.5 bg-[#4A154B] text-white text-sm font-semibold rounded-xl">
            📨 Slack format (client-facing)
          </div>
        ) : (
          <div className="flex gap-1 p-1 bg-muted rounded-xl">
            <button
              onClick={() => setFormat('discord')}
              className={cn(
                'flex-1 text-sm font-semibold py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5',
                format === 'discord' ? 'bg-[#5865F2] text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              💬 Discord
            </button>
            <button
              onClick={() => setFormat('slack')}
              className={cn(
                'flex-1 text-sm font-semibold py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5',
                format === 'slack' ? 'bg-[#4A154B] text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              📨 Slack
            </button>
          </div>
        )}

        <button
          onClick={generate}
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-[var(--primary)] hover:bg-[#d1177d] text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</> : 'Generate'}
        </button>

        {pdfEndpoint && (
          <button
            onClick={downloadPdf}
            disabled={pdfLoading}
            className="w-full py-2.5 rounded-xl border border-border hover:bg-muted text-[var(--foreground)] font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {pdfLoading ? <><Loader2 className="h-4 w-4 animate-spin" />Building PDF…</> : <><Download className="h-4 w-4" />Download PDF</>}
          </button>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="px-5 pb-3 flex gap-4 text-xs text-muted-foreground">
          <span><strong className="text-foreground">${stats.totalGmv.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong> GMV</span>
          <span><strong className="text-foreground">{stats.videoCount}</strong> videos</span>
          <span><strong className="text-foreground">{stats.creatorCount}</strong> creators</span>
        </div>
      )}

      {/* Preview */}
      {text && (
        <div className="mx-5 mb-4 rounded-xl overflow-hidden border border-border flex-1 flex flex-col">
          {format === 'discord' ? (
            <>
              <div className="px-4 py-2 bg-[#36393f] flex items-center justify-between">
                <span className="text-xs font-semibold text-[#dcddde]">Discord Preview</span>
                <CopyBtn copied={copied} onClick={handleCopy} variant="discord" />
              </div>
              <div className="bg-[#36393f] p-4 flex-1 overflow-auto max-h-[500px]">
                <div className="text-sm text-[#dcddde] whitespace-pre-wrap leading-[1.375rem]">
                  {renderDiscordMarkdown(text, mentionMap)}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="px-4 py-2 bg-card border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Slack Preview</span>
                <CopyBtn copied={copied} onClick={handleCopy} variant="slack" />
              </div>
              <div className="bg-card p-4 flex-1 overflow-auto max-h-[500px] border-l-4 border-[var(--primary)]">
                <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {text}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="mx-5 mb-4 px-3 py-2 rounded-lg bg-red-500/10 text-red-600 text-xs">{error}</div>
      )}

      {text && (
        <div className="px-5 pb-5">
          <button
            onClick={handleCopy}
            className={cn(
              'w-full py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2',
              copied ? 'bg-green-500 text-white' : 'bg-[var(--foreground)] hover:bg-[#2a2b4a] text-white'
            )}
          >
            {copied ? <><Check className="h-4 w-4" />Copied</> : <><Clipboard className="h-4 w-4" />Copy to Clipboard</>}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Shared Components ───────────────────────────────────────────────
function CopyBtn({ copied, onClick, variant }: { copied: boolean; onClick: () => void; variant: 'discord' | 'slack' }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
        copied
          ? 'bg-green-600 text-white'
          : variant === 'discord'
            ? 'bg-[#5865F2] hover:bg-[#4752c4] text-white'
            : 'bg-secondary hover:bg-secondary text-foreground'
      }`}>
      {copied ? <><Check className="h-3.5 w-3.5" />Copied!</> : <><Clipboard className="h-3.5 w-3.5" />Copy</>}
    </button>
  );
}

// ── Discord Markdown Renderer ───────────────────────────────────────
function renderDiscordMarkdown(text: string, mentionMap: Record<string, string> = {}) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('# ')) return <div key={i} className="text-xl font-bold text-white mt-1 mb-1">{parseInline(line.slice(2), mentionMap)}</div>;
    if (line.startsWith('> ')) return <div key={i} className="border-l-[3px] border-[#4f545c] pl-3 my-0.5 text-[#b9bbbe]">{parseInline(line.slice(2), mentionMap)}</div>;
    if (line === '') return <br key={i} />;
    return <div key={i}>{parseInline(line, mentionMap)}</div>;
  });
}

/**
 * Reject anything that isn't a plain http/https URL. Stops the markdown link
 * pattern from emitting `javascript:` or `data:` URLs even though the source
 * text is generated by our own server — defence in depth in case future
 * report content ever incorporates user-supplied strings.
 */
function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function parseInline(text: string, mentionMap: Record<string, string> = {}): React.ReactNode {
  const parts: (string | React.ReactElement)[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) { parts.push(<strong key={key++} className="font-bold text-white">{parseInline(boldMatch[1], mentionMap)}</strong>); remaining = remaining.slice(boldMatch[0].length); continue; }
    const italicMatch = remaining.match(/^\*(.+?)\*/);
    if (italicMatch) { parts.push(<em key={key++} className="italic text-[#b9bbbe]">{italicMatch[1]}</em>); remaining = remaining.slice(italicMatch[0].length); continue; }
    const linkMatch = remaining.match(/^\[(.+?)\]\((.+?)\)/);
    if (linkMatch) {
      const href = safeHref(linkMatch[2]);
      if (href) {
        parts.push(<a key={key++} href={href} target="_blank" rel="noopener noreferrer" className="text-[#00AFF4] hover:underline">{linkMatch[1]}</a>);
      } else {
        // Render as plain text so we never emit a dangerous href.
        parts.push(<span key={key++}>{linkMatch[1]}</span>);
      }
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }
    const mentionMatch = remaining.match(/^<@(\d+)>/);
    if (mentionMatch) { parts.push(<span key={key++} className="bg-[#5865F2]/20 text-[#dee0fc] rounded px-1">@{mentionMap[mentionMatch[1]] || 'user'}</span>); remaining = remaining.slice(mentionMatch[0].length); continue; }
    const nextSpecial = remaining.slice(1).search(/[\*\[<]/);
    if (nextSpecial === -1) { parts.push(remaining); break; }
    parts.push(remaining.slice(0, nextSpecial + 1));
    remaining = remaining.slice(nextSpecial + 1);
  }
  return <>{parts}</>;
}

// ── Slack Format Converter ──────────────────────────────────────────
function toSlackFormat(discordText: string): string {
  return discordText
    .replace(/^# (.+)$/gm, '*$1*')           // # Header -> *bold*
    .replace(/^> (.+)$/gm, '> $1')            // Keep blockquotes
    .replace(/\*\*(.+?)\*\*/g, '*$1*')        // **bold** -> *bold*
    .replace(/<@(\d+)>/g, '@user')             // Mentions simplified
    .replace(/__(.+?)__/g, '_$1_');            // __underline__ -> _italic_
}
