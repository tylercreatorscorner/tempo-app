'use client';

/**
 * Shared invoice-telemetry bits for the board and the list: the relative-time
 * formatter, the "viewed 2h ago / not viewed yet" span, the "nudged" span,
 * and the one-click NudgeButton (POST /api/invoices/[id]/nudge).
 *
 * Viewed is only meaningful once the invoice has actually been sent — before
 * sent_at exists the link may not even have been minted, so callers omit the
 * viewed span entirely for unsent invoices rather than showing a misleading
 * "not viewed yet".
 */

import { useEffect, useRef, useState } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Invoice } from './invoice-detail-sheet';

export function relativeTimeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const ms = Date.now() - t;
  if (ms < 0) return 'just now';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

/** "viewed 2h ago" (pos) or "not viewed yet" (dim). Only render once sent. */
export function ViewedSpan({ invoice }: { invoice: Invoice }) {
  if (invoice.viewed_at) {
    return <span className="font-semibold text-[var(--pulse-pos)]">viewed {relativeTimeAgo(invoice.viewed_at)}</span>;
  }
  return <span className="text-muted-foreground/70">not viewed yet</span>;
}

/** "nudged 3d ago" (+ " · x2" once it repeats). Null when never nudged. */
export function NudgedSpan({ invoice }: { invoice: Invoice }) {
  const count = Number(invoice.nudge_count ?? 0);
  if (count < 1 || !invoice.last_nudged_at) return null;
  return (
    <span className="text-[var(--pulse-warn)]">
      nudged {relativeTimeAgo(invoice.last_nudged_at)}{count > 1 ? ` · x${count}` : ''}
    </span>
  );
}

type NudgeState = 'idle' | 'busy' | 'emailed' | 'copied' | 'error';

/**
 * One-click nudge. On success the server has ALWAYS stamped the nudge log;
 * when it couldn't email (unconfigured / no recipient) it still returns the
 * share URL, which we drop on the clipboard so the operator pastes it into
 * whatever channel works. Calls onDone() after a successful nudge so the
 * parent refetches and the card meta updates.
 */
export function NudgeButton({
  invoice,
  onDone,
  className,
}: {
  invoice: Invoice;
  onDone: () => void;
  className?: string;
}) {
  const [state, setState] = useState<NudgeState>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (resetTimer.current) clearTimeout(resetTimer.current); }, []);

  const settle = (next: NudgeState) => {
    setState(next);
    resetTimer.current = setTimeout(() => setState('idle'), 2500);
  };

  async function handleNudge(e: React.MouseEvent) {
    // Cards and rows open the detail sheet on click — a nudge must not.
    e.stopPropagation();
    if (state === 'busy') return;
    setState('busy');
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/nudge`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      if (j.emailed) {
        settle('emailed');
      } else {
        // Copy-based nudge: the log is stamped, the link is the payload.
        if (j.url) await navigator.clipboard.writeText(j.url).catch(() => {});
        settle('copied');
      }
      onDone();
    } catch {
      settle('error');
    }
  }

  const count = Number(invoice.nudge_count ?? 0);
  const label =
    state === 'busy' ? 'Nudging' :
    state === 'emailed' ? 'Reminder sent' :
    state === 'copied' ? 'Link copied' :
    state === 'error' ? 'Nudge failed' :
    count > 0 ? 'Nudge again' : 'Nudge';

  return (
    <button
      type="button"
      onClick={handleNudge}
      disabled={state === 'busy'}
      title="Send a payment reminder (emails the invoice link, or copies it if email isn't set up)"
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition-colors',
        'hover:border-[var(--pulse-warn)]/50 hover:text-[var(--pulse-warn)]',
        'disabled:cursor-not-allowed disabled:opacity-60',
        state === 'emailed' || state === 'copied' ? 'border-[var(--pulse-pos)]/40 text-[var(--pulse-pos)]' : '',
        state === 'error' ? 'border-[var(--pulse-neg)]/40 text-[var(--pulse-neg)]' : '',
        className,
      )}
    >
      {state === 'busy'
        ? <Loader2 className="h-3 w-3 animate-spin" />
        : <BellRing className="h-3 w-3" />}
      {label}
    </button>
  );
}
