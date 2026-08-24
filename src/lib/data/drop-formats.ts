/**
 * The seven Discord post formats, declared once.
 *
 * This list was previously written out three times: once inline in each card
 * builder in /api/drops, again in that route's META fallback array, and it was
 * about to be written a third time for the board's empty state. Three copies of
 * "what does Rookies do" is three chances for them to disagree, and the empty
 * state is the copy a reader sees BEFORE any fetch, so it cannot come from the
 * API response.
 *
 * ⚠️ ORDER IS LOAD-BEARING. /api/drops builds its cards in a positional
 * Promise.allSettled and recovers a rejected card's metadata by INDEX into this
 * array. Reordering here without reordering the allSettled array puts the wrong
 * label on a failed card. The order itself is deliberate: growth-ranked formats
 * lead, absolute-GMV formats trail, because the absolute ones repeat the same
 * winners every week and should not be what the reader sees first.
 */

export type DropFormatId =
  | 'movers' | 'rookies' | 'milestones' | 'mtd'
  | 'whats-cooking' | 'whos-cooking' | 'daily-drop';

export interface DropFormat {
  id: DropFormatId;
  label: string;
  /** One line on what this format surfaces, shown under the title. */
  what: string;
  /** false = ranks by absolute GMV, so it repeats the same winners. */
  growthRanked: boolean;
  /** false = ignores the range picker and runs on its own window. */
  acceptsWindow: boolean;
  /**
   * The window this format runs on when it ignores the picker. Null for the
   * four that honour it, whose label is the selected range instead.
   */
  ownWindowLabel: string | null;
}

export const DROP_FORMATS: readonly DropFormat[] = [
  {
    id: 'movers', label: 'Biggest Movers',
    what: 'Ranks by growth, not size. Surfaces climbers.',
    growthRanked: true, acceptsWindow: true, ownWindowLabel: null,
  },
  {
    id: 'rookies', label: 'Rookies',
    what: 'First-timers inside their opening weeks.',
    growthRanked: true, acceptsWindow: true, ownWindowLabel: null,
  },
  {
    id: 'milestones', label: 'Milestones',
    what: 'Creators crossing a lifetime GMV threshold.',
    growthRanked: true, acceptsWindow: false, ownWindowLabel: 'Last 14 days',
  },
  {
    id: 'mtd', label: 'Month to Date',
    what: 'Standings with rank movement since last month.',
    growthRanked: true, acceptsWindow: false, ownWindowLabel: 'This calendar month',
  },
  {
    id: 'whats-cooking', label: "What's Cooking",
    what: 'Top performing videos of the window.',
    growthRanked: false, acceptsWindow: true, ownWindowLabel: null,
  },
  {
    id: 'whos-cooking', label: "Who's Cooking",
    what: 'Top creators by GMV. The familiar board.',
    growthRanked: false, acceptsWindow: true, ownWindowLabel: null,
  },
  {
    id: 'daily-drop', label: 'Daily Drop',
    what: 'Yesterday at a glance.',
    growthRanked: false, acceptsWindow: false, ownWindowLabel: 'Yesterday only',
  },
] as const;
