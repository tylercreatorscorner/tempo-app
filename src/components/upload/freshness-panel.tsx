'use client';

/**
 * Freshness Panel — top of /upload.
 *
 * Per-brand cards showing:
 *   - Latest data date (overall, anchored on creator data)
 *   - Status badge (Current / Nd behind / Nd stale / No data)
 *   - Per-file-type status dots, one per expected daily report (C V P) — hover
 *     for the table-specific date
 *   - Detected gaps inside the 30-day window
 *
 * Plus a future-data warning at the top if any table somehow has rows dated
 * after yesterday (always invalid — TikTok data lags by ~1 day).
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  /** `exportToken` = the filename token TikTok ships the report under. */
  fileTypes: { key: string; label: string; name: string; exportToken?: string }[];
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

/** Max expected filenames listed per file type before collapsing to a count. */
const CHECKLIST_MAX_DATES_PER_TYPE = 14;

/**
 * UTC yesterday as YYYY-MM-DD — matches the freshness API's anchor convention
 * (TikTok data lags by ~1 day, so "caught up" means data through yesterday).
 */
function utcYesterdayStr(): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
}

/** Every date from (after + 1 day) through end (inclusive), as YYYYMMDD tokens. */
function expectedDateTokens(after: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(after + 'T12:00:00Z');
  const endTime = new Date(end + 'T12:00:00Z').getTime();
  d.setUTCDate(d.getUTCDate() + 1);
  // Hard cap guards against malformed dates producing a runaway loop; real
  // gaps are bounded by the API's 30-day window.
  for (let i = 0; i < 366 && d.getTime() <= endTime; i++) {
    out.push(d.toISOString().split('T')[0].replace(/-/g, ''));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Plain-text checklist of every expected filename a brand still needs, in the
 * upload page's filename convention: {BrandToken}_{TypeToken}_{YYYYMMDD}.xlsx
 * (Cata-Kor -> CataKor). The type token comes from the API's `exportToken` —
 * the name TikTok actually ships the file under, which is not the report's
 * display name (the video report still exports as Video_List, the product
 * report as Transaction_Analysis). One line per missing date per non-ok file
 * type; 'never' types are skipped (nothing to catch up).
 */
function buildChecklist(
  brand: BrandFreshness,
  fileTypes: FreshnessResponse['fileTypes'],
  yesterday: string,
): string {
  const brandToken = brand.displayName.replace(/[^A-Za-z0-9]/g, '');
  const lines: string[] = [`${brand.displayName}: files needed through ${yesterday}`];
  for (const ft of fileTypes) {
    const f = brand.files[ft.key];
    if (!f || f.status === 'ok' || f.status === 'never' || !f.latestDate) continue;
    const typeToken = ft.exportToken ?? f.name.replace(/\s+/g, '_');
    const dates = expectedDateTokens(f.latestDate, yesterday);
    for (const d of dates.slice(0, CHECKLIST_MAX_DATES_PER_TYPE)) {
      lines.push(`${brandToken}_${typeToken}_${d}.xlsx`);
    }
    if (dates.length > CHECKLIST_MAX_DATES_PER_TYPE) {
      lines.push(`...and ${dates.length - CHECKLIST_MAX_DATES_PER_TYPE} more days`);
    }
  }
  return lines.join('\n');
}

/** "Copy checklist" button on a problem card — flips to Copied for ~1.5s. */
function CopyChecklistButton({
  brand,
  fileTypes,
}: {
  brand: BrandFreshness;
  fileTypes: FreshnessResponse['fileTypes'];
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const resetTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  const handleCopy = async () => {
    const text = buildChecklist(brand, fileTypes, utcYesterdayStr());
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopyState('idle'), 1500);
  };

  return (
    <div className="mt-2 flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="h-6 px-2 text-[11px] gap-1.5"
      >
        {copyState === 'copied'
          ? <Check className="text-[var(--pulse-pos)]" />
          : <Copy />}
        {copyState === 'copied' ? 'Copied' : 'Copy checklist'}
      </Button>
      {copyState === 'failed' && (
        <span className="text-[11px] text-[var(--pulse-neg)]">Couldn&apos;t copy</span>
      )}
    </div>
  );
}

export function FreshnessPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<FreshnessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // res.ok before the body: a 500 whose body isn't the expected shape would
  // otherwise render as "no brands behind" — the panel's whole job inverted.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch('/api/upload/freshness', { cache: 'no-store' });
        const text = await res.text();
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          throw new Error(`HTTP ${res.status}`);
        }
        if (!res.ok) {
          throw new Error((body as { error?: string })?.error || `HTTP ${res.status}`);
        }
        const payload = body as FreshnessResponse;
        if (!Array.isArray(payload?.brands) || !Array.isArray(payload?.fileTypes)) {
          throw new Error('unexpected response shape');
        }
        if (!cancelled) setData(payload);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load freshness');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (loading && !data) {
    return (
      <div className="rounded-2xl bg-card border border-border shadow-sm p-6 flex items-center gap-3 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" /> Loading data freshness...
      </div>
    );
  }

  // A failed refetch keeps the last good rail rather than blanking it, but says
  // so — an empty "Gaps to fill" that's really a fetch failure reads as
  // "everything is current", which is the one lie this panel must never tell.
  if (error && !data) {
    return (
      <div className="rounded-2xl border border-[var(--pulse-neg)]/25 bg-[var(--pulse-neg-bg)] px-4 py-3 text-sm text-[var(--pulse-neg)]">
        Couldn&apos;t load freshness: {error}. No brand is being reported as current.
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
        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-[var(--pulse-neg)]/25 bg-[var(--pulse-neg-bg)] px-3 py-2 text-[11px] leading-relaxed text-[var(--pulse-neg)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Refresh failed ({error}) — showing the last good read, which may be stale.</span>
          </div>
        )}

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

              <CopyChecklistButton brand={b} fileTypes={data.fileTypes} />
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
