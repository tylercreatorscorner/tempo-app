/**
 * Changelog entries. Newest first.
 *
 * ⚠️  These are honest entries based on what's actually been shipped on the
 *     marketing site. Replace `summary` and `highlights` with real product
 *     ship notes as you go. Add a new object at the top whenever you ship.
 *
 * Type tags color-code the entry: 'feature' (pink), 'improvement' (purple),
 * 'fix' (gray). Keep titles short and outcomes concrete.
 */

export type ChangelogTag = 'feature' | 'improvement' | 'fix';

export type ChangelogEntry = {
  version: string;
  date: string; // ISO yyyy-mm-dd
  title: string;
  summary: string;
  highlights: Array<{ tag: ChangelogTag; text: string }>;
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v0.2.0',
    date: '2026-05-03',
    title: 'New marketing site',
    summary:
      'Rebuilt the public landing page from scratch with a focus on clarity, proof, and conversion.',
    highlights: [
      { tag: 'feature', text: 'New hero, problem, and how-it-works sections with refined copy' },
      { tag: 'feature', text: 'Comparison table: Tempo vs Seller Center vs Kalodata vs Spreadsheets' },
      { tag: 'feature', text: 'Dedicated /features and /changelog pages' },
      { tag: 'feature', text: 'Public /status page' },
      { tag: 'improvement', text: 'Real brand marquee replaces placeholder names' },
      { tag: 'improvement', text: 'Pricing copy reframed around ROI; categorized features grid' },
      { tag: 'improvement', text: 'PostHog, Vercel Analytics, and Sentry wiring ready to activate' },
    ],
  },
  // Add older entries below as you backfill real ship history.
];
