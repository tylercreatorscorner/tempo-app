'use client';

/** Saved client reports, searched and paginated within the caller's scope. */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, Ban, Check, Clipboard, ExternalLink, Loader2, RotateCw, Send,
} from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { SearchInput } from '@/components/ui/search-input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableCard, Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { TableSkeleton } from '@/components/ui/page-skeletons';
import { EmptyState } from '@/components/ui/empty-state';
import { BrandIdentity } from '@/components/creators/brand-identity';

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
  refreshedAt: string | null;
  isRevision?: boolean;
  previousReportId?: string | null;
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

const HEADERS = ['Report', 'Created', 'Status'] as const;

export function SentFeed({ refreshKey }: { refreshKey: number }) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  useEffect(() => { const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 250); return () => clearTimeout(timer); }, [query]);
  const [reports, setReports] = useState<ClientReportRow[] | null>(null);
  const [reportsError, setReportsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [nonce, setNonce] = useState(0);

  const [actionError, setActionError] = useState<string | null>(null);
  const [revisionLink, setRevisionLink] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<ClientReportRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  const brandMeta = useBrandMeta();
  const showBar = useDelayedFlag(refetching);

  const load = useCallback(async (isCancelled: () => boolean) => {
    try {
      const res = await fetch(`/api/client-reports?page=${page}&q=${encodeURIComponent(search)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { reports?: ClientReportRow[]; total?: number };
      if (isCancelled()) return;
      setReports(data.reports ?? []);
      setTotal(data.total ?? 0);
      setReportsError(false);
    } catch {
      if (!isCancelled()) setReportsError(true);
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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

  /** Create a separate snapshot and link; the original remains unchanged. */
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const handleRefresh = async (r: ClientReportRow) => {
    setRefreshingId(r.id);
    setActionError(null);
    setRevisionLink(null);
    try {
      const res = await fetch(`/api/client-reports/${r.id}/refresh`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (typeof data.token === 'string' && data.token) setRevisionLink(`/r/${encodeURIComponent(data.token)}`);
      // load() takes a cancellation predicate; this call is not racing a
      // component unmount the way the mount effect is, so it never cancels.
      await load(() => false);
    } catch (err) {
      setActionError(`Couldn't create a report revision: ${err instanceof Error ? err.message : 'request failed'}`);
    } finally {
      setRefreshingId(null);
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

  const items: FeedItem[] = (reports ?? []).map(r => ({ kind: 'client', ...r }));

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-bold tracking-tight text-foreground">Report library</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Find a saved report by brand or reporting period.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput aria-label="Search report library" placeholder="Search brand or period" onClear={() => setQuery('')} value={query} onChange={e => setQuery(e.target.value)} />

      </div>
      {revisionLink && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          <span>New revision created. The previous link is unchanged.</span>
          <a href={`${revisionLink}?preview=1`} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline-offset-4 hover:underline">Open new revision →</a>
        </div>
      )}

      {actionError && (
        <div className="flex items-start gap-2 rounded-lg bg-[var(--pulse-neg-bg)] px-3 py-2 text-xs text-[var(--pulse-neg)]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={6} cols={6} title={false} />
      ) : reportsError ? (
        <EmptyState
          icon={<AlertCircle className="h-8 w-8 text-[var(--pulse-neg)]" />}
          title="Couldn't load reports"
          description="Please retry this search or page. Saved reports have not changed."
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
          title={query ? "No matching reports" : "No saved reports yet"}
          description={query ? "Try another brand or reporting period." : "Reports appear here after you create a share link."}
        />
      ) : (
        <TableCard className="relative">
          <TableLoadBar active={showBar} />
          <div className={showBar ? 'opacity-60 transition-opacity duration-200' : ''}>
            <div className="overflow-x-auto">
              <Table className="block text-sm sm:table">
                <THead className="hidden sm:table-header-group">
                  <TR>
                    {HEADERS.map(h => <TH key={h} className="text-left">{h}</TH>)}
                    <TH aria-label="Actions" />
                  </TR>
                </THead>
                <TBody className="block sm:table-row-group">
                  {items.map(item => (
                    <FeedRow
                      key={`${item.kind}-${item.id}`}
                      item={item}
                      brandLabel={feedBrandLabel(item, brandMeta.label)}
                      copied={copiedId === item.id}
                      onCopyLink={copyLink}
                      onRevoke={setConfirmRevoke}
                      onRefresh={handleRefresh}
                      refreshing={refreshingId === item.id}
                      previousUrl={item.kind === 'client' ? reports?.find(r => r.id === item.previousReportId)?.url : undefined}
                    />
                  ))}
                </TBody>
              </Table>
            </div>
          </div>
        </TableCard>
      )}

      {!loading && !reportsError && total > 0 && <nav aria-label="Report pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <span className="text-xs text-muted-foreground" role="status">{(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total} reports</span>
        <div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button><span className="text-xs tabular-nums">Page {page}</span><Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>Next</Button></div>
      </nav>}
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
  item, brandLabel, copied, onCopyLink, onRevoke, onRefresh, refreshing, previousUrl,
}: {
  item: FeedItem;
  brandLabel: string;
  copied: boolean;
  onCopyLink: (r: ClientReportRow) => void;
  onRevoke: (r: ClientReportRow) => void;
  onRefresh: (r: ClientReportRow) => void;
  refreshing: boolean;
  previousUrl?: string;
}) {
  return (
    <TR className="grid grid-cols-2 border-b border-border hover:bg-muted/60 sm:table-row sm:border-0">
      <TD className="col-span-2 border-0 text-left sm:border-b">
        <BrandIdentity brand={item.brandSlug} label={brandLabel} />
        <p className="mt-1 text-xs text-muted-foreground">{item.periodLabel}{item.kind === 'client' && item.isRevision ? ' · Revised' : ''}</p>
        {item.kind === 'post' && <ReportChip item={item} />}
        {previousUrl && <a href={`${previousUrl}?preview=1`} target="_blank" rel="noopener noreferrer" className="mt-1 block text-xs text-muted-foreground hover:underline">Previous report ↗</a>}
      </TD>
      <TD className="border-0 text-left text-xs sm:border-b" title={new Date(item.createdAt).toLocaleString()}>
        {relativeTimeAgo(item.createdAt)}
      </TD>
      <TD className="border-0 text-left sm:border-b">
        <StatusBadge item={item} />
      </TD>
      <TD className="col-span-2 border-0 py-2 sm:border-b">
        {item.kind === 'client' && (
          <div className="flex items-center justify-start gap-1 sm:justify-end">
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
            {!item.revokedAt && <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild><button type="button" aria-label={`More actions for ${brandLabel}, ${item.periodLabel}`} className="rounded-md p-2 text-muted-foreground hover:bg-muted"><MoreHorizontal size={16} /></button></DropdownMenu.Trigger>
              <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-44 rounded-lg border border-border bg-card p-1 shadow-lg">
                <DropdownMenu.Item disabled={refreshing} onSelect={() => onRefresh(item)} className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-xs outline-none data-[highlighted]:bg-muted data-[disabled]:opacity-50"><RotateCw size={14} />{refreshing ? 'Creating revision…' : 'Create revision'}</DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => onRevoke(item)} className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-xs text-[var(--pulse-neg)] outline-none data-[highlighted]:bg-muted"><Ban size={14} />Revoke link</DropdownMenu.Item>
              </DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root>}
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
        {item.isRevision ? 'Revised report' : 'Report link'}
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
