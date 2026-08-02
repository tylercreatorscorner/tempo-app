/**
 * Shadow ingest — build one brand-day from the API, beside the CSV, never over it.
 *
 * WHAT THIS PROVES: whether the API can reproduce the manual exports at ROW
 * grain. Brand-level totals already tie exactly (affiliate video $20,329.04 and
 * live $1,622.03 on jiyu 2026-07-24, both to the cent), and a single video's
 * views/likes/comments/shares/gmv matched video_performance byte-for-byte. This
 * runs the whole day so the diff can be per-row rather than per-total.
 *
 * ⚠️ IT NEVER TOUCHES A FACT TABLE. It writes api_shadow_* and nothing else.
 * creator_performance, video_performance and product_performance are READ ONLY
 * here, and only by the diff that runs afterwards. If this module ever gains a
 * write to one of them, the reason it exists is gone.
 *
 * THE SOURCES, and why each (all measured, none assumed):
 *   · /analytics/202509/shop_videos/performance        — the video list: id,
 *     username, title, post time. The LIST's money is seller-side, so only its
 *     identity fields are used.
 *   · /analytics/202509/shop_videos/{id}/performance   — the detail: traffic
 *     {views, likes, comments, shares, new_followers} and sales {gmv, ctr, gpm,
 *     customers, product_impressions, product_clicks} plus per-product
 *     breakdowns. This is the ONLY seller-side source of likes/comments/shares
 *     and it carries no account_type caveat.
 *   · /analytics/202605/shop_products/performance      — per product, with
 *     affiliate_total / affiliate_video / affiliate_live split out from seller,
 *     plus refunds, refunded_items and the add-to-cart funnel. 202509 is the
 *     THIN version of this and returns none of it.
 *   · /affiliate_seller/202412/open_collaborations/search — product titles,
 *     which no analytics endpoint returns.
 */
import { createAdminClient } from '@/lib/supabase/server';
import { getActiveConnection, touchApiCall } from './connections';
import { TikTokError } from './client';

const VIDEO_VERSION = '202509';
const PRODUCT_VERSION = '202605';   // 202509 is the thin one — do not "simplify" this
const COLLAB_VERSION = '202412';
const PAGE_SIZE = 100;
const MAX_PAGES = 200;

/** Between detail calls. A 429 from TikTok is the one failure that could cost
 *  the app its access, and a sweep that trips the limiter looks like a clean
 *  run while collecting nothing. */
const PACE_MS = 120;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const money = (o: unknown): number | null =>
  o && typeof o === 'object' ? num((o as Record<string, unknown>).amount) : null;

type Rec = Record<string, unknown>;

export interface ShadowRunResult {
  runId: string;
  brandSlug: string;
  reportDate: string;
  status: 'ok' | 'partial' | 'failed';
  videosListed: number;
  videosDetailed: number;
  productsFetched: number;
  apiCalls: number;
  error: string | null;
}

/**
 * @param limitDetail cap on per-video detail calls, highest GMV first.
 *   Defaults to 40 so a first proof runs in about a minute. jiyu has ~12,500
 *   videos a day but only ~170 with non-zero GMV, so full coverage is a few
 *   hundred calls — raise this once the shape is confirmed rather than
 *   discovering a timeout at 300.
 */
export async function runShadowIngest(
  brandSlug: string,
  reportDate: string,
  limitDetail = 40,
): Promise<ShadowRunResult> {
  const runId = crypto.randomUUID();
  const supabase = await createAdminClient();
  const out: ShadowRunResult = {
    runId, brandSlug, reportDate, status: 'failed',
    videosListed: 0, videosDetailed: 0, productsFetched: 0, apiCalls: 0, error: null,
  };

  await supabase.from('api_shadow_runs').insert({
    run_id: runId, brand_slug: brandSlug, report_date: reportDate, status: 'running',
  });

  const finish = async (status: ShadowRunResult['status'], error: string | null) => {
    out.status = status; out.error = error;
    await supabase.from('api_shadow_runs').update({
      status, error,
      videos_listed: out.videosListed, videos_detailed: out.videosDetailed,
      products_fetched: out.productsFetched, api_calls: out.apiCalls,
      finished_at: new Date().toISOString(),
    }).eq('run_id', runId);
    return out;
  };

  const conn = await getActiveConnection(brandSlug);
  if (!conn.ok) return finish('failed', conn.message);

  // end_date_lt IS exclusive — TikTok refuses a same-day window with 28001022.
  const next = new Date(`${reportDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const dayAfter = next.toISOString().slice(0, 10);
  const window = { start_date_ge: reportDate, end_date_lt: dayAfter, currency: 'USD' };

  try {
    // ── 1. Product titles. No analytics endpoint returns a product name.
    const titles = new Map<string, string>();
    {
      const res = await conn.client.post<Rec>(
        `/affiliate_seller/${COLLAB_VERSION}/open_collaborations/search`,
        { query: { page_size: String(PAGE_SIZE) }, body: {}, idempotent: true },
      );
      out.apiCalls++;
      for (const c of (res.data?.collaborations as Rec[] | undefined) ?? []) {
        const p = c.product as Rec | undefined;
        if (p?.id) titles.set(String(p.id), String(p.title ?? ''));
      }
    }

    // ── 2. Products, with the affiliate/seller split and refunds.
    {
      let token: string | null = null;
      const seen = new Set<string>();
      for (let page = 0; page < MAX_PAGES; page++) {
        // Explicitly typed: `token` feeds the query that produces `res`, which
        // produces the next `token`, and TS cannot break that cycle on its own.
        const res: { data: Rec; requestId: string | null } = await conn.client.get<Rec>(
          `/analytics/${PRODUCT_VERSION}/shop_products/performance`,
          { ...window, page_size: String(PAGE_SIZE), ...(token ? { page_token: token } : {}) },
        );
        out.apiCalls++;
        const rows = (res.data?.products as Rec[] | undefined) ?? [];
        const batch = rows.map((p) => {
          const t = (p.total_performance ?? {}) as Rec;
          const at = (p.affiliate_total_performance ?? {}) as Rec;
          const av = (p.affiliate_video_performance ?? {}) as Rec;
          const al = (p.affiliate_live_performance ?? {}) as Rec;
          const st = (p.shop_tab_performance ?? {}) as Rec;
          return {
            run_id: runId, brand_slug: conn.brandSlug, report_date: reportDate,
            product_id: String(p.id), product_name: titles.get(String(p.id)) ?? null,
            total_gmv: money(t.gmv),
            affiliate_total_gmv: money(at.attributed_gmv),
            affiliate_video_gmv: money(av.attributed_video_gmv),
            affiliate_live_gmv: money(al.live_attributed_gmv),
            shop_tab_gmv: money(st.shop_tab_gmv),
            refunds: money(t.refunds),
            refunded_items: num(t.refunded_items), refund_customers: num(t.refund_customers),
            orders: num(t.orders), items_sold: num(t.items_sold), aov: money(t.aov),
            ctr: num(t.ctr), unique_ctr: num(t.unique_ctr),
            product_impressions: num(t.product_impressions),
            product_clicks: num(t.product_clicks), unique_clicks: num(t.unique_clicks),
            add_cart_count: num(t.add_cart_count), add_cart_users: num(t.add_cart_users),
            add_cart_rate: num(t.add_cart_rate), click_order_rate: num(t.click_order_rate),
            estimated_customers: num(t.estimated_customers),
            new_video_count: num(av.new_video_count), new_live_count: num(al.new_live_count),
            shop_tab_ctor_sku: num(st.shop_tab_ctor_sku),
          };
        });
        if (batch.length) {
          const { error } = await supabase
            .from('api_shadow_product_performance')
            .upsert(batch, { onConflict: 'run_id,product_id' });
          if (error) throw new Error(`product write failed: ${error.message}`);
          out.productsFetched += batch.length;
        }
        const tok: unknown = res.data?.next_page_token;
        if (typeof tok !== 'string' || !tok || seen.has(tok)) break;
        seen.add(tok); token = tok;
      }
    }

    // ── 3. The video LIST — identity only. Its money is seller-side.
    //    Pagination keys on the token, NEVER on page fullness: TikTok returns
    //    short pages mid-sequence, so stopping at the first non-full page would
    //    silently capture a fraction of the day and report success.
    const videos: { id: string; username: string; title: string; postTime: string | null; gmv: number }[] = [];
    {
      let token: string | null = null;
      const seen = new Set<string>();
      for (let page = 0; page < MAX_PAGES; page++) {
        const res: { data: Rec; requestId: string | null } = await conn.client.get<Rec>(
          `/analytics/${VIDEO_VERSION}/shop_videos/performance`,
          { ...window, page_size: String(PAGE_SIZE), account_type: 'AFFILIATE_ACCOUNTS',
            ...(token ? { page_token: token } : {}) },
        );
        out.apiCalls++;
        for (const v of (res.data?.videos as Rec[] | undefined) ?? []) {
          videos.push({
            id: String(v.id), username: String(v.username ?? ''),
            title: String(v.title ?? ''),
            postTime: v.video_post_time ? String(v.video_post_time) : null,
            gmv: money(v.gmv) ?? 0,
          });
        }
        const tok: unknown = res.data?.next_page_token;
        if (typeof tok !== 'string' || !tok || seen.has(tok)) break;
        seen.add(tok); token = tok;
      }
      out.videosListed = videos.length;
    }

    // ── 4. Per-video detail. Highest GMV first — a capped run must cover the
    //    videos that carry the money, not an arbitrary slice.
    const targets = videos.filter((v) => v.gmv > 0).sort((a, b) => b.gmv - a.gmv).slice(0, limitDetail);
    const byCreator = new Map<string, {
      gmv: number; items: number; customers: number; views: number; likes: number;
      comments: number; shares: number; impressions: number; clicks: number; videos: number;
    }>();

    for (const v of targets) {
      const res = await conn.client.get<Rec>(
        `/analytics/${VIDEO_VERSION}/shop_videos/${encodeURIComponent(v.id)}/performance`,
        window,
      );
      out.apiCalls++;
      const iv = ((res.data?.performance as Rec | undefined)?.intervals as Rec[] | undefined)?.[0];
      if (!iv) { await sleep(PACE_MS); continue; }

      const traffic = (iv.traffic ?? {}) as Rec;
      const sales = (iv.sales ?? {}) as Rec;
      const overall = (sales.overall ?? {}) as Rec;
      const breakdowns = (sales.breakdowns as Rec[] | undefined) ?? [];

      // ⚠️ ALWAYS a video-level row (product_id NULL) carrying traffic and the
      // overall sales figures, PLUS one row per product breakdown carrying only
      // that product's money.
      //
      // The first version wrote traffic only when a video had NO breakdowns —
      // and every video has breakdowns, so likes/comments/shares landed nowhere
      // at all. 66 rows, 40 videos, zero traffic. The conditional read as
      // defensive and was simply wrong.
      //
      // Traffic is still NOT divided across the product rows: a video with three
      // products has one like count, not three thirds of one, and splitting it
      // would invent per-product engagement that does not exist.
      const videoRow = {
        run_id: runId, brand_slug: conn.brandSlug, report_date: reportDate,
        video_id: v.id, product_id: null,
        creator_name: v.username.toLowerCase() || null,
        video_title: v.title || null,
        post_date: v.postTime ? new Date(v.postTime.replace(' ', 'T') + 'Z').toISOString() : null,
        gmv: money(overall.gmv), items_sold: num(overall.items_sold),
        customers: num(overall.customers),
        views: num(traffic.views), likes: num(traffic.likes),
        comments: num(traffic.comments), shares: num(traffic.shares),
        new_followers: num(traffic.new_followers),
        product_impressions: num(overall.product_impressions),
        product_clicks: num(overall.product_clicks),
        ctr: num(overall.ctr), gpm: money(overall.gpm),
      };
      const productRows = breakdowns.map((b) => ({
        run_id: runId, brand_slug: conn.brandSlug, report_date: reportDate,
        video_id: v.id, product_id: String(b.product_id ?? '') || null,
        creator_name: v.username.toLowerCase() || null,
        video_title: v.title || null,
        post_date: videoRow.post_date,
        gmv: money(b.gmv), items_sold: num(b.items_sold), customers: num(b.customers),
        views: null, likes: null, comments: null, shares: null, new_followers: null,
        product_impressions: num(b.product_impressions),
        product_clicks: num(b.product_clicks),
        ctr: num(b.ctr), gpm: money(b.gpm),
      }));
      // A breakdown whose product_id is missing would collide with the
      // video-level row on (run_id, video_id, NULL) under NULLS NOT DISTINCT,
      // so it is dropped rather than allowed to overwrite the traffic row.
      const rows = [videoRow, ...productRows.filter((r) => r.product_id !== null)];

      const { error } = await supabase
        .from('api_shadow_video_performance')
        .upsert(rows, { onConflict: 'run_id,video_id,product_id' });
      if (error) throw new Error(`video write failed: ${error.message}`);
      out.videosDetailed++;

      const key = v.username.toLowerCase();
      const acc = byCreator.get(key) ?? {
        gmv: 0, items: 0, customers: 0, views: 0, likes: 0,
        comments: 0, shares: 0, impressions: 0, clicks: 0, videos: 0,
      };
      acc.gmv += money(overall.gmv) ?? 0;
      acc.items += num(overall.items_sold) ?? 0;
      acc.customers += num(overall.customers) ?? 0;
      acc.views += num(traffic.views) ?? 0;
      acc.likes += num(traffic.likes) ?? 0;
      acc.comments += num(traffic.comments) ?? 0;
      acc.shares += num(traffic.shares) ?? 0;
      acc.impressions += num(overall.product_impressions) ?? 0;
      acc.clicks += num(overall.product_clicks) ?? 0;
      acc.videos += 1;
      byCreator.set(key, acc);

      await sleep(PACE_MS);
    }

    // ── 5. Creator roll-up, derived from the video detail.
    if (byCreator.size > 0) {
      const rows = [...byCreator.entries()].map(([creator, a]) => ({
        run_id: runId, brand_slug: conn.brandSlug, report_date: reportDate,
        creator_name: creator, video_gmv: a.gmv, items_sold: a.items, customers: a.customers,
        views: a.views, likes: a.likes, comments: a.comments, shares: a.shares,
        product_impressions: a.impressions, product_clicks: a.clicks,
        videos_with_sales: a.videos,
      }));
      const { error } = await supabase
        .from('api_shadow_creator_performance')
        .upsert(rows, { onConflict: 'run_id,creator_name' });
      if (error) throw new Error(`creator write failed: ${error.message}`);
    }

    await touchApiCall(conn.connectionId);
    // 'partial' when the detail cap bit — a capped run that reported 'ok' would
    // make an incomplete diff look like a complete one.
    const capped = videos.filter((v) => v.gmv > 0).length > targets.length;
    return finish(capped ? 'partial' : 'ok', capped
      ? `detail capped at ${limitDetail} of ${videos.filter((v) => v.gmv > 0).length} earning videos`
      : null);
  } catch (e) {
    const te = e instanceof TikTokError ? e : null;
    return finish('failed', te
      ? `${te.constructor.name} status=${te.status} code=${te.code ?? '—'}: ${te.message}`
      : e instanceof Error ? e.message : String(e));
  }
}
