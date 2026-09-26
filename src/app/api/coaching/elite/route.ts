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
  const brand = 'jiyu'; // Explicit pilot scope; never inferred from a client-supplied creator ID.
  if (scope.brandScope.kind === 'scoped' && !scope.brandScope.brandSlugs.includes(brand)) return NextResponse.json({error:'JiYu is not in your brand access.'},{status:403});
  try {
    const db = await createAdminClient();
    const registry = await db.from('brands_v2').select('id,tenant_id,display_name,name,is_archived').eq('slug',brand);
    if (registry.error) throw new Error('registry');
    if (registry.data?.length !== 1 || registry.data[0].tenant_id !== scope.tenantId || registry.data[0].is_archived) return NextResponse.json({error:'Brand unavailable.'},{status:403});
    const members = await db.from('managed_creators').select('creator_id,real_name,discord_avatar',{count:'exact'}).eq('tenant_id',scope.tenantId).eq('brand',brand).is('archived_at',null).contains('tags',['elite']).order('id').limit(101);
    if (members.error || members.count !== members.data?.length || (members.count ?? 0)>100) throw new Error('cohort');
    const roster = [...new Map((members.data ?? []).filter(r=>r.creator_id).map(r=>[r.creator_id!,r])).values()];
    const accounts = roster.length ? await db.from('tiktok_accounts').select('creator_id,tiktok_username',{count:'exact'}).eq('tenant_id',scope.tenantId).in('creator_id',roster.map(r=>r.creator_id!)).limit(10001) : {data:[],error:null,count:0};
    if (accounts.error || accounts.count !== accounts.data?.length || (accounts.count ?? 0)>10000) throw new Error('accounts');
    const start = shiftDay(week,-7), end = shiftDay(week,6);
    const rows: EliteRow[] = [];
    // Bounded concurrency on the existing indexed, read-only history RPC.
    for(let offset=0;offset<roster.length;offset+=4) {
      if(req.signal.aborted) throw new Error('Request cancelled');
      rows.push(...await Promise.all(roster.slice(offset,offset+4).map(async creator => {
        const handles = [...new Set((accounts.data ?? []).filter(a=>a.creator_id===creator.creator_id).map(a=>String(a.tiktok_username ?? '').replace(/^@/,'').trim().toLowerCase()).filter(Boolean))];
        let history: HistoryDay[] = [];
        if(handles.length && handles.length<=100) {
          try {
            const response = await db.rpc('get_creator_performance_history',{p_tenant_id:scope.tenantId,p_handles:handles,p_brands:[brand],p_start:start,p_end:end}).abortSignal(AbortSignal.any([req.signal, AbortSignal.timeout(15000)]));
            if(!response.error && Array.isArray(response.data) && response.data.length===14 && response.data.every((r: HistoryDay,i:number)=>r.stat_date===shiftDay(start,i))) history=response.data;
          } catch { /* Keep unavailable data distinct from zero. */ }
        }
        const currentDays=history.slice(7), current=summarizeWeek(currentDays), previous=summarizeWeek(history.slice(0,7));
        return {id:creator.creator_id!,name:creator.real_name || 'Creator',avatar:creator.discord_avatar,current,previous,change:compareWeeks(current,previous),days:currentDays,unavailable:history.length!==14};
      })));
    }
    rows.sort((a,b)=>(b.current.gmv.value ?? -1)-(a.current.gmv.value ?? -1));
    return NextResponse.json({brand:registry.data[0].display_name || registry.data[0].name,week,end,previousStart:start,rows,unmatched:(members.data ?? []).filter(r=>!r.creator_id).length},{headers:{'Cache-Control':'private, no-store'}});
  } catch { return NextResponse.json({error:'The Elite brief could not be loaded. Please retry.'},{status:503}); }
}
