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
  ok:      'bg-[var(--pulse-pos-bg)] text-[var(--pulse-pos)]',
  stale:   'bg-[var(--pulse-warn-bg)] text-[var(--pulse-warn)]',
  missing: 'bg-[var(--pulse-neg-bg)] text-[var(--pulse-neg)]',
  never:   'bg-muted text-muted-foreground',
} as const;

const STATUS_BADGE = {
  current: 'bg-[var(--pulse-pos-bg)] text-[var(--pulse-pos)]',
  behind:  'bg-[var(--pulse-warn-bg)] text-[var(--pulse-warn)]',
  stale:   'bg-[var(--pulse-neg-bg)] text-[var(--pulse-neg)]',
  never:   'bg-muted text-muted-foreground',
} as const;

/** Sort weight — problems first, worst first. */
const STATUS_ORDER: Record<'stale' | 'behind' | 'never' | 'current', number> = {
  stale: 0,
  behind: 1,
  never: 2,
  current: 3,
};

export function FreshnessPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<FreshnessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/upload/freshness', { cache: 'no-store' })
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
      <div className="rounded-2xl bg-card border border-border shadow-sm p-6 flex items-center gap-3 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" /> Loading data freshness...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-500">
        Couldn't load freshness: {error}
      </div>
    );
  }

  if (!data) return null;

  // Problems first, worst first; healthy brands collapse into one line so the
  // rail reads as a TO-DO LIST, not a wall of green.
  const sorted = [...data.brands].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.daysBehind - a.daysBehind,
  );
  const problems = sorted.filter((b) => b.status === 'stale' || b.status === 'behind');
  const current = sorted.filter((b) => b.status === 'current');
  const never = sorted.filter((b) => b.status === 'never');

  return (
    <div className="rounded-2xl bg-card border border-border shadow-[var(--pulse-elev-1)] overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Data freshness</div>
          <h2 className="mt-0.5 text-sm font-bold text-[var(--foreground)]">Gaps to fill</h2>
        </div>
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
            problems.length === 0
              ? 'bg-[var(--pulse-pos-bg)] text-[var(--pulse-pos)]'
              : 'bg-[var(--pulse-warn-bg)] text-[var(--pulse-warn)]',
          )}
        >
          {problems.length === 0 ? 'All current' : `${problems.length} behind`}
        </span>
      </div>

      <div className="space-y-3 p-4">
        {/* Future-dated data warning */}
        {data.futureIssues.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-lg border border-[var(--pulse-warn)]/25 bg-[var(--pulse-warn-bg)] px-3 py-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--pulse-warn)]" />
            <div className="text-[11px] leading-relaxed text-foreground">
              <strong>Future-dated data:</strong>{' '}
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

        {problems.length === 0 && (
          <p className="py-2 text-center text-sm text-muted-foreground">
            Every brand is current. Nothing to fill.
          </p>
        )}

        {problems.map((b) => {
          const dateLabel = b.latestDate
            ? new Date(b.latestDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '—';
          return (
            <div
              key={b.brand}
              className={cn(
                'rounded-xl border p-3',
                b.status === 'stale'
                  ? 'border-[var(--pulse-neg)]/25 bg-[var(--pulse-neg-bg)]/40'
                  : 'border-[var(--pulse-warn)]/25 bg-[var(--pulse-warn-bg)]/40',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-[var(--foreground)]">{b.displayName}</div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    latest: {dateLabel}
                  </div>
                </div>
                <span
                  className={cn(
                    'whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                    STATUS_BADGE[b.status],
                  )}
                >
                  {b.statusLabel}
                </span>
              </div>

              {/* Per-file-type dots */}
              <div className="mt-2 flex gap-1.5">
                {data.fileTypes.map((ft) => {
                  const f = b.files[ft.key];
                  return (
                    <div
                      key={ft.key}
                      title={`${f.name}: ${f.latestDate ?? 'no data'}`}
                      className={cn(
                        'flex h-6 w-6 cursor-help items-center justify-center rounded-md text-[10.5px] font-bold',
                        DOT_STYLES[f.status],
                      )}
                    >
                      {ft.label}
                    </div>
                  );
                })}
              </div>

              {b.gaps.length > 0 && (
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Missing: <span className="font-medium text-foreground">{b.gaps.slice(0, 5).join(', ')}</span>
                  {b.gaps.length > 5 && ` +${b.gaps.length - 5} more`}
                </div>
              )}
            </div>
          );
        })}

        {current.length > 0 && problems.length > 0 && (
          <p className="text-[11.5px] text-muted-foreground">
            <span className="font-semibold text-[var(--pulse-pos)]">✓ Current:</span>{' '}
            {current.map((b) => b.displayName).join(', ')}
          </p>
        )}
        {never.length > 0 && (
          <p className="text-[11px] text-muted-foreground/60">
            No data yet: {never.map((b) => b.displayName).join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}
