'use client';

/**
 * Data Status Matrix — middle of /upload.
 *
 * 14-day grid: rows = brands, cols = days. Each cell shows whether (brand, day)
 * has any data in the selected file type's table. File type selector at top
 * (Creator / Video / Video List / Products).
 *
 * The cells are tiny by design — the value is in the gestalt: solid block of
 * green = healthy, red checkerboard = a brand has gaps.
 */
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type FileTypeKey = 'creator' | 'video' | 'videolist' | 'product';

interface MatrixRow {
  brand: string;
  displayName: string;
  cells: { date: string; present: boolean }[];
}

interface MatrixResponse {
  fileType: FileTypeKey;
  dates: string[];
  rows: MatrixRow[];
}

const TABS: { key: FileTypeKey; label: string }[] = [
  { key: 'creator',   label: 'Creator' },
  { key: 'video',     label: 'Video' },
  { key: 'videolist', label: 'Video List' },
  { key: 'product',   label: 'Product' },
];

export function DataMatrix({ refreshKey = 0 }: { refreshKey?: number }) {
  const [tab, setTab] = useState<FileTypeKey>('creator');
  const [data, setData] = useState<MatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // Rows with zero coverage across the whole window are hidden by default —
  // they're almost always brands that have never uploaded this file type, and
  // an all-red row carries no signal. Not persisted; resets each load.
  const [showNever, setShowNever] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/upload/matrix?fileType=${tab}`, { cache: 'no-store' })
      .then(r => r.json())
      .then((d: MatrixResponse | { error: string }) => {
        if (cancelled) return;
        if ('error' in d) return;
        setData(d);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab, refreshKey]);

  const headers = useMemo(() => {
    if (!data) return [];
    return data.dates.map(d => {
      const dateObj = new Date(d + 'T12:00:00Z');
      return {
        date: d,
        day: dateObj.getUTCDate(),
        weekday: dateObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).slice(0, 3),
      };
    });
  }, [data]);

  // The matrix response has no latest-date field, so "never-uploaded" is
  // derived from what it does have: zero coverage cells across the window.
  const neverCount = useMemo(
    () => (data ? data.rows.filter(r => r.cells.every(c => !c.present)).length : 0),
    [data],
  );
  const visibleRows = useMemo(() => {
    if (!data) return [];
    if (showNever) return data.rows;
    return data.rows.filter(r => r.cells.some(c => c.present));
  }, [data, showNever]);

  return (
    <div className="rounded-2xl bg-card border border-border shadow-sm p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Coverage</div>
          <h2 className="text-base font-bold text-[var(--foreground)] mt-0.5">Last 14 days</h2>
        </div>
        <div className="flex items-center gap-2">
          {neverCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNever(v => !v)}
              className="text-[11px]"
            >
              {showNever ? 'Hide never-uploaded' : `Show ${neverCount} never-uploaded`}
            </Button>
          )}
          <div className="flex gap-1 p-1 bg-muted rounded-xl">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors',
                  tab === t.key ? 'bg-card text-[var(--foreground)] shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : data ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-2 pr-3 sticky left-0 bg-card">Brand</th>
                {headers.map(h => (
                  <th key={h.date} className="px-1 pb-2 text-center text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <div className="text-[11px] text-foreground">{h.day}</div>
                    <div>{h.weekday}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr className="border-t border-border">
                  <td colSpan={headers.length + 1} className="py-6 text-center text-sm text-muted-foreground">
                    No brands have data in this window. Use &quot;Show {neverCount} never-uploaded&quot; to see them.
                  </td>
                </tr>
              )}
              {visibleRows.map(r => (
                <tr key={r.brand} className="border-t border-border">
                  <td className="text-left text-xs font-medium text-[var(--foreground)] py-1.5 pr-3 sticky left-0 bg-card whitespace-nowrap">
                    {r.displayName}
                  </td>
                  {r.cells.map(c => (
                    <td key={c.date} className="px-1 py-1.5 text-center" title={`${r.displayName} · ${c.date} · ${c.present ? 'Has data' : 'Missing'}`}>
                      <div
                        className={cn(
                          'h-5 w-5 rounded-md mx-auto',
                          c.present ? 'bg-emerald-500/15 ring-1 ring-emerald-200' : 'bg-red-500/10 ring-1 ring-red-100'
                        )}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-md bg-emerald-500/15 ring-1 ring-emerald-200" />Has data</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-md bg-red-500/10 ring-1 ring-red-100" />Missing</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
