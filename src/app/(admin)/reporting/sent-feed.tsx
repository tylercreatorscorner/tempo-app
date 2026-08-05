'use client';

/**
 * Sent feed for the Outbox: a merged, newest-first list of everything that
 * went out — client report links (GET /api/client-reports) and manually
 * copied creator posts (GET /api/report-log) — fetched in parallel.
 *
 * res.ok on both sources. If both fail with nothing loaded, that's an error
 * card (never the empty state); if one fails, we render what loaded plus an
 * inline warning naming the missing half. `refreshKey` from the parent bumps
 * a refetch after the Create panel sends something.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, Ban, Check, Clipboard, ExternalLink, Loader2, RotateCw, Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableCard, Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { TableSkeleton } from '@/components/ui/page-skeletons';
import { EmptyState } from '@/components/ui/empty-state';

// ── API row shapes (contract with /api/client-reports + /api/report-log) ──
interface ClientReportRow {
  id: string;
  token: string;
  url: string;
  brandSlug: string;
  brandName: string;
  periodLabel: string;
  createdAt: string;
  createdBy: string | null;
  viewedAt: string | null;
  revokedAt: string | null;
}

interface ReportLogRow {
  id: string;
  reportType: string;
  format: string | null;
  brandSlug: string;
  periodLabel: string;
  destination: string;
  createdAt: string;
  createdBy: string | null;
}

type FeedItem =
  | ({ kind: 'client' } & ClientReportRow)
  | ({ kind: 'post' } & ReportLogRow);

const POST_TYPE_LABELS: Record<string, string> = {
  'daily-drop':    'Daily Drop',
  'whats-cooking': "What's Cooking",
  'whos-cooking':  "Who's Cooking",
  'weekly-kpi':    'Weekly KPI',
};

const DESTINATION_LABELS: Record<string, string> = {
  discord: 'Discord',
  slack:   'Slack',
};

function relativeTimeAgo(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const ms = Date.now() - t;
  if (ms < 0) return 'Just now';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function createdAtMs(item: FeedItem): number {
  const t = new Date(item.createdAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

const HEADERS = ['Report', 'Brand', 'Period', 'Sent', 'Status'] as const;

export function SentFeed({ refreshKey }: { refreshKey: number }) {
  // Last-good rows per source (null = never loaded), so a failed refetch
  // degrades to a warning over stale rows instead of wiping the list.
  const [reports, setReports] = useState<ClientReportRow[] | null>(null);
  const [logs, setLogs] = useState<ReportLogRow[] | null>(null);
  const [reportsError, setReportsError] = useState(false);
  const [logsError, setLogsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [nonce, setNonce] = useState(0);

  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<ClientReportRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  const brandMeta = useBrandMeta();
  const showBar = useDelayedFlag(refetching);

  const load = useCallback(async (isCancelled: () => boolean) => {
    const [r1, r2] = await Promise.allSettled([
      fetch('/api/client-reports').then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { reports?: ClientReportRow[] };
      }),
      fetch('/api/report-log').then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { entries?: ReportLogRow[] };
      }),
    ]);
    if (isCancelled()) return;
    if (r1.status === 'fulfilled') { setReports(r1.value.reports ?? []); setReportsError(false); }
    else setReportsError(true);
    if (r2.status === 'fulfilled') { setLogs(r2.value.entries ?? []); setLogsError(false); }
    else setLogsError(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRefetching(true);
    load(() => cancelled).finally(() => { if (!cancelled) setRefetching(false); });
    return () => { cancelled = true; };
  }, [load, refreshKey, nonce]);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const reload = () => setNonce(n => n + 1);

  const copyLink = async (r: ClientReportRow) => {
    try {
      await navigator.clipboard.writeText(r.url);
      setActionError(null);
      setCopiedId(r.id);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setActionError('Copy failed: clipboard access blocked. Use Open and copy the address instead.');
    }
  };

  const handleRevokeConfirmed = async () => {
    if (!confirmRevoke) return;
    setRevoking(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/client-reports/${confirmRevoke.id}/revoke`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      setActionError(`Couldn't revoke that link: ${err instanceof Error ? err.message : 'request failed'}`);
    } finally {
      setRevoking(false);
      setConfirmRevoke(null);
      reload();
    }
  };

  const neverLoaded = reports === null && logs === null;
  const bothFailed = reportsError && logsError;
  const partialError = !bothFailed && (reportsError || logsError);

  const items: FeedItem[] = [
    ...(reports ?? []).map<FeedItem>(r => ({ kind: 'client', ...r })),
    ...(logs ?? []).map<FeedItem>(e => ({ kind: 'post', ...e })),
  ].sort((a, b) => createdAtMs(b) - createdAtMs(a));

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-bold tracking-tight text-foreground">Recent activity</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The audit trail. Creator posts now live in Creators &rsaquo; Drops.
        </p>
      </div>

      {actionError && (
        <div className="flex items-start gap-2 rounded-lg bg-[var(--pulse-neg-bg)] px-3 py-2 text-xs text-[var(--pulse-neg)]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* One source failed (or a refetch failed): keep what we have, say what's missing. */}
      {!loading && (partialError || (bothFailed && !neverLoaded)) && (
        <div className="flex items-start gap-2 rounded-lg bg-[var(--pulse-warn-bg)] px-3 py-2 text-xs text-[var(--pulse-warn)]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {bothFailed
              ? "Couldn't refresh the outbox. Showing the last loaded state."
              : reportsError
                ? "Couldn't load client report links. Showing creator posts only."
                : "Couldn't load creator post history. Showing client links only."}
          </span>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={6} cols={6} title={false} />
      ) : bothFailed && neverLoaded ? (
        <EmptyState
          icon={<AlertCircle className="h-8 w-8 text-[var(--pulse-neg)]" />}
          title="Couldn't load the outbox"
          description="The sent list didn't load. This is a fetch error, not an empty outbox."
          action={
            <Button variant="outline" size="sm" onClick={() => { setLoading(true); reload(); }}>
              <RotateCw />
              Try again
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Send className="h-8 w-8" />}
          title="Nothing sent yet"
          description="Create a client report link or copy a creator post from the Create panel and it will show up here."
        />
      ) : (
        <TableCard className="relative">
          <TableLoadBar active={showBar} />
          <div className={showBar ? 'opacity-60 transition-opacity duration-200' : ''}>
            <div className="overflow-x-auto">
              <Table className="text-sm">
                <THead>
                  <TR>
                    {HEADERS.map(h => <TH key={h} className="text-left">{h}</TH>)}
                    <TH aria-label="Actions" />
                  </TR>
                </THead>
                <TBody>
                  {items.map(item => (
                    <FeedRow
                      key={`${item.kind}-${item.id}`}
                      item={item}
                      brandLabel={feedBrandLabel(item, brandMeta.label)}
                      brandColor={brandMeta.color(item.brandSlug)}
                      copied={copiedId === item.id}
                      onCopyLink={copyLink}
                      onRevoke={setConfirmRevoke}
                    />
                  ))}
                </TBody>
              </Table>
            </div>
          </div>
        </TableCard>
      )}

      {confirmRevoke && (
        <ConfirmRevokeModal
          report={confirmRevoke}
          revoking={revoking}
          onCancel={() => { if (!revoking) setConfirmRevoke(null); }}
          onConfirm={handleRevokeConfirmed}
        />
      )}
    </section>
  );
}

/** Prefer the registry label; fall back to the API's brandName for client rows
 *  whose slug the registry doesn't know (label() echoes the slug in that case). */
function feedBrandLabel(item: FeedItem, label: (slug: string) => string): string {
  const fromMeta = label(item.brandSlug);
  if (item.kind === 'client' && fromMeta === item.brandSlug && item.brandName) return item.brandName;
  return fromMeta;
}

// ── Row ─────────────────────────────────────────────────────────────
function FeedRow({
  item, brandLabel, brandColor, copied, onCopyLink, onRevoke,
}: {
  item: FeedItem;
  brandLabel: string;
  brandColor: string;
  copied: boolean;
  onCopyLink: (r: ClientReportRow) => void;
  onRevoke: (r: ClientReportRow) => void;
}) {
  return (
    <TR className="hover:bg-muted/60">
      <TD className="text-left">
        <ReportChip item={item} />
      </TD>
      <TD className="text-left">
        <span className="inline-flex items-center gap-2 text-foreground">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-[3px]" style={{ backgroundColor: brandColor }} />
          {brandLabel}
        </span>
      </TD>
      <TD className="text-left text-xs">{item.periodLabel}</TD>
      <TD className="text-left text-xs" title={new Date(item.createdAt).toLocaleString()}>
        {relativeTimeAgo(item.createdAt)}
      </TD>
      <TD className="text-left">
        <StatusBadge item={item} />
      </TD>
      <TD className="py-2">
        {item.kind === 'client' && (
          <div className="flex items-center justify-end gap-1">
            <a
              href={`${item.url}?preview=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </a>
            <button
              type="button"
              onClick={() => onCopyLink(item)}
              className={cn(
                'flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors',
                copied
                  ? 'text-[var(--pulse-pos)]'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            {!item.revokedAt && (
              <button
                type="button"
                onClick={() => onRevoke(item)}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-[var(--pulse-neg-bg)] hover:text-[var(--pulse-neg)]"
              >
                <Ban className="h-3.5 w-3.5" />
                Revoke
              </button>
            )}
          </div>
        )}
      </TD>
    </TR>
  );
}

function ReportChip({ item }: { item: FeedItem }) {
  if (item.kind === 'client') {
    return (
      <Badge variant="accent" size="sm" className="uppercase tracking-[0.06em]">
        Client link
      </Badge>
    );
  }
  const base = POST_TYPE_LABELS[item.reportType] ?? item.reportType;
  // "Who's Cooking · Classic" when the classic board format was used;
  // highlights is the default and stays unlabeled.
  const label = item.reportType === 'whos-cooking' && item.format === 'classic'
    ? `${base} · Classic`
    : base;
  return (
    <Badge variant="warning" size="sm" className="uppercase tracking-[0.06em]">
      {label}
    </Badge>
  );
}

function StatusBadge({ item }: { item: FeedItem }) {
  if (item.kind === 'client') {
    if (item.revokedAt) return <Badge variant="negative" size="sm">Revoked</Badge>;
    if (item.viewedAt) return <Badge variant="positive" size="sm">Viewed {relativeTimeAgo(item.viewedAt)}</Badge>;
    return <Badge variant="neutral" size="sm">Not viewed yet</Badge>;
  }
  if (item.destination === 'manual') return <Badge variant="neutral" size="sm">Copied</Badge>;
  return (
    <Badge variant="positive" size="sm">
      Posted to {DESTINATION_LABELS[item.destination] ?? item.destination}
    </Badge>
  );
}

// ── Revoke confirm — ModalOverlay-based (no native confirm() popups) ─
function ConfirmRevokeModal({
  report, revoking, onCancel, onConfirm,
}: { report: ClientReportRow; revoking: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <ModalOverlay onClose={onCancel}>
      <div className="absolute inset-0 flex items-center justify-center p-4" onClick={onCancel}>
        <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
        <div
          className="relative w-full max-w-sm space-y-4 rounded-xl bg-card p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-base font-bold text-foreground">Revoke link</h3>
          <p className="text-sm text-muted-foreground">
            This disables the shared report link for{' '}
            <strong className="text-foreground">{report.brandName || report.brandSlug}</strong>{' '}
            ({report.periodLabel}). Anyone who opens it will see it&apos;s no longer available.
            This can&apos;t be undone.
          </p>
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={onCancel} disabled={revoking}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" onClick={onConfirm} disabled={revoking}>
              {revoking && <Loader2 className="animate-spin" />}
              Revoke
            </Button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
