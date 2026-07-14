'use client';

/**
 * Upload History — bottom of /upload.
 *
 * Last N uploads from activity_log. Compact list — timestamp, brand, file
 * type, row count, who uploaded.
 */
import { useEffect, useState } from 'react';
import { Clock, RefreshCw } from 'lucide-react';

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/upload/history?limit=20', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: { items?: HistoryItem[] }) => {
        if (cancelled) return;
        setItems(d.items ?? []);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  return (
    <div className="rounded-2xl bg-card border border-border shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-bold text-[var(--foreground)]">Recent uploads</div>
        </div>
        <div className="text-[11px] text-muted-foreground">{items.length} of last 20</div>
      </div>
      {loading && items.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No uploads recorded yet — your first upload will show up here.
        </div>
      ) : (
        <ul className="divide-y divide-gray-50">
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
