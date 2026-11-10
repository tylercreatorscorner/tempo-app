import type { MetricRow } from '@/lib/data/dashboard-series-model';

export interface SeriesResult { rows: MetricRow[]; brands: number }
export interface SeriesWindow { start: string; end: string }

/** Calendar windows keep the existing daily-grain RPC below its timeout. */
export function seriesWindows(start: string, end: string): SeriesWindow[] {
  const windows: SeriesWindow[] = [];
  let cursor = start;
  while (cursor <= end) {
    const [year, month] = cursor.split('-').map(Number);
    const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const through = last < end ? last : end;
    windows.push({ start: cursor, end: through });
    const next = new Date(`${through}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }
  return windows;
}

async function fetchWindow(window: SeriesWindow, brand: string | null, signal: AbortSignal): Promise<SeriesResult> {
  const abort = new AbortController();
  const cancel = () => abort.abort();
  signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 30000);
  try {
    if (signal.aborted) abort.abort();
    const params = new URLSearchParams({ start: window.start, end: window.end });
    if (brand) params.set('brand', brand);
    const response = await fetch(`/api/dashboard/series?${params}`, { signal: abort.signal });
    if (!response.ok) throw new Error('Chart metrics unavailable');
    const data: SeriesResult = await response.json();
    if (!Array.isArray(data.rows) || !Number.isFinite(data.brands)) throw new Error('Invalid chart metrics');
    return data;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}

/** Two requests at most, with success-only cache local to this provider/scope. */
export async function loadSeriesRange({ start, end, brand, signal, cache, onProgress }: {
  start: string; end: string; brand: string | null; signal: AbortSignal;
  cache: Map<string, SeriesResult>; onProgress: (completed: number, total: number) => void;
}): Promise<SeriesResult> {
  const windows = seriesWindows(start, end);
  const results = new Array<SeriesResult>(windows.length);
  let cursor = 0;
  let completed = 0;
  let failed = false;
  onProgress(0, windows.length);
  const worker = async () => {
    while (cursor < windows.length && !failed && !signal.aborted) {
      const index = cursor++;
      const window = windows[index];
      const key = `${window.start}|${window.end}`;
      try {
        const result = cache.get(key) ?? await fetchWindow(window, brand, signal);
        if (signal.aborted) throw new Error('Chart request cancelled');
        cache.set(key, result);
        results[index] = result;
        onProgress(++completed, windows.length);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  // Wait for both workers to settle before surfacing a failed range; never
  // publish a partial response as a complete history.
  const settled = await Promise.allSettled(Array.from({ length: Math.min(2, windows.length) }, worker));
  const rejected = settled.find(result => result.status === 'rejected');
  if (rejected?.status === 'rejected') throw rejected.reason;
  if (signal.aborted) throw new Error('Chart request cancelled');
  const brands = results[0]?.brands ?? 0;
  if (results.some(result => result.brands !== brands)) throw new Error('Chart scope changed during loading');
  return { rows: results.flatMap(result => result.rows), brands };
}
