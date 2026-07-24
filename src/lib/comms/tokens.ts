/**
 * Broadcast body personalization.
 *
 * `resolveTokens` renders a template body against one resolved audience row.
 * Personalized bodies are FROZEN into broadcast_recipients.resolved_body at
 * enqueue — the send path never re-personalizes, so what the preview showed is
 * exactly what gets delivered even if the creator's stats move later.
 *
 * Unknown tokens pass through unchanged (a template typo shows itself rather
 * than silently vanishing).
 *
 * Pure module: the caller hydrates the brand registry ONCE per request
 * (getBrandRegistry) and passes it in — house rule for loops over many rows.
 */
import { brandLabel, type BrandRegistry } from '@/lib/data/brand-registry-core';
import type { AudienceRow } from './audience';

const TOKEN_RE = /\{([a-zA-Z0-9_]+)\}/g;

/** Whole-dollar, comma-formatted: 12345.67 → "$12,346". */
function dollars(v: number): string {
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

/** Integer days since a yyyy-MM-dd date (UTC midnight), clamped at 0. */
function daysSince(date: string): number {
  const ms = Date.now() - new Date(`${date}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function resolveTokens(body: string, row: AudienceRow, reg: BrandRegistry): string {
  return body.replace(TOKEN_RE, (match, name: string) => {
    switch (name.toLowerCase()) {
      case 'first_name': {
        const first = (row.displayName ?? '').trim().split(/\s+/)[0];
        return first || row.handle || match;
      }
      case 'handle':
        return row.handle ? `@${row.handle.replace(/^@/, '')}` : match;
      case 'brand':
        return row.brand ? brandLabel(reg, row.brand) : match;
      case 'gmv_7d':
        return dollars(row.gmv7d);
      case 'gmv_30d':
        return dollars(row.gmv30d);
      case 'rank':
        return `#${row.rank}`;
      case 'last_post_days': {
        // 'today' when 0; 'never' when we have no post on record (an honest
        // fallback beats a raw "{last_post_days}" landing in a creator's DMs).
        if (!row.lastPostDate) return 'never';
        const d = daysSince(row.lastPostDate);
        return d === 0 ? 'today' : String(d);
      }
      default:
        return match; // unknown token → pass through unchanged
    }
  });
}
