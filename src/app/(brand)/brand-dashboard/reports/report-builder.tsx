'use client';

import { useState } from 'react';
import { Users, Video, Download, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PERIOD_LABELS, type BrandPortalPeriod } from '@/lib/data/brand-portal-periods';
import { readableOn, tintOver } from '@/lib/utils/brand-color';

type ReportType = 'roster' | 'videos';

const TYPE_OPTIONS: {
  value: ReportType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}[] = [
  {
    value: 'roster',
    label: 'Creator roster',
    description: 'GMV, orders, posts, and retainer per creator',
    icon: Users,
  },
  {
    value: 'videos',
    label: 'Posts log',
    description: 'Every post with TikTok URL, GMV, and orders',
    icon: Video,
  },
];

const PERIOD_OPTIONS: BrandPortalPeriod[] = ['7d', '30d', 'this_month', 'last_month'];

interface Props {
  accentColor: string;
}

export function ReportBuilder({ accentColor }: Props) {
  const [type, setType] = useState<ReportType>('roster');
  const [period, setPeriod] = useState<BrandPortalPeriod>('last_month');
  const downloadHref = `/api/brand/report?type=${type}&period=${period}`;
  const filename = filenameFor(type, period);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="p-5 sm:p-6 space-y-5">
        {/* Step 1: Report type */}
        <Step number={1} title="What do you want to report on?">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TYPE_OPTIONS.map((opt) => {
              const active = opt.value === type;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={cn(
                    'group relative flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all',
                    active
                      ? 'shadow-sm'
                      : 'border-border hover:border-border bg-card',
                  )}
                  style={
                    active
                      ? { borderColor: accentColor, backgroundColor: `${accentColor}08` }
                      : undefined
                  }
                >
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: active ? `${accentColor}18` : 'var(--muted)',
                    }}
                  >
                    <Icon
                      className="h-4 w-4"
                      style={{ color: active ? accentColor : 'var(--muted-foreground)' }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {opt.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </Step>

        {/* Step 2: Period */}
        <Step number={2} title="What time period?">
          <div className="flex flex-wrap gap-2">
            {PERIOD_OPTIONS.map((p) => {
              const active = p === period;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg border text-sm font-medium transition-all',
                    active
                      ? 'border-transparent shadow-sm'
                      : 'border-border bg-card text-foreground hover:border-border',
                  )}
                  style={
                    active
                      ? { backgroundColor: `${accentColor}14`, color: readableOn(accentColor, tintOver(accentColor, "14")) }
                      : undefined
                  }
                >
                  {PERIOD_LABELS[p]}
                </button>
              );
            })}
          </div>
        </Step>

        {/* Step 3: Format (single option for now) */}
        <Step number={3} title="Format">
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/60">
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">CSV</span>
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider ml-1">
              Excel-compatible
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            PDF format coming soon — ask your account manager for a polished
            client-ready PDF in the meantime.
          </p>
        </Step>
      </div>

      {/* Action bar */}
      <div className="px-5 sm:px-6 py-4 border-t border-border/50 bg-muted/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-xs text-muted-foreground font-mono truncate min-w-0">{filename}</div>
        <a
          href={downloadHref}
          download={filename}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity shrink-0"
          style={{
            background: `linear-gradient(90deg, ${accentColor}, var(--pulse-accent-2))`,
          }}
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      </div>
    </div>
  );
}

// ── Subcomponents ──

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="h-5 w-5 rounded-full bg-muted text-muted-foreground text-[11px] font-bold inline-flex items-center justify-center tabular-nums">
          {number}
        </span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function filenameFor(type: ReportType, period: BrandPortalPeriod): string {
  const date = new Date().toISOString().split('T')[0];
  return `tempo_${type}_${period}_${date}.csv`;
}
