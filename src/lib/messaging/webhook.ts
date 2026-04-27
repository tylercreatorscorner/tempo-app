/**
 * Discord/Slack incoming-webhook delivery. Both platforms accept a JSON POST
 * with a `content` (Discord) or `text` (Slack) field. We detect by URL prefix
 * since that's the simplest reliable signal.
 *
 * Discord webhooks: https://discord.com/api/webhooks/...
 * Slack webhooks:   https://hooks.slack.com/services/...
 *
 * Returns { ok, status, error } so the caller can record the outcome.
 */

export type WebhookKind = 'discord' | 'slack';

export function detectWebhookKind(url: string): WebhookKind | null {
  if (/^https:\/\/discord\.com\/api\/webhooks\//.test(url)) return 'discord';
  if (/^https:\/\/hooks\.slack\.com\/services\//.test(url)) return 'slack';
  return null;
}

export interface DeliveryResult {
  ok: boolean;
  status: number;
  error?: string;
}

const MAX_DISCORD_LEN = 2000; // Discord message hard limit
const MAX_SLACK_LEN   = 40_000;

/** Truncate text to fit the platform's per-message limit, with an ellipsis when chopped. */
function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  // Reserve space for the ellipsis line
  const cap = Math.max(limit - 32, 0);
  return text.slice(0, cap) + '\n…(truncated)';
}

export async function deliverToWebhook(url: string, content: string): Promise<DeliveryResult> {
  const kind = detectWebhookKind(url);
  if (!kind) {
    return { ok: false, status: 0, error: 'Unrecognized webhook URL (must be Discord or Slack)' };
  }

  const body =
    kind === 'discord'
      ? { content: truncate(content, MAX_DISCORD_LEN) }
      : { text:    truncate(content, MAX_SLACK_LEN) };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Tight timeout — webhooks should be near-instant
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: text.slice(0, 500) || res.statusText };
    }
    return { ok: true, status: res.status };
  } catch (err: unknown) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'Network error' };
  }
}
