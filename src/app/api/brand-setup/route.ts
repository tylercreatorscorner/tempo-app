import {NextRequest,NextResponse} from 'next/server';
import {getWorkspaceScope} from '@/lib/auth/workspace-scope';
import {createAdminClient} from '@/lib/supabase/server';
import {canOpenBrandSetup,canManageBrandSetup,canReadBrandSetup} from '@/lib/brands/setup-access';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const scope=await getWorkspaceScope();if(!canOpenBrandSetup(scope))return NextResponse.json({error:'Forbidden'},{status:403});
 const db=await createAdminClient();
 let query=db.from('brands_v2').select('id,tenant_id,slug,name,display_name,logo_url,color,discord_guild_id,is_archived').eq('tenant_id',scope!.tenantId).eq('is_archived',false).order('name');
 if(scope!.brandScope.kind==='scoped')query=query.in('id',scope!.brandScope.brandIds);
 const {data:brands,error}=await query;if(error)return NextResponse.json({error:'Brands could not be loaded.'},{status:503});
 const manage=canManageBrandSetup(scope);
 const {data:assignments,error:assignmentError}=await db.from('brand_manager_assignments').select('brand_id,manager_user_id').in('brand_id',(brands??[]).map(b=>b.id));
 let people=db.from('user_profiles').select('user_id,name,email').eq('tenant_id',scope!.tenantId).eq('status','active').in('role',['owner','admin','manager']).order('name');
 if(!manage)people=people.in('user_id',(assignments??[]).map(a=>a.manager_user_id));
 const {data:managers,error:managerError}=await people;
 if(assignmentError||managerError)return NextResponse.json({error:'Manager assignments could not be loaded.'},{status:503});
 const selected=brands?.find(b=>b.id===req.nextUrl.searchParams.get('id'));
 let imports:Record<string,string|null>|null=null;
 if(selected && canReadBrandSetup(scope,selected)){
  const tables=['creator_performance','video_performance','product_performance'];
  // Product exports are legacy global-slug records. The selected slug is resolved
  // from this tenant's authorized brand registry before querying that table.
  const checks=await Promise.all(tables.map(table=>{let source=db.from(table).select('report_date').eq('brand',selected.slug);if(table!=='product_performance')source=source.eq('tenant_id',scope!.tenantId);return source.order('report_date',{ascending:false}).limit(1);}));
  if(checks.some(r=>r.error))return NextResponse.json({error:'Import status could not be verified.'},{status:503});
  imports=Object.fromEntries(tables.map((t,i)=>[t,checks[i].data?.[0]?.report_date??null]));
 }
 return NextResponse.json({brands:(brands??[]).map(b=>{const managerId=assignments?.find(a=>a.brand_id===b.id)?.manager_user_id??null;return {...b,managerId,canInviteTeam:manage||managerId===scope!.userId,managerName:managers?.find(m=>m.user_id===managerId)?.name??null};}),managers:manage?managers??[]:[],manage,imports},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(req:NextRequest){
 const scope=await getWorkspaceScope();if(!canManageBrandSetup(scope))return NextResponse.json({error:'Forbidden'},{status:403});
 let body:{name?:string;slug?:string;managerId?:string;brandId?:string};try{body=await req.json();}catch{return NextResponse.json({error:'Invalid request.'},{status:400});}
 const name=typeof body.name==='string'?body.name.trim():'';
 const slug=typeof body.slug==='string'?body.slug.trim():'';
 if((!body.brandId && (!name||name.length>120||!/^[a-z0-9_]{1,80}$/.test(slug))) || (body.brandId&&!/^[a-f0-9-]{36}$/.test(body.brandId)) || (body.managerId&&!/^[a-f0-9-]{36}$/.test(body.managerId)))return NextResponse.json({error:'Check the brand name and manager.'},{status:400});
 const db=await createAdminClient();
 const {data,error}=await db.rpc('save_brand_setup',{p_tenant:scope!.tenantId,p_actor:scope!.userId,p_brand:body.brandId??null,p_name:name,p_slug:slug,p_manager:body.managerId||null});
 if(error)return NextResponse.json({error:error.code==='23505'?'This brand already exists. Open its setup instead.':'Brand and manager could not be saved. Check the manager and retry.'},{status:400});
 return NextResponse.json({id:data},{status:body.brandId?200:201});
}
