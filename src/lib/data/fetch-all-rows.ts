/**
 * Fetch EVERY row of a Supabase table query, paging past PostgREST's default
 * 1000-row cap. `makeQuery` must return a FRESH builder each call (builders are
 * single-use) carrying a stable `.order()` so successive range windows line up.
 *
 * Extracted from src/lib/data/managed-gmv.ts so the payments routes (and any
 * future plain `.select()` money read) share one paging discipline instead of
 * each hand-rolling it. RPC results are NOT subject to the cap; plain table
 * reads ARE — an un-paged read silently truncates (e.g. managed_creators at
 * ~1.3k rows dropped handles and under-counted managed GMV).
 */
export async function fetchAllRows<T>(
  makeQuery: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> },
  label = 'fetch-all-rows',
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1);
    // THROW, don't break. Swallowing here returns a PARTIAL result set — a
    // confident low number, which is the same class of lie as rendering $0
    // for a failed read. A money read must fail loudly.
    if (error) throw new Error(`[${label}] paged fetch failed: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}
