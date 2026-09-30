import { NextRequest, NextResponse } from 'next/server';
import { guardScreen } from '@/lib/auth/require-screen';
import { can } from '@/lib/auth/permissions';
import { createAdminClient } from '@/lib/supabase/server';
import { validWeek, sundayToday } from '@/lib/coaching/model';
import { shiftDay, summarizeWeek, compareWeeks, type EliteRow } from '@/lib/coaching/elite';
import type { HistoryDay } from '@/lib/data/creator-performance-history-model';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const scope = await guardScreen('reporting');
  if (scope instanceof NextResponse) return scope;
  if (scope.impersonating || !['owner','admin','manager','coach'].includes(scope.role) || !can(scope,'roster','read')) return NextResponse.json({error:'Not permitted'}, {status:403});
  const week = req.nextUrl.searchParams.get('week') ?? shiftDay(sundayToday(), -7);
  if (!validWeek(week) || week >= sundayToday()) return NextResponse.json({error:'Choose a completed Sunday-to-Saturday week.'}, {status:400});
  const selection = req.nextUrl.searchParams.get('brand') ?? 'all';
  try {
    const db = await createAdminClient();
    let brandQuery = db.from('brands_v2').select('id,slug,display_name,name').eq('tenant_id',scope.tenantId).eq('is_archived',false).order('name');
    if (scope.brandScope.kind === 'scoped') {
      if (!scope.brandScope.brandIds.length) return selection === 'all'
        ? NextResponse.json({selection,brands:[],week,end:shiftDay(week,6),previousStart:shiftDay(week,-7),rows:[],unmatched:0},{headers:{'Cache-Control':'private, no-store'}})
        : NextResponse.json({error:'Brand is not in your access.'},{status:403});
      brandQuery = brandQuery.in('id',scope.brandScope.brandIds);
    }
    const registry = await brandQuery;
    if (registry.error) throw new Error('registry');
    const brands = (registry.data ?? []).filter(b=>!!b.slug).map(b=>({slug:b.slug!,name:b.display_name || b.name}));
    if (selection !== 'all' && !brands.some(b=>b.slug===selection)) return NextResponse.json({error:'Brand is not in your access.'},{status:403});
    const selected = selection === 'all' ? brands : brands.filter(b=>b.slug===selection);
    if (!selected.length) return NextResponse.json({selection,brands,week,end:shiftDay(week,6),previousStart:shiftDay(week,-7),rows:[],unmatched:0},{headers:{'Cache-Control':'private, no-store'}});
    const members = await db.from('managed_creators').select('creator_id,brand,real_name,discord_avatar',{count:'exact'}).eq('tenant_id',scope.tenantId).in('brand',selected.map(b=>b.slug)).is('archived_at',null).contains('tags',['elite']).order('id').limit(251);
    if (members.error) throw new Error('cohort');
    if ((members.count ?? 0)>250) return NextResponse.json({error:'This selection has more than 250 Elite partnerships. Choose a brand to narrow the brief.',brands},{status:413});
    if (members.count !== members.data?.length) throw new Error('cohort');
    const roster = [...new Map((members.data ?? []).filter(r=>r.creator_id).map(r=>[`${r.brand}:${r.creator_id}`,r])).values()];
    const creatorIds = [...new Set(roster.map(r=>r.creator_id!))];
    const accounts = creatorIds.length ? await db.from('tiktok_accounts').select('creator_id,tiktok_username',{count:'exact'}).eq('tenant_id',scope.tenantId).in('creator_id',creatorIds).limit(10001) : {data:[],error:null,count:0};
    if (accounts.error || accounts.count !== accounts.data?.length || (accounts.count ?? 0)>10000) throw new Error('accounts');
    const start = shiftDay(week,-7), end = shiftDay(week,6);
    const rows: EliteRow[] = [];
    // Bounded concurrency on the existing indexed, read-only history RPC.
    for(let offset=0;offset<roster.length;offset+=8) {
      if(req.signal.aborted) throw new Error('Request cancelled');
      rows.push(...await Promise.all(roster.slice(offset,offset+8).map(async creator => {
        const handles = [...new Set((accounts.data ?? []).filter(a=>a.creator_id===creator.creator_id).map(a=>String(a.tiktok_username ?? '').replace(/^@/,'').trim().toLowerCase()).filter(Boolean))];
        let history: HistoryDay[] = [];
        if(handles.length && handles.length<=100) {
          try {
            const response = await db.rpc('get_creator_performance_history',{p_tenant_id:scope.tenantId,p_handles:handles,p_brands:[creator.brand],p_start:start,p_end:end}).abortSignal(AbortSignal.any([req.signal, AbortSignal.timeout(15000)]));
            if(!response.error && Array.isArray(response.data) && response.data.length===14 && response.data.every((r: HistoryDay,i:number)=>r.stat_date===shiftDay(start,i))) history=response.data;
          } catch { /* Keep unavailable data distinct from zero. */ }
        }
        const currentDays=history.slice(7), current=summarizeWeek(currentDays), previous=summarizeWeek(history.slice(0,7));
        return {id:creator.creator_id!,brand:creator.brand,brandName:brands.find(b=>b.slug===creator.brand)?.name ?? creator.brand,name:creator.real_name || 'Creator',avatar:creator.discord_avatar,current,previous,change:compareWeeks(current,previous),days:currentDays,unavailable:history.length!==14};
      })));
    }
    rows.sort((a,b)=>(b.current.gmv.value ?? -1)-(a.current.gmv.value ?? -1));
    return NextResponse.json({selection,brands,week,end,previousStart:start,rows,unmatched:(members.data ?? []).filter(r=>!r.creator_id).length},{headers:{'Cache-Control':'private, no-store'}});
  } catch { return NextResponse.json({error:'The Elite brief could not be loaded. Please retry.'},{status:503}); }
}
