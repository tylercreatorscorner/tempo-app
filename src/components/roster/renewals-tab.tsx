'use client';

/**
 * Renewals Tab — embeds in /roster as the third tab (Managed Roster · All Creators · Renewals).
 *
 * Shows three stacked sections: Cut · Watch · Keep, each with creator rows
 * displaying ROI, GMV, post progress, and contract pace. Each section has a
 * "Copy Discord post" button that produces the same paste-ready text format
 * the old dashboard used.
 *
 * Data: GET /api/renewals?brand=&product=  (admin-gated)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronDown, ChevronUp,
  Clipboard, Loader2, Minus, Star, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBrandMeta, type BrandMeta } from '@/hooks/use-brand-meta';
import { formatCurrency, formatNumber } from '@/lib/utils/format';

interface RenewalCreator {
  id: number;
  realName: string | null;
  discordName: string | null;
  discordId: string | null;
  discordAvatar: string | null;
  handle: string;
  brand: string;
  retainer: number;
  gmv: number;
  gmvPrev: number;
  roi: number;
  roiPrev: number;
  roiTrend: 'up' | 'down' | 'stable';
  category: 'cut' | 'watch' | 'keep';
  isStar: boolean;
  hasStartDate: boolean;
  contractLengthDays: number;
  dayNumber: number;
  postsCompleted: number;
  postsRequired: number;
  postProgress: number;
  isComplete: boolean;
  expectedPosts: number;
  postsDelta: number;
  paceStatus: 'ahead' | 'on-track' | 'slow' | 'behind';
}

interface RenewalsResponse {
  cut: RenewalCreator[];
  watch: RenewalCreator[];
  keep: RenewalCreator[];
  totals: {
    cutCount: number; watchCount: number; keepCount: number; starCount: number;
    monthlyAtRisk: number; monthlyTotal: number;
  };
}

interface RenewalsTabProps {
  brand: string | null;             // current brand filter from URL
}

// ── Section config ─────────────────────────────────────────────────

const SECTIONS = [
  {
    id: 'cut'   as const,
    label: 'Cut',
    sublabel: 'ROI < 1x — losing money',
    icon: X,
    accent: 'red'    as const,
  },
  {
    id: 'watch' as const,
    label: 'Watch',
    sublabel: 'ROI 1–3x — monitor closely',
    icon: AlertTriangle,
    accent: 'amber'  as const,
  },
  {
    id: 'keep'  as const,
    label: 'Keep',
    sublabel: 'ROI 3x+ — solid performers',
    icon: CheckCircle2,
    accent: 'green'  as const,
  },
] as const;

const ACCENT_BG = {
  red:   'bg-red-50 text-red-700 ring-1 ring-red-200',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  green: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
} as const;

const ACCENT_DOT = {
  red:   'bg-red-500',
  amber: 'bg-amber-500',
  green: 'bg-emerald-500',
} as const;

const ACCENT_TEXT = {
  red:   'text-red-600',
  amber: 'text-amber-700',
  green: 'text-emerald-600',
} as const;

// ── Main component ─────────────────────────────────────────────────

export function RenewalsTab({ brand }: RenewalsTabProps) {
  const brandMeta = useBrandMeta();
  const [data, setData] = useState<RenewalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (brand) params.set('brand', brand);
      const res = await fetch(`/api/renewals?${params.toString()}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setData(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load renewals');
    } finally {
      setLoading(false);
    }
  }, [brand]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function toggleCollapse(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const headlineStrip = useMemo(() => {
    if (!data) return null;
    const t = data.totals;
    return (
      <div className="rounded-2xl bg-card border border-border shadow-sm p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <HeadlineCell
            color="red"
            label="Cut"
            value={formatNumber(t.cutCount)}
            sub={t.monthlyAtRisk > 0 ? `${formatCurrency(t.monthlyAtRisk)}/mo at risk` : '—'}
          />
          <HeadlineCell color="amber" label="Watch"   value={formatNumber(t.watchCount)} sub="monitoring" />
          <HeadlineCell color="green" label="Keep"    value={formatNumber(t.keepCount)}
            sub={t.starCount > 0 ? `${t.starCount} ⭐ stars` : 'solid performers'} />
          <HeadlineCell color="green" label="Total Retainer" value={formatCurrency(t.monthlyTotal)} sub="/month across roster" />
        </div>
      </div>
    );
  }, [data]);

  if (loading && !data) {
    return (
      <div className="rounded-2xl bg-card border border-border shadow-sm p-12 text-center">
        <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground mt-3">Computing renewals…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const noResults = data.cut.length === 0 && data.watch.length === 0 && data.keep.length === 0;

  return (
    <div className="space-y-4">
      {headlineStrip}

      {noResults && (
        <div className="rounded-2xl bg-card border border-border shadow-sm p-12 text-center">
          <p className="text-sm font-medium text-muted-foreground">No retainer creators found</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {brand
              ? `Nothing on retainer for ${brandMeta.label(brand)}. Switch brand or check All Brands.`
              : 'Add at least one managed creator with a retainer to see renewal recommendations here.'}
          </p>
        </div>
      )}

      {SECTIONS.map(section => {
        const list = data[section.id];
        if (list.length === 0 && !noResults) return null;
        const isCollapsed = collapsed.has(section.id);
        return (
          <RenewalSection
            key={section.id}
            section={section}
            creators={list}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => toggleCollapse(section.id)}
            brand={brand}
          />
        );
      })}
    </div>
  );
}

// ── Headline strip cell ────────────────────────────────────────────

function HeadlineCell({
  color, label, value, sub,
}: {
  color: 'red' | 'amber' | 'green';
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={cn('h-2 w-2 rounded-full', ACCENT_DOT[color])} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-extrabold text-[var(--foreground)]">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

// ── Section ────────────────────────────────────────────────────────

function RenewalSection({
  section, creators, isCollapsed, onToggleCollapse, brand,
}: {
  section: typeof SECTIONS[number];
  creators: RenewalCreator[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  brand: string | null;
}) {
  const brandMeta = useBrandMeta();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = formatDiscordText(section.id, creators, brand, brandMeta);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [section.id, creators, brand, brandMeta]);

  const Icon = section.icon;

  return (
    <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
      {/* Section header */}
      <div className={cn(
        'flex items-center justify-between px-5 py-3 border-b border-border',
        section.accent === 'red'   && 'bg-red-50/40',
        section.accent === 'amber' && 'bg-amber-50/40',
        section.accent === 'green' && 'bg-emerald-50/40',
      )}>
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          {isCollapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
          <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center', ACCENT_BG[section.accent])}>
            <Icon className="h-3.5 w-3.5" />
          </div>
          <div className="text-left">
            <div className="text-sm font-bold text-[var(--foreground)]">
              {section.label} · <span className={cn('font-extrabold', ACCENT_TEXT[section.accent])}>{creators.length}</span>
            </div>
            <div className="text-[11px] text-muted-foreground">{section.sublabel}</div>
          </div>
        </button>
        <button
          onClick={handleCopy}
          disabled={creators.length === 0}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors',
            copied ? 'bg-emerald-500 text-white' : 'bg-card border border-border hover:bg-muted text-foreground',
            creators.length === 0 && 'opacity-40 cursor-not-allowed',
          )}
        >
          <Clipboard className="h-3 w-3" />
          {copied ? 'Copied!' : 'Copy for Discord'}
        </button>
      </div>

      {/* Section body */}
      {!isCollapsed && (
        <div className="divide-y divide-gray-50">
          {creators.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No creators in this bucket.</div>
          ) : (
            creators.map(c => <RenewalRow key={c.id} creator={c} />)
          )}
        </div>
      )}
    </div>
  );
}

// ── Row ────────────────────────────────────────────────────────────

const PACE_STYLES = {
  ahead:    'bg-emerald-50 text-emerald-700',
  'on-track': 'bg-blue-50 text-blue-700',
  slow:     'bg-amber-50 text-amber-700',
  behind:   'bg-red-50 text-red-700',
} as const;

const PACE_LABEL = {
  ahead:    '🚀 Ahead',
  'on-track': '✅ On track',
  slow:     '⚠ Slow',
  behind:   '🔴 Behind',
} as const;

function RenewalRow({ creator: c }: { creator: RenewalCreator }) {
  const brandMeta = useBrandMeta();
  const brandColor = brandMeta.color(c.brand);
  const trendIcon = c.roiTrend === 'up'   ? <ArrowUp className="h-3 w-3 text-emerald-500" />
                  : c.roiTrend === 'down' ? <ArrowDown className="h-3 w-3 text-red-500" />
                  :                         <Minus className="h-3 w-3 text-muted-foreground" />;
  const handleClean = (c.handle ?? '').replace(/^@/, '');
  const profileHref = `/creators/${encodeURIComponent(handleClean)}`;
  const daysLeft = c.hasStartDate ? Math.max(0, c.contractLengthDays - c.dayNumber) : null;

  return (
    <a
      href={profileHref}
      className="grid grid-cols-12 gap-3 items-center px-5 py-3 hover:bg-muted/60 transition-colors"
    >
      {/* Creator identity */}
      <div className="col-span-12 sm:col-span-3 flex items-center gap-2 min-w-0">
        {c.discordAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.discordAvatar} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
        ) : (
          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
            {(c.realName || c.discordName || handleClean).slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--foreground)] truncate flex items-center gap-1">
            @{handleClean}
            {c.isStar && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: brandColor }} />
            <span className="truncate">{brandMeta.label(c.brand)}</span>
          </div>
        </div>
      </div>

      {/* ROI */}
      <div className="col-span-3 sm:col-span-2 text-right sm:text-left">
        <div className="flex items-center sm:justify-start justify-end gap-1">
          <span className={cn('text-sm font-extrabold tabular-nums',
            c.roi < 1 ? 'text-red-600' : c.roi < 3 ? 'text-amber-700' : 'text-emerald-600')}>
            {c.roi.toFixed(1)}x
          </span>
          {trendIcon}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">ROI</div>
      </div>

      {/* GMV */}
      <div className="col-span-3 sm:col-span-2 text-right sm:text-left">
        <div className="text-sm font-bold text-[var(--foreground)] tabular-nums">{formatCurrency(c.gmv)}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{formatCurrency(c.retainer)}/mo retainer</div>
      </div>

      {/* Posts progress */}
      <div className="col-span-3 sm:col-span-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full',
                c.isComplete ? 'bg-emerald-400' : c.paceStatus === 'behind' ? 'bg-red-400' : c.paceStatus === 'slow' ? 'bg-amber-400' : 'bg-blue-400',
              )}
              style={{ width: `${Math.min(100, c.postProgress)}%` }}
            />
          </div>
          <span className="text-[11px] font-bold text-[var(--foreground)] tabular-nums whitespace-nowrap">
            {c.postsCompleted}/{c.postsRequired}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', PACE_STYLES[c.paceStatus])}>
            {PACE_LABEL[c.paceStatus]}
          </span>
        </div>
      </div>

      {/* Contract status */}
      <div className="col-span-3 sm:col-span-2 text-right">
        {daysLeft !== null ? (
          <>
            <div className="text-sm font-semibold text-[var(--foreground)] tabular-nums">
              {daysLeft === 0 ? 'Today' : `${daysLeft}d`}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">until renewal</div>
          </>
        ) : (
          <>
            <div className="text-sm font-semibold text-muted-foreground tabular-nums">Rolling</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{c.contractLengthDays}d window</div>
          </>
        )}
      </div>
    </a>
  );
}

// ── Discord copy text ──────────────────────────────────────────────

function formatDiscordText(
  section: 'cut' | 'watch' | 'keep',
  creators: RenewalCreator[],
  brand: string | null,
  brandMeta: BrandMeta,
): string {
  const brandLabel = brand ? brandMeta.label(brand) : 'All Brands';
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const list = creators.slice(0, 20);

  if (section === 'cut') {
    let text = `✂️ **RECOMMEND CUT — ${brandLabel}** ✂️\n`;
    text += `_Below 1x ROI — losing money (${today})_\n\n`;
    list.forEach((c, i) => {
      const paceIcon = c.paceStatus === 'behind' ? '🔴' : c.paceStatus === 'slow' ? '⚠️' : '';
      text += `**${i + 1}. @${(c.handle || '').replace(/^@/, '')}** — ${c.roi.toFixed(1)}x ROI — ${formatCurrency(c.retainer)}/mo\n`;
      text += `   📊 GMV: ${formatCurrency(c.gmv)} | Posts: ${c.postsCompleted}/${c.postsRequired} ${paceIcon}\n`;
    });
    const totalAtRisk = list.reduce((s, c) => s + c.retainer, 0);
    text += `\n**💰 Total at risk: ${formatCurrency(totalAtRisk)}/mo**`;
    return text;
  }

  if (section === 'watch') {
    let text = `👀 **WATCH LIST — ${brandLabel}** 👀\n`;
    text += `_1–3x ROI — monitor closely (${today})_\n\n`;
    list.forEach((c, i) => {
      const paceIcon = c.paceStatus === 'behind' ? '🔴' : c.paceStatus === 'slow' ? '⚠️' : '✅';
      text += `**${i + 1}. @${(c.handle || '').replace(/^@/, '')}** — ${c.roi.toFixed(1)}x ROI | Posts: ${c.postsCompleted}/${c.postsRequired} ${paceIcon}\n`;
    });
    return text;
  }

  // keep
  let text = `✅ **KEEP — ${brandLabel}** ✅\n`;
  text += `_3x+ ROI — solid performers (${today})_\n\n`;
  list.forEach(c => {
    const star = c.roi >= 10 ? '⭐ ' : '';
    const completeIcon = c.isComplete ? '✅' : '';
    text += `${star}**@${(c.handle || '').replace(/^@/, '')}** — ${c.roi.toFixed(1)}x ROI | ${c.postsCompleted}/${c.postsRequired} ${completeIcon}\n`;
  });
  return text;
}
