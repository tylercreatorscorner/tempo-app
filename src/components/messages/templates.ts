/**
 * Starter broadcast templates (Phase A — hardcoded, read-only).
 *
 * Tokens use the {snake_case} form and resolve PER RECIPIENT at delivery time
 * on the server (same rollups the roster uses). The client never substitutes
 * real values — the compose preview renders tokens as highlighted chips.
 */

export interface BroadcastTemplate {
  key: string;
  name: string;
  description: string;
  body: string;
}

/** Personalization tokens the send layer resolves per creator. */
export const BROADCAST_TOKENS = [
  'first_name',
  'handle',
  'brand',
  'gmv_7d',
  'gmv_30d',
  'rank',
  'last_post_days',
] as const;

export const BROADCAST_TEMPLATES: BroadcastTemplate[] = [
  {
    key: 'contest-nudge',
    name: 'Contest nudge',
    description: 'Push contest standings to creators who can still move up.',
    body:
      "Hey {first_name}, the contest closes Friday and you're sitting at {rank} with {gmv_7d}. One strong post moves you up. Standings are live in your portal.",
  },
  {
    key: 'going-silent-checkin',
    name: 'Going silent check-in',
    description: 'Friendly nudge for creators who have not posted in a while.',
    body:
      "Hey {first_name}, it's been {last_post_days} days since your last {brand} post and we miss you. Anything blocking you? Samples, content ideas, whatever you need, just reply here.",
  },
  {
    key: 'sample-shipped',
    name: 'Sample shipped',
    description: 'Heads-up that a new sample batch is on the way.',
    body:
      'Hey {first_name}, your new {brand} sample batch ships this week. Watch your portal for tracking, and let us know when it lands.',
  },
];

export function getBroadcastTemplate(key: string): BroadcastTemplate | undefined {
  return BROADCAST_TEMPLATES.find((t) => t.key === key);
}

/** Split a message body into text/token parts for highlighted rendering. */
export function splitByTokens(body: string): { type: 'text' | 'token'; value: string }[] {
  const parts: { type: 'text' | 'token'; value: string }[] = [];
  const re = /\{(\w+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: body.slice(last, m.index) });
    parts.push({ type: 'token', value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ type: 'text', value: body.slice(last) });
  return parts;
}
