import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { fromZonedTime } from 'date-fns-tz';
import { requireAdmin } from '@/lib/auth/require-admin';
import { assertNotImpersonating } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@/lib/supabase/server';
import { getActiveConnection } from '@/lib/tiktok/connections';
import { fetchDailyExport, marketYesterday, COMPASS_MARKET_TIME_ZONE } from '@/lib/tiktok/compass';
import { readUploadWorkbook } from '@/lib/upload/read-workbook';
import { captureRecoveryPages, recoveryDateWindow } from '@/lib/tiktok/recovery-pages';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
const SOURCES = ['creator_compass', 'video_analytics', 'affiliate_orders'] as const;

/** Only diagnostic captures are written. No performance rows or reports change. */
export async function POST(request: Request) {
  const profile = await requireAdmin();
  if (!profile?.tenant_id) return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  try { await assertNotImpersonating(); } catch { return NextResponse.json({ error: 'Read-only preview.' }, { status: 403 }); }
  const body = await request.json().catch(() => null);
  if (!body || typeof body.brand !== 'string' || !SOURCES.includes(body.source)) {
    return NextResponse.json({ error: 'Choose a brand and supported recovery source.' }, { status: 400 });
  }
  const window = recoveryDateWindow(body.date, marketYesterday());
  if (!window) return NextResponse.json({ error: 'Choose a valid completed report date.' }, { status: 400 });
  const admin = await createAdminClient();
  const { data: brand, error: brandError } = await admin.from('brands_v2').select('slug')
    .eq('slug', body.brand).eq('tenant_id', profile.tenant_id).maybeSingle();
  if (brandError) return NextResponse.json({ error: 'Could not verify brand access.' }, { status: 500 });
  if (!brand) return NextResponse.json({ error: 'Brand is outside your workspace.' }, { status: 403 });
  const conn = await getActiveConnection(brand.slug);
  if (!conn.ok) return NextResponse.json({ error: conn.message, reason: conn.reason, needsReauthorization: conn.needsReauthorization }, { status: 409 });
  const runId = randomUUID();
  const source: typeof SOURCES[number] = body.source;
  const version = source === 'creator_compass' ? '202603' : source === 'video_analytics' ? '202605' : '202410';
  const endpoint = source === 'creator_compass' ? 'recovery/creator_compass' : source === 'video_analytics' ? '/analytics/202605/shop_videos/performance' : '/affiliate_seller/202410/orders/search';
  const params = { date: window.start, endDate: window.end, source };
  const store = async (page: number, token: string | null, data: Record<string, unknown>, rows: number | null, requestId: string | null, label = endpoint) => {
    const { error } = await admin.from('tiktok_api_captures').insert({ run_id: runId, brand_slug: brand.slug, endpoint: label,
      api_version: version, request_params: params, page_index: page, page_token: token, response: data, row_count: rows, request_id: requestId });
    if (error) throw new Error('The source response could not be saved. Capture was not completed.');
  };
  try {
    await store(0, null, { status: 'started', factsChanged: false }, null, null, `recovery/${source}/started`);
    let outcome: Record<string, unknown>;
    if (source === 'creator_compass') {
      const fetched = await fetchDailyExport(brand.slug, window.start, 'CREATOR', { client: conn.client, windowType: 'PAST_24H',
        poll: { budgetMs: 120_000, maxPolls: 20 },
        onTaskCreated: async (taskId, echo) => { await store(0,null,{ taskId, echo, status: 'pending' },null,null,'recovery/creator_compass/task'); },
      });
      if (!fetched.ok) {
        outcome = { status: fetched.stage === 'poll' ? 'pending' : 'failed', stage: fetched.stage, taskId: fetched.taskId, message: fetched.message };
      } else {
        const bytes = fetched.bytes.buffer.slice(fetched.bytes.byteOffset, fetched.bytes.byteOffset + fetched.bytes.byteLength) as ArrayBuffer;
        const workbook = readUploadWorkbook(bytes);
        const nameKey = Object.keys(workbook.rows[0] ?? {}).find(k => k.trim().toLowerCase() === 'creator name');
        if (!nameKey) throw new Error('Creator API returned an unrecognized workbook.');
        const rows = workbook.rows.filter(r => typeof r[nameKey] === 'string' && (r[nameKey] as string).trim());
        await store(0,null,{ rows, columns: Object.keys(workbook.rows[0] ?? {}), taskId: fetched.taskId, echo: fetched.echo, warnings: fetched.warnings },rows.length,null);
        outcome = { status: 'captured', rows: rows.length, pages: 1, taskId: fetched.taskId, columns: Object.keys(workbook.rows[0] ?? {}),
          message: 'Creator source captured separately. Field coverage, day boundaries and totals must be reconciled before restoration.' };
      }
    } else {
      const paging = await captureRecoveryPages({ rowKey: source === 'video_analytics' ? 'videos' : 'orders',
        fetchPage: token => source === 'video_analytics'
          ? conn.client.get(endpoint, { start_date_ge: window.start, end_date_lt: window.end, page_size: 100, account_type: 'AFFILIATE_ACCOUNTS', currency: 'USD', ...(token ? { page_token: token } : {}) })
          : conn.client.post(endpoint, { query: { page_size: 100, ...(token ? { page_token: token } : {}) }, idempotent: true,
            body: { create_time_ge: Math.floor(fromZonedTime(`${window.start}T00:00:00`,COMPASS_MARKET_TIME_ZONE).getTime()/1000),
              create_time_lt: Math.floor(fromZonedTime(`${window.end}T00:00:00`,COMPASS_MARKET_TIME_ZONE).getTime()/1000) } }),
        savePage: (page,token,data,rows,requestId) => store(page,token,data,rows,requestId),
      });
      outcome = { status: paging.exhausted ? 'captured' : 'partial', ...paging,
        message: source === 'video_analytics' ? 'Video metadata and activity candidate source. Seller analytics GMV is broader than affiliate GMV and cannot replace invoice figures.'
          : 'Affiliate order candidate source. Order line totals, cancellations and attribution timing require reconciliation before restoration.' };
    }
    const result = { runId, brand: brand.slug, date: window.start, source, factsChanged: false, ...outcome };
    await store(0,null,result,null,null,`recovery/${source}/manifest`);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Source capture failed.';
    await store(0,null,{ runId, brand: brand.slug, date: window.start, source, status: 'failed', message, factsChanged: false },null,null,`recovery/${source}/manifest`).catch(() => {});
    return NextResponse.json({ error: message, runId, source, factsChanged: false }, { status: 502, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
