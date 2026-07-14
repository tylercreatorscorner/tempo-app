/**
 * Lightweight keyword-based topic classifier for inbound creator DMs.
 *
 * Rough mapping based on Tyler's actual Discord traffic:
 * - ban:        account ban / restriction / appeal
 * - campaign:   questions about joining / timing / briefs
 * - payment:    retainer pay, invoices, when-do-I-get-paid
 * - sample:     product samples, shipping, tracking
 * - review:     account review, performance review, video review
 * - checkin:    relationship checkins, rapport, general vibes
 * - other:      fallback
 *
 * Returns a MessageTopic string. Case-insensitive. Returns 'other' if no
 * keywords match (meaning: needs a human to classify).
 *
 * NOTE: this is a v1. Upgrade to AI classification later once we have
 * enough labelled data to validate accuracy.
 */

export const MESSAGE_TOPICS = [
  'ban',
  'campaign',
  'payment',
  'sample',
  'review',
  'checkin',
  'other',
] as const;

export type MessageTopic = typeof MESSAGE_TOPICS[number];

export const TOPIC_LABELS: Record<MessageTopic, string> = {
  ban:      'Ban / Account',
  campaign: 'Campaign',
  payment:  'Payment',
  sample:   'Sample',
  review:   'Review',
  checkin:  'Check-in',
  other:    'Other',
};

export const TOPIC_COLORS: Record<MessageTopic, { bg: string; fg: string }> = {
  ban:      { bg: 'bg-red-50',    fg: 'text-red-600' },
  campaign: { bg: 'bg-blue-50',   fg: 'text-blue-600' },
  payment:  { bg: 'bg-green-50',  fg: 'text-green-600' },
  sample:   { bg: 'bg-amber-50',  fg: 'text-amber-700' },
  review:   { bg: 'bg-purple-50', fg: 'text-purple-600' },
  checkin:  { bg: 'bg-pink-50',   fg: 'text-[var(--primary)]' },
  other:    { bg: 'bg-gray-100',  fg: 'text-gray-500' },
};

// Keyword patterns are ordered — more specific ones first so "banned account" → ban, not review.
const PATTERNS: Array<{ topic: MessageTopic; regex: RegExp }> = [
  // BAN / account issues
  { topic: 'ban', regex: /\b(ban(ned)?|suspend(ed)?|restricted|locked out|can'?t (log|post)|shadow\s?ban|appeal|reinstat)/i },

  // PAYMENT / retainer / invoice
  { topic: 'payment', regex: /\b(paid|payment|pay(?:out|day)?|retainer|invoice|commission|1099|w-?9|stripe|venmo|paypal|wire|check (?:in)?\s*the\s*mail)/i },

  // SAMPLE / shipping
  { topic: 'sample', regex: /\b(sample|free product|ship(p?ed|ping|ment)?|tracking|delivered|usps|ups|fedex|dhl|haven'?t (gotten|received))/i },

  // CAMPAIGN / briefs / new products
  { topic: 'campaign', regex: /\b(campaign|brief|launch|new product|new drop|add me|put me on|jump on|can i (post|do|get)|how much (is|for)|promote)/i },

  // REVIEW / feedback on content or performance
  { topic: 'review', regex: /\b(review|feedback|check (out|my)|how (am i|are we) doing|performance|stats|ranking|numbers|my (gmv|posts|videos))/i },

  // CHECK-IN / relationship / sentiment
  { topic: 'checkin', regex: /\b(how (are|r) (you|u)|hey tyler|hi tyler|good (morning|afternoon)|what'?s up|wyd|vibes|struggling|excited|congrats|thank you|appreciate)/i },
];

export function classifyTopic(content: string | null | undefined): MessageTopic {
  if (!content) return 'other';
  for (const { topic, regex } of PATTERNS) {
    if (regex.test(content)) return topic;
  }
  return 'other';
}
