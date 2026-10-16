import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { fromZonedTime } from 'date-fns-tz';
import { requireAdmin } from '@/lib/auth/require-admin';
import { assertNotImpersonating } from '@/lib/auth/platform-admin';
import { createAdminClient } from '@/lib/supabase/server';
import { getActiveConnection } from '@/lib/tiktok/connections';
import { downloadTaskFile, fetchDailyExport, marketYesterday, type FetchDailyExportResult } from '@/lib/tiktok/compass';
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
  // The Affiliate Center explicitly labels exports GMT-08:00. Pacific daylight
  // time is GMT-07:00 in summer, so preserve and test these windows separately.
  const orderTimeZone = body.orderTimeZone ?? 'Etc/GMT+8';
  if (!['Etc/GMT+8','America/Los_Angeles'].includes(orderTimeZone)) return NextResponse.json({ error: 'Unsupported order report timezone.' }, { status: 400 });
  const admin = await createAdminClient();
  const { data: brand, error: brandError } = await admin.from('brands_v2').select('slug')
    .eq('slug', body.brand).eq('tenant_id', profile.tenant_id).maybeSingle();
  if (brandError) return NextResponse.json({ error: 'Could not verify brand access.' }, { status: 500 });
  if (!brand) return NextResponse.json({ error: 'Brand is outside your workspace.' }, { status: 403 });
  const conn = await getActiveConnection(brand.slug);
  if (!conn.ok) return NextResponse.json({ error: conn.message, reason: conn.reason, needsReauthorization: conn.needsReauthorization }, { status: 409 });
  if (body.resumeRunId !== undefined && (typeof body.resumeRunId !== 'string' || !/^[0-9a-f-]{36}$/.test(body.resumeRunId))) return NextResponse.json({error:'Invalid recovery capture.'},{status:400});
  const runId: string = body.resumeRunId ?? randomUUID();
  const source: typeof SOURCES[number] = body.source;
  const version = source === 'creator_compass' ? '202603' : source === 'video_analytics' ? '202605' : '202410';
  const endpoint = source === 'creator_compass' ? 'recovery/creator_compass' : source === 'video_analytics' ? '/analytics/202605/shop_videos/performance' : '/affiliate_seller/202410/orders/search';
  const orderBounds = { create_time_ge: Math.floor(fromZonedTime(`${window.start}T00:00:00`,orderTimeZone).getTime()/1000),
    create_time_lt: Math.floor(fromZonedTime(`${window.end}T00:00:00`,orderTimeZone).getTime()/1000) };
  const accountType = body.videoAccountType ?? 'AFFILIATE_ACCOUNTS';
  if (!['ALL','AFFILIATE_ACCOUNTS'].includes(accountType)) return NextResponse.json({error:'Unsupported video account filter.'},{status:400});
  const params = { date: window.start, endDate: window.end, source, ...(source === 'video_analytics' ? {accountType} : {}),
    ...(source === 'affiliate_orders' ? { orderTimeZone, ...orderBounds } : { timeZone: 'provider_registered_timezone' }) };
  const store = async (page: number, token: string | null, data: Record<string, unknown>, rows: number | null, requestId: string | null, label = endpoint) => {
    const payload = { run_id: runId, brand_slug: brand.slug, endpoint: label,
      api_version: version, request_params: params, page_index: page, page_token: token, response: data, row_count: rows, request_id: requestId };
    const table = admin.from('tiktok_api_captures');
    const { error } = label.endsWith('/manifest') ? await table.upsert(payload,{onConflict:'run_id,endpoint,api_version,page_index'}) : await table.insert(payload);
    if (error) throw new Error('The source response could not be saved. Capture was not completed.');
  };
  try {
    let resume: {page_index:number;row_count:number;continuation:string|null;total:string|null}[] = [];
    if (body.resumeRunId) {
      if (source === 'creator_compass') return NextResponse.json({error:'Retry the creator source using its saved task.'},{status:400});
      const {data: original,error: originalError} = await admin.from('tiktok_api_captures').select('request_params')
        .eq('run_id',runId).eq('brand_slug',brand.slug).eq('endpoint',`recovery/${source}/started`).maybeSingle();
      const prior = original?.request_params;
      if (originalError || !prior || prior.date !== window.start || prior.source !== source ||
        (source === 'affiliate_orders' && prior.orderTimeZone !== orderTimeZone) ||
        (source === 'video_analytics' && (prior.accountType ?? 'AFFILIATE_ACCOUNTS') !== accountType)) {
        return NextResponse.json({error:'This capture does not match the authorized brand, day and source settings.'},{status:403});
      }
      const {data: saved,error: savedError} = await admin.from('tiktok_api_captures')
        .select('page_index,row_count,continuation:response->>next_page_token,total:response->>total_count')
        .eq('run_id',runId).eq('brand_slug',brand.slug).eq('endpoint',endpoint).order('page_index').limit(501);
      if (savedError) throw new Error('Saved recovery pages could not be read.');
      resume = saved ?? [];
      if (!resume.length || resume.length >= 500 || resume.some((p,i)=>p.page_index !== i || !Number.isInteger(p.row_count) || p.row_count<0) || !resume.at(-1)?.continuation) {
        return NextResponse.json({error:'This capture has no continuation available. Its saved pages remain separate for review.'},{status:409});
      }
    } else await store(0, null, { status: 'started', factsChanged: false }, null, null, `recovery/${source}/started`);
    let outcome: Record<string, unknown>;
    if (source === 'creator_compass') {
      const {data: previousTask,error: taskReadError} = await admin.from('tiktok_api_captures').select('response,captured_at')
        .eq('brand_slug',brand.slug).eq('endpoint','recovery/creator_compass/task').eq('request_params->>date',window.start)
        .gte('captured_at',new Date(Date.now()-24*60*60*1000).toISOString()).order('captured_at',{ascending:false}).limit(1).maybeSingle();
      if (taskReadError) throw new Error('Saved creator task could not be read.');
      const taskCreatedAt = previousTask?.response?.taskCreatedAt ?? previousTask?.captured_at;
      const savedTaskId = typeof taskCreatedAt==='string' && Date.parse(taskCreatedAt)>Date.now()-24*60*60*1000 ? previousTask?.response?.taskId : null;
      let fetched: FetchDailyExportResult;
      if (typeof savedTaskId === 'string' && savedTaskId) {
        await store(0,null,{taskId:savedTaskId,taskCreatedAt,status:'reusing'},null,null,'recovery/creator_compass/task');
        try {
          const download = await downloadTaskFile(conn.client,savedTaskId);
          fetched = download.ok ? {ok:true,taskId:savedTaskId,...download.result,polls:0,elapsedMs:0,warnings:['Reused the saved task for this brand/day.']}
            : {ok:false,stage:'download',taskId:savedTaskId,message:download.message,format:download.format};
        } catch(error) { fetched={ok:false,stage:'download',taskId:savedTaskId,message:error instanceof Error?error.message:'Creator download failed.',format:null}; }
      } else fetched = await fetchDailyExport(brand.slug, window.start, 'CREATOR', { client: conn.client, windowType: 'PAST_24H',
        poll: { budgetMs: 120_000, maxPolls: 20 },
        onTaskCreated: async (taskId, echo) => { await store(0,null,{ taskId, echo, taskCreatedAt:new Date().toISOString(), status: 'pending' },null,null,'recovery/creator_compass/task'); },
      });
      if (!fetched.ok) {
        outcome = { status: fetched.stage === 'poll' ? 'incomplete' : 'failed', stage: fetched.stage, taskId: fetched.taskId, message: fetched.message };
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
      const last = resume.at(-1);
      const totals = resume.map(p=>p.total === null ? null : Number(p.total));
      if (totals.some(n=>n!==null&&(!Number.isSafeInteger(n)||n<0)) || new Set(totals.filter(n=>n!==null)).size>1) throw new Error('Saved source totals are inconsistent.');
      const paging = await captureRecoveryPages({ rowKey: source === 'video_analytics' ? 'videos' : 'orders',
        pageOffset:resume.length,initialRows:resume.reduce((n,p)=>n+p.row_count,0),initialToken:last?.continuation??null,
        initialExpected:totals.find(n=>n!==null)??null,previousTokens:resume.flatMap(p=>p.continuation?[p.continuation]:[]),
        fetchPage: token => source === 'video_analytics'
          ? conn.client.get(endpoint, { start_date_ge: window.start, end_date_lt: window.end, page_size: 100, account_type: accountType, currency: 'USD', ...(token ? { page_token: token } : {}) })
          : conn.client.post(endpoint, { query: { page_size: 100, ...(token ? { page_token: token } : {}) }, idempotent: true,
            body: orderBounds }),
        savePage: (page,token,data,rows,requestId) => store(page,token,data,rows,requestId),
      });
      outcome = { status: paging.exhausted && paging.countsMatch !== false ? 'captured' : 'partial', ...paging,
        message: paging.countsMatch === false ? `Retrieved ${paging.rows} records, but TikTok reported ${paging.expected}. The source discrepancy remains unresolved; records are saved separately.`
          : source === 'video_analytics' ? 'Video metadata and activity candidate source. Seller analytics GMV is broader than affiliate GMV and cannot replace invoice figures.'
          : 'Affiliate order candidate source. Order line totals, cancellations and attribution timing require reconciliation before restoration.' };
    }
    const result = { runId, brand: brand.slug, date: window.start, source, ...(source === 'video_analytics' ? {accountType} : {}),
      timeZone: source === 'affiliate_orders' ? orderTimeZone : 'provider_registered_timezone', factsChanged: false, ...outcome };
    await store(0,null,result,null,null,`recovery/${source}/manifest`);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Source capture failed.';
    await store(0,null,{ runId, brand: brand.slug, date: window.start, source, status: 'failed', message, factsChanged: false },null,null,`recovery/${source}/manifest`).catch(() => {});
    return NextResponse.json({ error: message, runId, source, factsChanged: false }, { status: 502, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
