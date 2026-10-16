import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope, isBrandInScope } from '@/lib/auth/workspace-scope';
import { reportGuard, clientReportContext, getClientReportRegistry } from '@/lib/auth/client-report-access';
import { createAdminClient } from '@/lib/supabase/server';
import { buildClientReportSnapshot } from '@/lib/data/client-reports';

export const maxDuration = 180;
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({error:'Unauthorized'}, {status:401});
  const denied = reportGuard(scope,'write'); if (denied) return denied;
  const page = Number(req.nextUrl.searchParams.get('page') ?? 0);
  if (!Number.isSafeInteger(page) || page < 0 || page > 10000) return NextResponse.json({error:'Invalid page'}, {status:400});
  const admin = await createAdminClient();
  const registry = await getClientReportRegistry(scope);
  const brands = registry.rows.filter(b=>isBrandInScope(scope,b)).map(b=>b.slug);
  if (!brands.length) return NextResponse.json({drafts:[],total:0});
  const {data,error,count} = await admin.from('client_report_backfill_drafts')
    .select('id,brand_slug,report_type,period_start,period_end,recorded_days,expected_days,status,error,generated_at',{count:'exact'})
    .eq('tenant_id',scope.tenantId).in('brand_slug',brands)
    .order('period_end',{ascending:false}).order('brand_slug').order('id').range(page*50,page*50+49);
  if (error) return NextResponse.json({error:'Could not load historical drafts.'},{status:503});
  return NextResponse.json({drafts:data,total:count},{headers:{'Cache-Control':'private, no-store'}});
}

export async function POST(req: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope) return NextResponse.json({error:'Unauthorized'},{status:401});
  const denied = reportGuard(scope,'write'); if (denied) return denied;
  let body: {action?:string;id?:string};
  try { body=await req.json(); } catch { return NextResponse.json({error:'Invalid request'},{status:400}); }
  const admin=await createAdminClient();
  if (body.action==='prepare') {
    const registry=await getClientReportRegistry(scope);
    const brands=registry.rows.filter(b=>!b.parent_brand_id && isBrandInScope(scope,b)).map(b=>b.slug);
    const {data,error}=await admin.rpc('prepare_report_backfill',{p_tenant:scope.tenantId,p_brands:brands});
    return error ? NextResponse.json({error:'Could not prepare the historical queue.'},{status:503}) : NextResponse.json({added:data});
  }
  if (body.action!=='build' || !body.id || !/^[a-f0-9-]{36}$/.test(body.id)) return NextResponse.json({error:'Invalid request'},{status:400});
  const {data:row,error:readError}=await admin.from('client_report_backfill_drafts').select('*').eq('tenant_id',scope.tenantId).eq('id',body.id).maybeSingle();
  if (readError) return NextResponse.json({error:'Could not read draft.'},{status:503});
  if (!row || !isBrandInScope(scope,{slug:row.brand_slug})) return NextResponse.json({error:'Not found'},{status:404});
  if (row.status==='review') return NextResponse.json({status:'review'});
  if (row.status==='building' && Date.parse(row.updated_at)>Date.now()-240000) return NextResponse.json({error:'This draft is already building.'},{status:409});
  const stamp=new Date().toISOString();
  const {data:claimed,error:claimError}=await admin.from('client_report_backfill_drafts').update({status:'building',updated_at:stamp,error:null})
    .eq('tenant_id',scope.tenantId).eq('id',row.id).eq('updated_at',row.updated_at).select('id').maybeSingle();
  if(claimError || !claimed) return NextResponse.json({error:'Draft changed. Try again.'},{status:409});
  try {
    const context=await clientReportContext(scope,row.brand_slug);
    const build=await buildClientReportSnapshot(row.brand_slug,{start:row.period_start,end:row.period_end},context,admin,row.report_type,true);
    const {error}=await admin.from('client_report_backfill_drafts').update({snapshot:build,status:'review',generated_at:new Date().toISOString(),updated_at:new Date().toISOString()})
      .eq('tenant_id',scope.tenantId).eq('id',row.id).eq('updated_at',stamp);
    if(error) throw Error('Draft could not be saved.');
    return NextResponse.json({status:'review'});
  } catch {
    await admin.from('client_report_backfill_drafts').update({status:'failed',error:'Generation failed. Retry this draft.',updated_at:new Date().toISOString()}).eq('tenant_id',scope.tenantId).eq('id',row.id).eq('updated_at',stamp);
    return NextResponse.json({error:'Generation failed. Existing reports are unchanged.'},{status:503});
  }
}
