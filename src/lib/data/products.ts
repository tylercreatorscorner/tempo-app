/**
 * Products data fetcher.
 *
 * Powers the /products page. For a given (brand filter, date range) returns:
 *   - Full per-product aggregates (GMV, orders, items, videos posting, creators with sales)
 *   - Top-line KPI totals + WoW deltas vs the immediately-prior equal-length period
 *   - Sortable + searchable on the client (we return all rows; UI does the filtering)
 *
 * Source table: product_performance (legacy, populated by the upload tool's
 * Transaction_Analysis flow). It has brand as a text slug (not UUID like
 * daily_product_stats), and is the most-complete table — daily_product_stats
 * sometimes lags due to inconsistent sync trigger firing.
 */
import { createAdminClient } from '@/lib/supabase/server';

export interface ProductRow {
  product_id: string;
  product_name: string;
  brand: string;
  product_category: string | null;
  gmv: number;
  refunds: number;
  orders: number;
  items_sold: number;
  items_refunded: number;
  videos: number;
  live_streams: number;
  est_commission: number;
  /** Avg # of creators per day with sales attributed to this product */
  avg_creators_with_sales: number;
}

export interface ProductsKpis {
  totalGmv: number;
  totalOrders: number;
  totalItems: number;
  productCount: number;
  // Trends (% change vs prior period; null when prior was 0 and we have no signal)
  gmvChangePct: number | null;
  ordersChangePct: number | null;
  itemsChangePct: number | null;
  productCountChangePct: number | null;
}

export interface ProductsResult {
  products: ProductRow[];
  kpis: ProductsKpis;
  /** Range used (echoed back to the client for headers) */
  startDate: string;
  endDate: string;
}

export interface ProductCreatorBreakdownRow {
  tiktok_username: string;
  gmv: number;
  orders: number;
  items_sold: number;
  videos: number;
}

// ── Helpers ────────────────────────────────────────────────────────

interface RawRow {
  product_id: string;
  product_name: string;
  brand: string;
  product_category: string | null;
  gmv: number | string;
  refunds: number | string;
  orders: number | string;
  items_sold: number | string;
  items_refunded: number | string;
  videos: number | string;
  live_streams: number | string;
  est_commission: number | string;
  avg_daily_creators_with_sales: number | string;
}

function pNum(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
}
function pInt(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return Number.isNaN(n) ? 0 : n;
}

function pctChange(curr: number, prior: number): number | null {
  if (prior === 0) return curr > 0 ? 100 : null;
  return ((curr - prior) / prior) * 100;
}

// Each query is paginated to avoid hitting Supabase's default 1000-row cap on
// large date ranges (a 30-day pull on Physicians Choice can be ~10k rows).
async function paginatedSelect(
  // We expect a Supabase admin client here; typing as an admin client without
  // pulling the full PostgrestClient generic is intentionally loose.
  supabase: { from: (t: string) => { select: (s: string) => unknown } },
  brandSlugs: string[] | null,
  startDate: string,
  endDate: string,
): Promise<RawRow[]> {
  const PAGE_SIZE = 1000;
  const all: RawRow[] = [];
  let from = 0;
  while (true) {
    const cols = 'product_id, product_name, brand, product_category, gmv, refunds, orders, items_sold, items_refunded, videos, live_streams, est_commission, avg_daily_creators_with_sales';
    // Build the chained query — we need to invoke it dynamically to dodge
    // PostgrestClient's tight generics on dynamic table/column queries.
    type Q = {
      eq:    (k: string, v: unknown) => Q;
      gte:   (k: string, v: unknown) => Q;
      lte:   (k: string, v: unknown) => Q;
      in:    (k: string, v: unknown[]) => Q;
      range: (a: number, b: number) => Promise<{ data: unknown; error: unknown }>;
    };
    let q = (supabase.from('product_performance').select(cols) as Q)
      .eq('period_type', 'daily')
      .gte('report_date', startDate)
      .lte('report_date', endDate);
    if (brandSlugs && brandSlugs.length > 0) q = q.in('brand', brandSlugs);
    const { data, error } = await q.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data as RawRow[] | null) ?? [];
    if (rows.length === 0) break;
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

function aggregate(rows: RawRow[]): Map<string, ProductRow> {
  // Aggregate over (product_id|||brand) since the same product_id can exist
  // across multiple brands (e.g. multi-brand catalog or shared product imports).
  const map = new Map<string, ProductRow>();
  // Track unique daily creators per product to compute a real "creators with sales" count.
  // (avg_daily_creators_with_sales is an integer per row; summing it gives an
  // overcount when periods span many days, so we use it as a per-day average instead.)
  const daysSeen = new Map<string, Set<string>>();

  for (const row of rows) {
    const key = `${row.product_id}|||${row.brand}`;
    let p = map.get(key);
    if (!p) {
      p = {
        product_id: row.product_id,
        product_name: row.product_name,
        brand: row.brand,
        product_category: row.product_category ?? null,
        gmv: 0, refunds: 0, orders: 0, items_sold: 0, items_refunded: 0,
        videos: 0, live_streams: 0, est_commission: 0, avg_creators_with_sales: 0,
      };
      map.set(key, p);
      daysSeen.set(key, new Set());
    }
    p.gmv             += pNum(row.gmv);
    p.refunds         += pNum(row.refunds);
    p.orders          += pInt(row.orders);
    p.items_sold      += pInt(row.items_sold);
    p.items_refunded  += pInt(row.items_refunded);
    p.videos          += pInt(row.videos);
    p.live_streams    += pInt(row.live_streams);
    p.est_commission  += pNum(row.est_commission);
    // We sum the daily averages across days, then divide by # of days to get
    // a true period-average creators-per-day count — better than the raw sum
    // (which would be misleading) and not as expensive as a separate query.
    p.avg_creators_with_sales += pInt(row.avg_daily_creators_with_sales);
    daysSeen.get(key)!.add(`day:${(row as unknown as { report_date?: string }).report_date ?? ''}`);
  }

  // Convert summed avg_creators_with_sales -> period average
  for (const [key, p] of map.entries()) {
    const days = Math.max(1, daysSeen.get(key)?.size ?? 1);
    p.avg_creators_with_sales = Math.round(p.avg_creators_with_sales / days);
  }

  return map;
}

// ── Main fetcher ───────────────────────────────────────────────────

export async function getProducts(opts: {
  brand: string | null;
  startDate: string;
  endDate: string;
}): Promise<ProductsResult> {
  const { brand, startDate, endDate } = opts;
  const supabase = await createAdminClient();

  // Brand filter: null/empty = all brands
  const brandSlugs = brand && brand !== 'all' ? [brand] : null;

  // Compute prior period — same length, immediately preceding
  const start = new Date(startDate + 'T00:00:00Z');
  const end   = new Date(endDate   + 'T00:00:00Z');
  const days  = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const priorEnd   = new Date(start);
  priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setUTCDate(priorStart.getUTCDate() - (days - 1));
  const priorStartStr = priorStart.toISOString().split('T')[0];
  const priorEndStr   = priorEnd.toISOString().split('T')[0];

  const [currentRows, priorRows] = await Promise.all([
    paginatedSelect(supabase as unknown as { from: (t: string) => { select: (s: string) => unknown } }, brandSlugs, startDate, endDate),
    paginatedSelect(supabase as unknown as { from: (t: string) => { select: (s: string) => unknown } }, brandSlugs, priorStartStr, priorEndStr),
  ]);

  const currentMap = aggregate(currentRows);
  const priorMap   = aggregate(priorRows);

  const products = Array.from(currentMap.values()).sort((a, b) => b.gmv - a.gmv);

  const totalGmv    = products.reduce((s, p) => s + p.gmv, 0);
  const totalOrders = products.reduce((s, p) => s + p.orders, 0);
  const totalItems  = products.reduce((s, p) => s + p.items_sold, 0);
  const productCount = products.length;

  let priorGmv = 0, priorOrders = 0, priorItems = 0;
  for (const p of priorMap.values()) {
    priorGmv += p.gmv;
    priorOrders += p.orders;
    priorItems += p.items_sold;
  }
  const priorCount = priorMap.size;

  return {
    products,
    kpis: {
      totalGmv, totalOrders, totalItems, productCount,
      gmvChangePct:          pctChange(totalGmv,    priorGmv),
      ordersChangePct:       pctChange(totalOrders, priorOrders),
      itemsChangePct:        pctChange(totalItems,  priorItems),
      productCountChangePct: pctChange(productCount, priorCount),
    },
    startDate,
    endDate,
  };
}

// ── Per-product creator breakdown ──────────────────────────────────
// Used when the user expands a product row to see "who's selling this product?"
// Source: daily_video_product_stats (joins videos↔products).

export async function getProductCreatorBreakdown(opts: {
  productId: string;
  brand: string;
  startDate: string;
  endDate: string;
}): Promise<ProductCreatorBreakdownRow[]> {
  const { productId, brand, startDate, endDate } = opts;
  const supabase = await createAdminClient();

  // We need the brand UUID (daily_video_product_stats is keyed by brand_id, not slug)
  const { data: brandRow } = await supabase
    .from('brands_v2')
    .select('id')
    .eq('slug', brand)
    .maybeSingle();
  if (!brandRow) return [];
  const brandId = (brandRow as { id: string }).id;

  // Fetch all (creator, video) rows for this product over the window
  const PAGE_SIZE = 1000;
  type Row = {
    tiktok_username: string;
    video_id: string;
    gmv: number | string;
    orders: number | string;
    items_sold: number | string;
  };
  const rows: Row[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('daily_video_product_stats')
      .select('tiktok_username, video_id, gmv, orders, items_sold')
      .eq('brand_id', brandId)
      .eq('product_id', productId)
      .gte('report_date', startDate)
      .lte('report_date', endDate)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data as Row[] | null) ?? [];
    if (batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // Aggregate by creator handle
  const byCreator = new Map<string, { gmv: number; orders: number; items: number; videoIds: Set<string> }>();
  for (const r of rows) {
    const handle = (r.tiktok_username || '').toLowerCase().replace(/^@/, '');
    if (!handle) continue;
    let agg = byCreator.get(handle);
    if (!agg) { agg = { gmv: 0, orders: 0, items: 0, videoIds: new Set() }; byCreator.set(handle, agg); }
    agg.gmv    += pNum(r.gmv);
    agg.orders += pInt(r.orders);
    agg.items  += pInt(r.items_sold);
    if (r.video_id) agg.videoIds.add(r.video_id);
  }

  return Array.from(byCreator.entries())
    .map(([tiktok_username, a]) => ({
      tiktok_username,
      gmv: a.gmv,
      orders: a.orders,
      items_sold: a.items,
      videos: a.videoIds.size,
    }))
    .sort((a, b) => b.gmv - a.gmv);
}
