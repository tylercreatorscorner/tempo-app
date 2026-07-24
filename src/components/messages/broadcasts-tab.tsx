'use client';

/**
 * Broadcasts tab — the hub's default surface. LEFT: the Sent feed (every
 * broadcast, newest first, with per-creator delivery counts + a progress bar);
 * RIGHT: the New broadcast compose panel (./compose-panel), same side-by-side
 * pattern as the Reporting outbox.
 *
 * Honesty rules: res.ok on every fetch; a cold-load failure is an error card
 * with retry (never the empty state); a warm refetch failure keeps last-good
 * rows under a warning banner. An active broadcast (queued/sending) live-polls
 * the feed every 5s, visibility-gated.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, Radio, RotateCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { TableLoadBar } from '@/components/ui/table-load-bar';
import { TableSkeleton } from '@/components/ui/page-skeletons';
import { ComposePanel } from './compose-panel';
import { ChannelChip, InlineError, relativeTimeAgo } from './comms-bits';

// ── API shapes (contract with GET /api/broadcasts) ──────────────────
interface BroadcastCounts {
  pending: number;
  sent: number;
  delivered: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
}

interface BroadcastRow {
  id: string;
  audienceLabel: string;
  channel: string;
  status: string;
  createdAt: string;
  createdBy: string | null;
  counts: BroadcastCounts;
}

interface RecipientRow {
  handle: string;
  displayName: string;
  status: string;
  skipReason: string | null;
  error: string | null;
  sentAt: string | null;
}

const ACTIVE_STATUSES = new Set(['queued', 'sending']);
const isActive = (b: BroadcastRow) => ACTIVE_STATUSES.has(b.status);

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'queued':
      return <Badge variant="neutral" size="sm">Queued</Badge>;
    case 'sending':
      return <Badge variant="accent" size="sm" dot>Sending</Badge>;
    case 'cancelled':
      return <Badge variant="neutral" size="sm">Cancelled</Badge>;
    case 'failed':
      return <Badge variant="negative" size="sm">Failed</Badge>;
    default:
      return null; // completed broadcasts speak through their delivery counts
  }
}

export function BroadcastsTab({
  visible,
  templateToLoad,
  onTemplateConsumed,
}: {
  /** Tab visibility — pauses the live poll while another tab is up. */
  visible: boolean;
  templateToLoad?: string | null;
  onTemplateConsumed?: () => void;
}) {
  // Last-good rows (null = never loaded) so a failed refetch degrades to a
  // warning over stale rows instead of a fake-empty feed.
  const [rows, setRows] = useState<BroadcastRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refetching, setRefetching] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [logId, setLogId] = useState<string | null>(null);

  const showBar = useDelayedFlag(refetching);

  const load = useCallback(async () => {
    setRefetching(true);
    try {
      const res = await fetch('/api/broadcasts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRows((data.broadcasts ?? []) as BroadcastRow[]);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setRefetching(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live-poll while any broadcast is queued/sending: every 5s, only while this
  // tab is shown and the document is visible; an immediate tick on re-focus.
  const hasActive = (rows ?? []).some(isActive);
  useEffect(() => {
    if (!visible || !hasActive) return;
    const tick = () => { if (!document.hidden) load(); };
    const interval = setInterval(tick, 5000);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [visible, hasActive, load]);

  const cancel = async (id: string) => {
    setCancellingId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/broadcasts/${id}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
    } catch (err) {
      setActionError(`Couldn't cancel that broadcast: ${err instanceof Error ? err.message : 'request failed'}`);
    } finally {
      setCancellingId(null);
      load();
    }
  };

  const neverLoaded = rows === null;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)] xl:items-start">
      {/* ── Sent feed ── */}
      <section className="space-y-3">
        {actionError && (
          <div className="flex items-start gap-2 rounded-lg bg-[var(--pulse-neg-bg)] px-3 py-2 text-xs text-[var(--pulse-neg)]">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}
        {loadError && !neverLoaded && (
          <div className="flex items-start gap-2 rounded-lg bg-[var(--pulse-warn-bg)] px-3 py-2 text-xs text-[var(--pulse-warn)]">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Couldn&apos;t refresh broadcasts. Showing the last loaded state.</span>
          </div>
        )}

        {neverLoaded && !loadError ? (
          <TableSkeleton rows={4} cols={4} title={false} />
        ) : neverLoaded && loadError ? (
          <EmptyState
            icon={<AlertCircle className="h-8 w-8 text-[var(--pulse-neg)]" />}
            title="Couldn't load broadcasts"
            description="The broadcast feed didn't load. This is a fetch error, not an empty feed."
            action={
              <Button variant="outline" size="sm" onClick={load}>
                <RotateCw />
                Try again
              </Button>
            }
          />
        ) : rows!.length === 0 ? (
          <EmptyState
            icon={<Radio className="h-8 w-8" />}
            title="No broadcasts yet"
            description="Send your first broadcast from the panel on the right. Every send is consent-checked, rate-limited, and logged per creator."
          />
        ) : (
          <Card className="relative overflow-hidden">
            <TableLoadBar active={showBar} />
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-[13px] font-extrabold text-foreground">Sent</h2>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                Every broadcast, newest first, with per-creator delivery.
              </p>
            </div>
            <div className={cn(showBar && 'opacity-60 transition-opacity duration-200')}>
              {rows!.map((b) => (
                <FeedRow
                  key={b.id}
                  b={b}
                  cancelling={cancellingId === b.id}
                  onLog={() => setLogId(b.id)}
                  onCancel={() => cancel(b.id)}
                />
              ))}
            </div>
          </Card>
        )}
      </section>

      {/* ── Compose ── */}
      <ComposePanel
        onSent={load}
        onViewLog={setLogId}
        templateToLoad={templateToLoad}
        onTemplateConsumed={onTemplateConsumed}
      />

      {logId && (
        <BroadcastLogDrawer broadcastId={logId} onClose={() => setLogId(null)} />
      )}
    </div>
  );
}

// ── Feed row (mockup .feed-row) ─────────────────────────────────────
function FeedRow({
  b, cancelling, onLog, onCancel,
}: {
  b: BroadcastRow;
  cancelling: boolean;
  onLog: () => void;
  onCancel: () => void;
}) {
  const c = b.counts;
  const settled = c.delivered + c.failed + c.blocked + c.skipped;
  const pct = c.total > 0 ? Math.min(100, Math.round((settled / c.total) * 100)) : 0;
  const active = isActive(b);

  return (
    <div className="grid items-center gap-x-4 gap-y-2 border-b border-border px-5 py-3.5 last:border-b-0 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.1fr)_auto]">
      {/* Audience + channel + time */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[13px] font-bold text-foreground">{b.audienceLabel}</span>
          <StatusBadge status={b.status} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <ChannelChip channel={b.channel} />
          <span className="tabular-nums">{c.total} creator{c.total === 1 ? '' : 's'}</span>
          <span>·</span>
          <span title={new Date(b.createdAt).toLocaleString()}>{relativeTimeAgo(b.createdAt)}</span>
        </div>
      </div>

      {/* Delivery counts + progress */}
      <div className="min-w-0">
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {c.delivered > 0 && (
            <span className="text-[var(--pulse-pos)]"><b className="tabular-nums">{c.delivered}</b> delivered</span>
          )}
          {c.blocked > 0 && (
            <span className="text-[var(--pulse-warn)]"><b className="tabular-nums">{c.blocked}</b> blocked</span>
          )}
          {c.failed > 0 && (
            <span className="text-[var(--pulse-neg)]"><b className="tabular-nums">{c.failed}</b> failed</span>
          )}
          {c.skipped > 0 && (
            <span><b className="tabular-nums">{c.skipped}</b> skipped</span>
          )}
          {active && (
            <span><b className="tabular-nums">{c.pending + c.sent}</b> pending</span>
          )}
          {!active && settled === 0 && <span>no deliveries recorded</span>}
        </div>
        <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-pulse-grad transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={onLog}
          className="rounded-lg px-2 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
        >
          Log
        </button>
        {active && (
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-[var(--pulse-neg-bg)] hover:text-[var(--pulse-neg)] disabled:opacity-50"
          >
            {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ── Per-recipient delivery log (right-side drawer) ──────────────────
function recipientBadge(r: RecipientRow) {
  switch (r.status) {
    case 'delivered':
      return <Badge variant="positive" size="sm">Delivered</Badge>;
    case 'sent':
      return <Badge variant="accent" size="sm">Sent</Badge>;
    case 'failed':
      return <Badge variant="negative" size="sm">Failed</Badge>;
    case 'blocked':
      return <Badge variant="warning" size="sm">Blocked</Badge>;
    case 'skipped':
      return <Badge variant="neutral" size="sm">Skipped</Badge>;
    case 'pending':
      return <Badge variant="neutral" size="sm" dot>Pending</Badge>;
    default:
      return <Badge variant="neutral" size="sm">{r.status}</Badge>;
  }
}

function BroadcastLogDrawer({ broadcastId, onClose }: { broadcastId: string; onClose: () => void }) {
  const [broadcast, setBroadcast] = useState<BroadcastRow | null>(null);
  const [recipients, setRecipients] = useState<RecipientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/broadcasts/${broadcastId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setBroadcast((data.broadcast ?? null) as BroadcastRow | null);
      setRecipients((data.recipients ?? []) as RecipientRow[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the delivery log');
    }
  }, [broadcastId]);

  useEffect(() => { load(); }, [load]);

  // While the broadcast is still draining, refresh the log every 5s
  // (visibility-gated) so delivery rows tick over live.
  const active = broadcast ? isActive(broadcast) : false;
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => { if (!document.hidden) load(); }, 5000);
    return () => clearInterval(interval);
  }, [active, load]);

  const c = broadcast?.counts;

  return (
    <ModalOverlay onClose={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div
        className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-bold text-foreground">
                {broadcast ? broadcast.audienceLabel : 'Delivery log'}
              </h2>
              {broadcast && <StatusBadge status={broadcast.status} />}
              {broadcast && <ChannelChip channel={broadcast.channel} />}
            </div>
            {broadcast && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {relativeTimeAgo(broadcast.createdAt)}
                {broadcast.createdBy ? ` · by ${broadcast.createdBy}` : ''}
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close log">
            <X />
          </Button>
        </div>

        {/* Summary counts */}
        {c && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border px-5 py-3 text-xs text-muted-foreground">
            <span className="text-[var(--pulse-pos)]"><b className="tabular-nums">{c.delivered}</b> delivered</span>
            <span className="text-[var(--pulse-warn)]"><b className="tabular-nums">{c.blocked}</b> blocked</span>
            <span className="text-[var(--pulse-neg)]"><b className="tabular-nums">{c.failed}</b> failed</span>
            <span><b className="tabular-nums">{c.skipped}</b> skipped</span>
            <span><b className="tabular-nums">{c.pending + c.sent}</b> pending</span>
            <span className="ml-auto"><b className="tabular-nums">{c.total}</b> total</span>
          </div>
        )}

        {/* Recipient table */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {error ? (
            <div className="space-y-3">
              <InlineError>{error}</InlineError>
              <Button variant="outline" size="sm" onClick={load}>
                <RotateCw />
                Try again
              </Button>
            </div>
          ) : recipients === null ? (
            <TableSkeleton rows={8} cols={4} title={false} />
          ) : recipients.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No recipients recorded for this broadcast.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <Table className="text-sm">
                <THead>
                  <TR>
                    <TH className="text-left">Creator</TH>
                    <TH className="text-left">Status</TH>
                    <TH className="text-left">Detail</TH>
                    <TH>Sent</TH>
                  </TR>
                </THead>
                <TBody>
                  {recipients.map((r, i) => (
                    <TR key={`${r.handle}-${i}`} className="hover:bg-muted/60">
                      <TD className="text-left">
                        <span className="font-medium text-foreground">{r.displayName || r.handle}</span>
                        {r.displayName && r.handle && (
                          <span className="ml-1.5 text-xs text-muted-foreground">@{r.handle.replace(/^@/, '')}</span>
                        )}
                      </TD>
                      <TD className="text-left">{recipientBadge(r)}</TD>
                      <TD className="text-left text-xs">{r.skipReason ?? r.error ?? '—'}</TD>
                      <TD className="text-xs" title={r.sentAt ? new Date(r.sentAt).toLocaleString() : undefined}>
                        {relativeTimeAgo(r.sentAt)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
