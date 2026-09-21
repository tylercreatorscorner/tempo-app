import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { can } from '@/lib/auth/permissions';
import { createAdminClient } from '@/lib/supabase/server';
import { normalizeCreatorTag } from '@/lib/roster/creator-tags';

export async function GET(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope || !can(scope, 'roster', 'read')) return NextResponse.json({error:'Not permitted'}, {status:403});
  const brand = request.nextUrl.searchParams.get('brand');
  if (!brand || brand === 'all' || (scope.brandScope.kind === 'scoped' && !scope.brandScope.brandSlugs.includes(brand))) return NextResponse.json({error:'Choose an accessible brand'}, {status:400});
  const db = await createAdminClient();
  const tags = new Set<string>();
  for (let from=0;;from+=1000) {
    const {data,error} = await db.from('managed_creators').select('tags').eq('tenant_id',scope.tenantId).eq('brand',brand).is('archived_at',null).order('id').range(from,from+999);
    if (error) return NextResponse.json({error:'Could not load tags'}, {status:500});
    for (const row of data ?? []) for (const value of row.tags ?? []) { const tag=normalizeCreatorTag(value); if(tag) tags.add(tag); }
    if (!data || data.length<1000) break;
  }
  return NextResponse.json({tags:[...tags].sort(),canWrite:!scope.impersonating && can(scope,'roster','write')});
}

export async function POST(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!scope || scope.impersonating || !can(scope,'roster','write')) return NextResponse.json({error:'Not permitted'}, {status:403});
  const body = await request.json().catch(()=>null);
  const tag = normalizeCreatorTag(body?.tag);
  if (!body || !tag || !['add','remove'].includes(body.action) || typeof body.brand !== 'string' || body.brand==='all' || !Array.isArray(body.ids) || !body.ids.length || body.ids.length>100 || body.ids.some((id:unknown)=>!Number.isSafeInteger(id) || Number(id)<=0)) return NextResponse.json({error:'Choose up to 100 creators, a brand and a tag (1–40 characters, no commas).'}, {status:400});
  if (scope.brandScope.kind==='scoped' && !scope.brandScope.brandSlugs.includes(body.brand)) return NextResponse.json({error:'Brand not in your access'}, {status:403});
  const ids = [...new Set<number>(body.ids)];
  const db = await createAdminClient();
  const {data:rows,error} = await db.from('managed_creators').select('id,tags').eq('tenant_id',scope.tenantId).eq('brand',body.brand).is('archived_at',null).in('id',ids);
  if (error) return NextResponse.json({error:'Could not load selected creators'}, {status:500});
  // Validate the complete set before changing any row. Never silently accept foreign IDs.
  if (!rows || rows.length!==ids.length) return NextResponse.json({error:'Selection is no longer available in this brand. Refresh and select again.'}, {status:409});
  const updated:number[]=[]; const failed:number[]=[];
  for (const row of rows) {
    const before:string[] = row.tags ?? [];
    const remaining=before.filter(t=>normalizeCreatorTag(t)!==tag);
    const after=body.action==='add'?[...remaining,tag]:remaining;
    if (after.length>30) { failed.push(row.id); continue; }
    if (JSON.stringify(before)===JSON.stringify(after)) { updated.push(row.id); continue; }
    // Compare-and-set prevents replacing concurrent edits. Add/remove is safe to retry.
    let write=db.from('managed_creators').update({tags:after,updated_by:scope.email}).eq('id',row.id).eq('tenant_id',scope.tenantId).eq('brand',body.brand).is('archived_at',null);
    write=row.tags===null?write.is('tags',null):write.eq('tags',`{${row.tags.map((t:string)=>JSON.stringify(t)).join(',')}}`);
    const result=await write.select('id');
    if(result.error || result.data?.length!==1) failed.push(row.id); else updated.push(row.id);
  }
  return NextResponse.json({updated,failed,error:failed.length?'Some creators could not be updated. Refresh and retry the remaining selection.':null}, {status:failed.length?409:200});
}
