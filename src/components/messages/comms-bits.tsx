'use client';

/**
 * Small shared pieces for the Comms hub (Broadcasts / Inbox / Templates):
 * channel chips, token-highlighted message text, inline error line, and the
 * relative-time formatter the feed and drawer share. Kit tokens only — both
 * themes hold by construction.
 */

import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { splitByTokens } from './templates';

// ── Channel chip ────────────────────────────────────────────────────
const CHANNEL_META: Record<string, { label: string; short: string; variant: 'accent' | 'positive' | 'warning' | 'neutral' }> = {
  discord_dm: { label: 'Discord DM', short: 'DM', variant: 'accent' },
  dm: { label: 'Discord DM', short: 'DM', variant: 'accent' },
  channel: { label: 'Discord', short: 'Discord', variant: 'accent' },
  sms: { label: 'SMS', short: 'SMS', variant: 'positive' },
  email: { label: 'Email', short: 'Email', variant: 'warning' },
};

/** Uppercase channel tag ("DISCORD DM" / "EMAIL" / "SMS"). */
export function ChannelChip({ channel, short = false }: { channel: string; short?: boolean }) {
  const meta = CHANNEL_META[channel] ?? { label: channel, short: channel, variant: 'neutral' as const };
  return (
    <Badge variant={meta.variant} size="sm" className="uppercase tracking-[0.06em]">
      {short ? meta.short : meta.label}
    </Badge>
  );
}

export function channelLabel(channel: string): string {
  return (CHANNEL_META[channel] ?? { label: channel }).label;
}

// ── Token-highlighted message text ──────────────────────────────────
/** Renders a template body with {tokens} as highlighted chips (the compose
 *  preview and Templates tab both use this — no client-side substitution). */
export function TokenText({ body, className }: { body: string; className?: string }) {
  return (
    <span className={className}>
      {splitByTokens(body).map((p, i) =>
        p.type === 'token' ? (
          <span
            key={i}
            className="rounded bg-primary/10 px-1 text-[0.92em] font-bold text-primary"
          >
            {p.value}
          </span>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </span>
  );
}

// ── Inline error line (mirrors the Reporting create panel) ──────────
export function InlineError({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg bg-[var(--pulse-neg-bg)] px-3 py-2 text-xs text-[var(--pulse-neg)]">
      {children}
    </div>
  );
}

// ── Relative time ───────────────────────────────────────────────────
export function relativeTimeAgo(iso: string | null | undefined): string {
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

/** "~45s" / "~2m 10s" from a second count. */
export function formatEstDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const s = Math.round(seconds);
  if (s < 90) return `~${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `~${m}m ${rem}s` : `~${m}m`;
}
