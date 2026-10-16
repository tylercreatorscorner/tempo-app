/** Capture-only pagination. Exhaustion is distinct from verified metric parity. */
export async function captureRecoveryPages({ fetchPage, savePage, rowKey, maxPages = 50, budgetMs = 25_000, now = Date.now,
  initialToken = null, initialRows = 0, initialExpected = null, pageOffset = 0, previousTokens = [] }: {
  fetchPage: (token: string | null) => Promise<{ data: Record<string, unknown>; requestId: string | null }>;
  savePage: (page: number, token: string | null, data: Record<string, unknown>, rows: number, requestId: string | null) => Promise<void>;
  rowKey: 'videos' | 'orders'; maxPages?: number; budgetMs?: number; now?: () => number;
  initialToken?: string | null; initialRows?: number; initialExpected?: number | null; pageOffset?: number; previousTokens?: string[];
}) {
  let token: string | null = initialToken;
  let rows = initialRows;
  let pages = pageOffset;
  let expected: number | null = initialExpected;
  const seen = new Set<string>(previousTokens);
  const started = now();
  for (let page = 0; page < maxPages && pageOffset + page < 500 && now() - started < budgetMs; page++) {
    const result = await fetchPage(token);
    const data = result.data;
    if (!data || !Array.isArray(data[rowKey])) throw new Error(`Unrecognized source response: missing ${rowKey} array.`);
    const items = data[rowKey] as unknown[];
    await savePage(pageOffset + page, token, data, items.length, result.requestId);
    pages++;
    rows += items.length;
    const total = data.total_count;
    if (typeof total === 'number' && Number.isSafeInteger(total) && total >= 0) {
      if (expected !== null && expected !== total) throw new Error('Source total changed during pagination. Capture requires reconciliation.');
      expected = total;
    }
    const next = data.next_page_token;
    if (next !== undefined && next !== null && typeof next !== 'string') throw new Error('Unrecognized source continuation token.');
    if (!next) {
      if (!Object.hasOwn(data, 'next_page_token') && expected === null) throw new Error('Source did not establish pagination exhaustion.');
      return { pages, rows, expected, exhausted: true, countsMatch: expected === null ? null : rows === expected, hasMore: false };
    }
    if (seen.has(next)) throw new Error('Source repeated a page token. Capture is incomplete.');
    seen.add(next);
    token = next;
  }
  return { pages, rows, expected, exhausted: false, countsMatch: null, hasMore: pages < 500 };
}

export function recoveryDateWindow(value: unknown, latest: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const start = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0,10) !== value || value > latest) return null;
  start.setUTCDate(start.getUTCDate() + 1);
  return { start: value, end: start.toISOString().slice(0,10) };
}
