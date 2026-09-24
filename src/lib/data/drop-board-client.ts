import { DROP_FORMATS, type DropFormatId } from './drop-formats';

export const DROP_SELECTION_KEY = 'tempo:drop-formats:v1';

/** Ignore stale IDs in saved preferences, but preserve a deliberate empty set. */
export function parseDropSelection(saved: string | null): DropFormatId[] {
  const defaults = DROP_FORMATS.map(f => f.id);
  if (saved === null) return defaults;
  try {
    const value: unknown = JSON.parse(saved);
    if (!Array.isArray(value)) return defaults;
    const selected = defaults.filter(id => value.includes(id));
    return value.length > 0 && selected.length === 0 ? defaults : selected;
  } catch {
    return defaults;
  }
}

export interface DropBoardCard {
  id: string;
  label: string;
  what: string;
  growthRanked: boolean;
  acceptsWindow: boolean;
  windowLabel: string;
  text: string | null;
  mentionMap: Record<string, string>;
  qualified: string | null;
  empty: boolean;
  error: string | null;
}

/** Independent requests preserve completed cards even if one function times out.
 * Three workers cap database fan-out, including multi-query formats.
 */
export async function loadDropBoard(
  params: URLSearchParams,
  signal: AbortSignal,
  onCard: (card: DropBoardCard, brandName?: string, rangeLabel?: string) => void,
  options: {
    formats?: readonly DropFormatId[];
    onStart?: (id: DropFormatId) => void;
  } = {},
) {
  const formats = DROP_FORMATS.filter(f => options.formats === undefined || options.formats.includes(f.id));
  let next = 0;
  const range = params.get('period') === 'custom'
    ? `${params.get('start')} to ${params.get('end')}`
    : params.get('period') === '30d' ? 'Last 30 days' : 'Last 7 days';
  async function worker() {
    while (!signal.aborted && next < formats.length) {
      const format = formats[next++];
      const query = new URLSearchParams(params);
      query.set('format', format.id);
      try {
        options.onStart?.(format.id);
        const response = await fetch(`/api/drops?${query}`, { signal });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || (
          response.status === 504 ? 'This format took too long. Build the board again to retry.' : `HTTP ${response.status}`
        ));
        const card = body.cards?.find((c: DropBoardCard) => c.id === format.id);
        if (!card) throw new Error('The server did not return this format. Please retry.');
        if (!signal.aborted) onCard(card, body.brandName, body.rangeLabel);
      } catch (error) {
        if (signal.aborted) return;
        onCard({
          ...format, windowLabel: format.acceptsWindow ? range : format.ownWindowLabel!,
          text: null, mentionMap: {}, qualified: null, empty: false,
          error: error instanceof Error ? error.message : 'Failed to build this format',
        });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, formats.length) }, worker));
}
