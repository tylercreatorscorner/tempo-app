'use client';

/**
 * Freshness Panel — top of /upload.
 *
 * Per-brand cards showing:
 *   - Latest data date (overall, anchored on creator data)
 *   - Status badge (Current / Nd behind / Nd stale / No data)
 *   - Per-file-type status dots (C V L P) — hover for table-specific date
 *   - Detected gaps inside the 30-day window
 *
 * Plus a future-data warning at the top if any table somehow has rows dated
 * after yesterday (always invalid — TikTok data lags by ~1 day).
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileStatus {
  status: 'ok' | 'stale' | 'missing' | 'never';
  latestDate: string | null;
  label: string;
  name: string;
}

interface BrandFreshness {
  brand: string;
  displayName: string;
  latestDate: string | null;
  status: 'current' | 'behind' | 'stale' | 'never';
  statusLabel: string;
  daysBehind: number;
  gaps: string[];
  files: Record<string, FileStatus>;
}

interface FreshnessResponse {
  brands: BrandFreshness[];
  futureIssues: { brand: string; fileType: string; dates: string[] }[];
  fileTypes: { key: string; label: string; name: string }[];
}

const DOT_STYLES = {
  ok:      'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
  stale:   'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
  missing: 'bg-red-100 text-red-700 ring-1 ring-red-200',
  never:   'bg-gray-100 text-gray-400 ring-1 ring-gray-200',
} as const;

const STATUS_BADGE = {
  current: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  behind:  'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  stale:   'bg-red-50 text-red-600 ring-1 ring-red-200',
  never:   'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
} as const;

export function FreshnessPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<FreshnessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/upload/freshness')
      .then(r => r.json())
      .then((d: FreshnessResponse | { error: string }) => {
        if (cancelled) return;
        if ('error' in d) setError(d.error);
        else setData(d);
      })
      .catch(() => { if (!cancelled) setError('Failed to load freshness'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (loading && !data) {
    return (
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6 flex items-center gap-3 text-sm text-gray-500">
        <RefreshCw className="h-4 w-4 animate-spin" /> Loading data freshness...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
        Couldn't load freshness: {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-3">
      {/* Future-dated data warning */}
      {data.futureIssues.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <strong>Future-dated data detected:</strong>{' '}
            {data.futureIssues.slice(0, 3).map((i, idx) => (
              <span key={idx}>
                {idx > 0 && ' · '}
                {i.brand} {i.fileType}: {i.dates.join(', ')}
              </span>
            ))}
            {data.futureIssues.length > 3 && ` +${data.futureIssues.length - 3} more`}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">Data freshness</div>
          <h2 className="text-base font-bold text-[#1A1B3A] mt-0.5">Latest uploads by brand</h2>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" />Current</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Behind</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-400" />Stale</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gray-300" />No data</span>
        </div>
      </div>

      {/* Brand cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {data.brands.map(b => {
          const dateLabel = b.latestDate
            ? new Date(b.latestDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '—';
          return (
            <div
              key={b.brand}
              className={cn(
                'rounded-xl bg-white border shadow-sm p-3.5 flex flex-col gap-2.5',
                b.status === 'current' && 'border-emerald-100',
                b.status === 'behind'  && 'border-amber-100',
                b.status === 'stale'   && 'border-red-100',
                b.status === 'never'   && 'border-gray-100',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-[#1A1B3A] truncate">{b.displayName}</div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 mt-0.5">latest: {dateLabel}</div>
                </div>
                <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap', STATUS_BADGE[b.status])}>
                  {b.statusLabel}
                </span>
              </div>

              {/* Per-file-type dots */}
              <div className="flex gap-1.5">
                {data.fileTypes.map(ft => {
                  const f = b.files[ft.key];
                  const tooltip = `${f.name}: ${f.latestDate ? f.latestDate : 'no data'}`;
                  return (
                    <div
                      key={ft.key}
                      title={tooltip}
                      className={cn(
                        'h-7 w-7 rounded-md flex items-center justify-center text-[11px] font-bold cursor-help',
                        DOT_STYLES[f.status]
                      )}
                    >
                      {ft.label}
                    </div>
                  );
                })}
              </div>

              {/* Gaps */}
              {b.gaps.length > 0 && (
                <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5">
                  ⚠ Gaps: {b.gaps.slice(0, 4).join(', ')}{b.gaps.length > 4 && ` +${b.gaps.length - 4}`}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
