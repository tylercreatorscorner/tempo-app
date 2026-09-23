import {NextRequest,NextResponse} from 'next/server';
import {getWorkspaceScope} from '@/lib/auth/workspace-scope';
import {createAdminClient} from '@/lib/supabase/server';
import {canReviewDiscordRoles} from '@/lib/roster/discord-reconciliation-access';
import {normalizeCreatorTag} from '@/lib/roster/creator-tags';
import {JIYU_ROLE,resolveIdentities,memberState} from '@/lib/roster/discord-reconciliation';
export const maxDuration=60;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:NextRequest){
 const scope=await getWorkspaceScope();
 if(!canReviewDiscordRoles(scope,request.nextUrl.searchParams.get('brand')))return reply({error:'This pilot is available to the configured JiYu operator.'},403);
 const token=process.env.DISCORD_TICKET_BOT_TOKEN;
 if(!token)return reply({error:'Discord connection is not configured.'},503);
 const db=await createAdminClient();
 // This first pass intentionally checks only Tempo-tagged creators. A complete
 // reverse inventory needs Discord member-list access, which the current bot lacks.
 const {data:rows,error}=await db.from('managed_creators').select('id,real_name,creator_id,discord_id,discord_user_id,tags').eq('tenant_id',scope!.tenantId).eq('brand',JIYU_ROLE.brand).is('archived_at',null).order('id').limit(1001);
 if(error)return reply({error:'Could not load Elite creators.'},500);
 if(!rows || rows.length>1000)return reply({error:'This pilot supports up to 1,000 active roster records. No partial comparison was produced.'},422);
 const creatorIds=[...new Set(rows.map(r=>r.creator_id).filter(Boolean))];
 const canonical=new Map<string,string|null>();
 if(creatorIds.length){
  const result=await db.from('creators_v2').select('id,discord_id').eq('tenant_id',scope!.tenantId).in('id',creatorIds);
  if(result.error)return reply({error:'Could not verify linked identities.'},500);
  for(const row of result.data??[])canonical.set(row.id,row.discord_id);
 }
 const eliteIds=new Set(rows.filter(r=>(r.tags??[]).some((t:string)=>normalizeCreatorTag(t)==='elite')).map(r=>r.id));
 if(eliteIds.size>100)return reply({error:'This pilot supports up to 100 Elite creators. No partial comparison was produced.'},422);
 const comparison=resolveIdentities(rows.map(r=>({...r,canonicalDiscordId:canonical.get(r.creator_id)||null}))).filter(r=>eliteIds.has(r.id));
 const deadline=Date.now()+40000;
 let rateLimited=false;
 async function discord(path:string){
  if(rateLimited || Date.now()>deadline)return null;
  try{
   const result=await fetch(`https://discord.com/api/v10${path}`,{headers:{Authorization:`Bot ${token}`},cache:'no-store',signal:AbortSignal.timeout(6000)});
   if(result.status===429)rateLimited=true;
   return {status:result.status,body:result.ok?await result.json():null};
  }catch{return null;}
 }
 const roles=await discord(`/guilds/${JIYU_ROLE.guildId}/roles`);
 const role=Array.isArray(roles?.body)?roles.body.find((r:{id:string})=>r.id===JIYU_ROLE.roleId):null;
 if(!role || role.name!==JIYU_ROLE.roleName || role.managed)return reply({error:'The JiYu Elites role could not be verified. No comparison was produced.'},503);
 let cursor=0;
 await Promise.all(Array.from({length:3},async()=>{
  while(cursor<comparison.length){
   const row=comparison[cursor++];
   if(!row.discordId)continue;
   const result=await discord(`/guilds/${JIYU_ROLE.guildId}/members/${row.discordId}`);
   row.state=memberState(result?.status??0,result?.body?.roles);
  }
 }));
 return reply({rows:comparison,checkedAt:new Date().toISOString(),roleName:JIYU_ROLE.roleName,reverseInventoryAvailable:false,rateLimited});
}
