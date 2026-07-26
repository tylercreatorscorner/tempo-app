'use client';

/**
 * Upload History — bottom of /upload.
 *
 * Last N uploads from activity_log. Compact list — timestamp, brand, file
 * type, row count, who uploaded.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { cn } from '@/lib/utils';

interface HistoryItem {
  id: string;
  createdAt: string;
  table: string;
  tableLabel: string;
  brand: string;
  brandLabel: string;
  reportDate: string | null;
  rowCount: number;
  uploadedBy: string;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)    return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  const d = Math.floor(ms / 86_400_000);
  return d <= 7 ? `${d}d ago` : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function UploadHistory({ refreshKey = 0 }: { refreshKey?: number }) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const showBar = useDelayedFlag(loading);

  // res.ok BEFORE the body. Without the guard, a 500 body ({error}) has no
  // `items`, `d.items ?? []` renders the empty state, and a broken audit trail
  // reads as "no uploads have ever happened" — the exact fake-empty that let
  // six brands go dark unnoticed.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/upload/history?limit=20', { cache: 'no-store' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { items?: HistoryItem[] };
      if (!Array.isArray(body.items)) throw new Error('unexpected response shape');
      setItems(body.items);
      setHasLoadedOnce(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load upload history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const coldFailure = error && !hasLoadedOnce;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-card border border-border shadow-[var(--pulse-elev-1)]">
      <TableLoadBar active={showBar} />
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-bold text-[var(--foreground)]">Recent uploads</div>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {hasLoadedOnce ? `${items.length} of last 20` : '—'}
        </div>
      </div>

      {/* Warm failure: keep the last good trail, say it may be stale. */}
      {error && hasLoadedOnce && (
        <div className="flex items-start gap-2 border-b border-border bg-[var(--pulse-warn-bg)] px-4 py-2 text-[11.5px] text-[var(--pulse-warn)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Couldn&apos;t refresh ({error}) — showing the last loaded uploads.</span>
        </div>
      )}

      {coldFailure ? (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <AlertTriangle className="h-5 w-5 text-[var(--pulse-neg)]" />
          <p className="text-sm font-semibold text-foreground">Couldn&apos;t load upload history</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {error} — this is a load error, not an empty audit trail.
          </p>
          <button
            onClick={load}
            className="mt-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Try again
          </button>
        </div>
      ) : loading && !hasLoadedOnce ? (
        <div className="space-y-2 px-4 py-4" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No uploads recorded yet — your first upload will show up here.
        </div>
      ) : (
        <ul className={cn('divide-y divide-border', showBar && 'opacity-60 transition-opacity duration-200')}>
          {items.map(it => (
            <li key={it.id} className="px-4 py-3 flex items-center gap-4 text-sm">
              <span className="text-[11px] text-muted-foreground w-16 shrink-0">{relativeTime(it.createdAt)}</span>
              <span className="font-medium text-[var(--foreground)] w-32 shrink-0 truncate" title={it.brandLabel}>
                {it.brandLabel || '—'}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium whitespace-nowrap">
                {it.tableLabel || it.table}
              </span>
              {it.reportDate && (
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {new Date(it.reportDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
              <span className="text-[11px] text-muted-foreground ml-auto whitespace-nowrap">
                <strong className="text-foreground">{it.rowCount.toLocaleString()}</strong> rows
              </span>
              <span className="text-[11px] text-muted-foreground truncate max-w-[120px]" title={it.uploadedBy}>
                by {it.uploadedBy}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
