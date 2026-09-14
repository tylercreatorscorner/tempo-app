/**
 * Shadow ingest — build one brand-day from the API, beside the CSV, never over it.
 *
 * Product affiliate totals have matched the reference day. Creator-day money
 * has NOT been reconciled: list/detail video GMV remains explicitly Seller
 * attributed. Complete content identity and bounded detail coverage are
 * independent; a detail cap must never drop zero-sale posts from inventory.
 *
 * ⚠️ IT NEVER TOUCHES A FACT TABLE. It writes api_shadow_* and nothing else.
 * creator_performance, video_performance and product_performance are READ ONLY
 * here, and only by the diff that runs afterwards. If this module ever gains a
 * write to one of them, the reason it exists is gone.
 *
 * SOURCES (versions verified independently in the current catalogue):
 *   · /analytics/202605/shop_videos/performance — complete identity, stable
 *     creator IDs, raw posting time, views and explicitly Seller video GMV.
 *   · /analytics/202509/shop_videos/{id}/performance   — the detail: traffic
 *     {views, likes, comments, shares, new_followers} and sales {gmv, ctr, gpm,
 *     customers, product_impressions, product_clicks} plus per-product
 *     breakdowns. Detail GMV is not universally equal to Affiliate Center.
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
import { pages, listedVideo, detailTargets, explicitInstant, validReportDate, id, type ListedVideo } from './ingest-core';

const VIDEO_VERSION = '202605'; // list: stable creator.open_id and creator.user_name
const VIDEO_DETAIL_VERSION = '202509'; // latest documented detail path; independent version
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
const addKnown = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : a + b;

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
  inventoryComplete: boolean;
  error: string | null;
}

/**
 * @param limitDetail bounded details in stable video-ID order; zero means
 * inventory/product capture only. This is not a durable cross-run job cursor.
 */
export async function runShadowIngest(
  brandSlug: string,
  reportDate: string,
  limitDetail = 40,
  detailOffset = 0,
): Promise<ShadowRunResult> {
  if (!validReportDate(reportDate)) throw new Error('Invalid report date');
  if (!Number.isInteger(limitDetail) || limitDetail < 0 || limitDetail > 500 ||
      !Number.isInteger(detailOffset) || detailOffset < 0) throw new Error('Invalid detail window');
  const runId = crypto.randomUUID();
  const supabase = await createAdminClient();
  const out: ShadowRunResult = {
    runId, brandSlug, reportDate, status: 'failed',
    videosListed: 0, videosDetailed: 0, productsFetched: 0, apiCalls: 0, inventoryComplete: false, error: null,
  };

  const { error: startError } = await supabase.from('api_shadow_runs').insert({
    run_id: runId, brand_slug: brandSlug, report_date: reportDate, status: 'running',
    detail_offset: detailOffset, detail_limit: limitDetail,
  });
  if (startError) throw new Error('Could not record shadow run');

  const finish = async (status: ShadowRunResult['status'], error: string | null) => {
    out.status = status; out.error = error;
    const { error: finishError } = await supabase.from('api_shadow_runs').update({
      status, error,
      videos_listed: out.videosListed, videos_detailed: out.videosDetailed,
      products_fetched: out.productsFetched, api_calls: out.apiCalls,
      inventory_complete: out.inventoryComplete,
      finished_at: new Date().toISOString(),
    }).eq('run_id', runId);
    if (finishError) throw new Error('Could not record shadow run result');
    return out;
  };

  try {
  const conn = await getActiveConnection(brandSlug);
  if (!conn.ok) return finish('failed', conn.message);

  // end_date_lt IS exclusive — TikTok refuses a same-day window with 28001022.
  const next = new Date(`${reportDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const dayAfter = next.toISOString().slice(0, 10);
  const window = { start_date_ge: reportDate, end_date_lt: dayAfter, currency: 'USD' };

    // ── 1. Product titles. No analytics endpoint returns a product name.
    const titles = new Map<string, string>();
    {
      const res = await conn.client.post<Rec>(
        `/affiliate_seller/${COLLAB_VERSION}/open_collaborations/search`,
        { query: { page_size: String(PAGE_SIZE) }, body: {}, idempotent: true },
      );
      out.apiCalls++;
      // Container is `open_collaborations`, NOT `collaborations` — the first run
      // read the wrong key and every product name came back empty.
      for (const c of (res.data?.open_collaborations as Rec[] | undefined) ?? []) {
        const p = c.product as Rec | undefined;
        if (p?.id) titles.set(String(p.id), String(p.title ?? ''));
      }
    }

    // ── 2. Products, with the affiliate/seller split and refunds.
    {
      const productIds = new Set<string>();
      for await (const page of pages(async token => {
        // Explicitly typed: `token` feeds the query that produces `res`, which
        // produces the next `token`, and TS cannot break that cycle on its own.
        const res: { data: Rec; requestId: string | null } = await conn.client.get<Rec>(
          `/analytics/${PRODUCT_VERSION}/shop_products/performance`,
          { ...window, page_size: String(PAGE_SIZE), ...(token ? { page_token: token } : {}) },
        );
        out.apiCalls++;
        return res.data;
      }, 'products', MAX_PAGES)) {
        const rows = page.rows;
        const batch = rows.map((p) => {
          const productId = id(p.id);
          if (productIds.has(productId)) throw new Error('Duplicate product across pages; rerun snapshot');
          productIds.add(productId);
          const t = (p.total_performance ?? {}) as Rec;
          const at = (p.affiliate_total_performance ?? {}) as Rec;
          const av = (p.affiliate_video_performance ?? {}) as Rec;
          const al = (p.affiliate_live_performance ?? {}) as Rec;
          const st = (p.shop_tab_performance ?? {}) as Rec;
          return {
            run_id: runId, brand_slug: conn.brandSlug, report_date: reportDate,
            product_id: productId, product_name: titles.get(productId) ?? null,
            total_gmv: money(t.gmv),
            affiliate_total_gmv: money(at.attributed_gmv),
            affiliate_video_gmv: money(av.attributed_video_gmv),
            affiliate_live_gmv: money(al.live_attributed_gmv),
            shop_tab_gmv: money(st.shop_tab_gmv),
            // ⚠️ REFUNDS ARE ALL-CHANNEL ONLY. affiliate_total_performance has no
            // refund field of any kind, so the affiliate figure the export
            // carries ($1,220.03 vs this $5,954.57) has NO exact API source and
            // is deliberately absent rather than approximated.
            refunds_all_channel: money(t.refunds),
            refunded_items_all_channel: num(t.refunded_items),
            refund_customers_all_channel: num(t.refund_customers),
            // The AFFILIATE counterparts, from the affiliate block. The first
            // run read these from total_performance and so reported 1,032
            // orders against the export's 568.
            affiliate_orders: num(at.attributed_orders),
            affiliate_items_sold: num(at.attributed_sold_items),
            affiliate_sku_orders: num(at.attributed_sku_orders),
            affiliate_impressions: num(at.product_impressions),
            affiliate_clicks: num(at.product_clicks),
            affiliate_ctr: num(at.ctr), affiliate_aov: money(at.aov),
            affiliate_estimated_customers: num(at.estimated_customers),
            // All-channel, kept because they are real and useful on their own.
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
      }
    }

    // ── 3. Complete video inventory, including zero/unknown-performance posts.
    //    Pagination keys on the token, NEVER on page fullness: TikTok returns
    //    short pages mid-sequence, so stopping at the first non-full page would
    //    silently capture a fraction of the day and report success.
    const videos: ListedVideo[] = [];
    {
      const ids = new Set<string>();
      for await (const page of pages(async token => {
        const res = await conn.client.get<Rec>(
          `/analytics/${VIDEO_VERSION}/shop_videos/performance`,
          { ...window, page_size: String(PAGE_SIZE), account_type: 'AFFILIATE_ACCOUNTS',
            ...(token ? { page_token: token } : {}) },
        );
        out.apiCalls++;
        return res.data;
      }, 'videos', MAX_PAGES)) {
        const inventory = page.rows.map(raw => {
          const v = listedVideo(raw);
          if (ids.has(v.id)) throw new Error('Duplicate video across inventory pages; rerun the snapshot');
          ids.add(v.id); videos.push(v);
          return {
            run_id: runId, video_id: v.id, brand_slug: conn.brandSlug, report_date: reportDate,
            creator_name: v.username.toLowerCase() || null, creator_open_id: v.creatorOpenId,
            video_title: v.title || null,
            post_time_raw: v.postTime, post_time_zone: null,
            seller_video_gmv: v.gmv, affiliate_video_gmv: null, views: num(raw.views),
            source_version: VIDEO_VERSION, source_account_type: 'AFFILIATE_ACCOUNTS', raw_video: raw,
          };
        });
        if (inventory.length) {
          const { error } = await supabase.from('api_shadow_content_inventory')
            .upsert(inventory, { onConflict: 'run_id,video_id' });
          if (error) throw new Error(`inventory write failed: ${error.message}`);
        }
        out.videosListed = videos.length;
      }
      out.inventoryComplete = true;
    }

    // ── 4. Bounded detail window; sales never determine content eligibility.
    const targets = detailTargets(videos, limitDetail, detailOffset);
    const byCreator = new Map<string, {
      gmv: number | null; items: number | null; customers: number | null; views: number | null; likes: number | null;
      comments: number | null; shares: number | null; impressions: number | null; clicks: number | null; videos: number;
    }>();

    for (const v of targets) {
      const res = await conn.client.get<Rec>(
        `/analytics/${VIDEO_DETAIL_VERSION}/shop_videos/${encodeURIComponent(v.id)}/performance`,
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
        post_date: explicitInstant(v.postTime), post_time_raw: v.postTime,
        gmv: null, seller_video_gmv: money(overall.gmv), affiliate_video_gmv: null,
        items_sold: num(overall.items_sold),
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
        post_date: videoRow.post_date, post_time_raw: v.postTime,
        gmv: null, seller_video_gmv: money(b.gmv), affiliate_video_gmv: null,
        items_sold: num(b.items_sold), customers: num(b.customers),
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
      // Unknown creators remain in inventory; never merge them into one fake creator.
      if (!key) { await sleep(PACE_MS); continue; }
      const acc = byCreator.get(key) ?? {
        gmv: 0, items: 0, customers: 0, views: 0, likes: 0,
        comments: 0, shares: 0, impressions: 0, clicks: 0, videos: 0,
      };
      acc.gmv = addKnown(acc.gmv, money(overall.gmv));
      acc.items = addKnown(acc.items, num(overall.items_sold));
      acc.customers = null; // Unique customers are not additive across videos.
      acc.views = addKnown(acc.views, num(traffic.views));
      acc.likes = addKnown(acc.likes, num(traffic.likes));
      acc.comments = addKnown(acc.comments, num(traffic.comments));
      acc.shares = addKnown(acc.shares, num(traffic.shares));
      acc.impressions = addKnown(acc.impressions, num(overall.product_impressions));
      acc.clicks = addKnown(acc.clicks, num(overall.product_clicks));
      acc.videos += (money(overall.gmv) ?? 0) > 0 ? 1 : 0;
      byCreator.set(key, acc);

      await sleep(PACE_MS);
    }

    // ── 5. Creator roll-up, derived from the video detail.
    if (byCreator.size > 0) {
      const rows = [...byCreator.entries()].map(([creator, a]) => ({
        run_id: runId, brand_slug: conn.brandSlug, report_date: reportDate,
        creator_name: creator, video_gmv: null, seller_video_gmv: a.gmv,
        affiliate_video_gmv: null, items_sold: a.items, customers: a.customers,
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
    const capped = out.videosDetailed !== videos.length;
    return finish(capped ? 'partial' : 'ok', capped
      ? `inventory complete; details ${out.videosDetailed}/${videos.length} (offset ${detailOffset}, limit ${limitDetail}); creator metrics incomplete`
      : null);
  } catch (e) {
    const te = e instanceof TikTokError ? e : null;
    return finish('failed', te
      ? `${te.constructor.name} status=${te.status} code=${te.code ?? '—'}: ${te.message}`
      : e instanceof Error ? e.message : String(e));
  }
}
