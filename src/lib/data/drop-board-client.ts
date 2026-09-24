import { DROP_FORMATS } from './drop-formats';

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
) {
  let next = 0;
  const range = params.get('period') === 'custom'
    ? `${params.get('start')} to ${params.get('end')}`
    : params.get('period') === '30d' ? 'Last 30 days' : 'Last 7 days';
  async function worker() {
    while (!signal.aborted && next < DROP_FORMATS.length) {
      const format = DROP_FORMATS[next++];
      const query = new URLSearchParams(params);
      query.set('format', format.id);
      try {
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
  await Promise.all(Array.from({ length: 3 }, worker));
}
