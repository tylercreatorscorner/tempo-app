/**
 * Review tag presets — the SINGLE source of truth for video-review tags.
 *
 * Stored in video_reviews.tags as stable SLUGS (never display text) so copy
 * changes can't silently break the Flagged queue. The flagged set is mirrored
 * in SQL by get_video_reviews_in_window (migration 090) — if FLAGGED_TAG_SLUGS
 * ever changes, update that RPC in the same commit.
 *
 * Pure constants: safe to import from both server (posts.ts) and client
 * (post-review-client.tsx) code.
 */
export const REVIEW_TAGS = [
  { slug: 'banger',       label: 'Banger' },
  { slug: 'needs-rework', label: 'Needs rework' },
  { slug: 'shoutout',     label: 'Shoutout' },
  { slug: 'off-brand',    label: 'Off-brand' },
  { slug: 'inspo',        label: 'Inspo' },
] as const;

export type ReviewTagSlug = (typeof REVIEW_TAGS)[number]['slug'];

/** Tags that surface a post in the "Flagged" review queue. */
export const FLAGGED_TAG_SLUGS: ReadonlySet<string> = new Set(['off-brand', 'needs-rework']);

const LABEL_BY_SLUG = new Map<string, string>(REVIEW_TAGS.map(t => [t.slug, t.label]));

/** Display label for a stored tag slug; unknown slugs render as-is. */
export function reviewTagLabel(slug: string): string {
  return LABEL_BY_SLUG.get(slug) ?? slug;
}
