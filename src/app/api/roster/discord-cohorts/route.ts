import {NextRequest,NextResponse} from 'next/server';
import {getWorkspaceScope} from '@/lib/auth/workspace-scope';
import {createAdminClient} from '@/lib/supabase/server';
import {canReadCohorts,canWriteCohorts} from '@/lib/roster/discord-cohort-access';
import {DiscordReadError,discordReader,readEliteInventory,reconcileElites,snowflake,identityClaims,type CohortIdentity,type DiscordRole} from '@/lib/roster/discord-cohort';
export const dynamic='force-dynamic';
export const maxDuration=60;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
async function readRoster(db:Awaited<ReturnType<typeof createAdminClient>>,tenant:string,brand:string){
 const roster:CohortIdentity[]=[];
 for(let from=0;from<=10000;from+=1000){
  const result=await db.from('managed_creators').select('id,real_name,creator_id,discord_id,discord_user_id,tags').eq('tenant_id',tenant).eq('brand',brand).is('archived_at',null).order('id').range(from,from+999);
  if(result.error)throw Error('Could not read the complete brand roster.');
  roster.push(...(result.data??[]).map(r=>({...r,canonicalDiscordId:null})));
  if((result.data?.length??0)<1000)break;
  if(from===10000)throw Error('This roster needs a background scan. No partial import was prepared.');
 }
 const ids=[...new Set(roster.map(r=>r.creator_id).filter((id):id is string=>!!id))];const canonical=new Map<string,string|null>();
 for(let offset=0;offset<ids.length;offset+=100){const result=await db.from('creators_v2').select('id,discord_id',{count:'exact'}).eq('tenant_id',tenant).in('id',ids.slice(offset,offset+100)).limit(101);if(result.error||result.count!==result.data?.length)throw Error('Could not verify creator identities.');for(const row of result.data??[])canonical.set(row.id,row.discord_id);}
 return roster.map(r=>({...r,creator_id:canonical.has(r.creator_id||'')?r.creator_id:null,canonicalDiscordId:canonical.get(r.creator_id||'')??null}));
}
async function context(){
 const scope=await getWorkspaceScope();
 if(!canReadCohorts(scope))return null;
 const db=await createAdminClient();
 let query=db.from('brands_v2').select('id,slug,name,display_name,discord_guild_id,parent_brand_id').eq('tenant_id',scope!.tenantId).eq('is_archived',false).is('parent_brand_id',null).order('name');
 if(scope!.brandScope.kind==='scoped')query=query.in('id',scope!.brandScope.brandIds.length?scope!.brandScope.brandIds:['00000000-0000-0000-0000-000000000000']);
 const brands=await query;
 if(brands.error)throw Error('Could not load accessible brands.');
 const ids=(brands.data??[]).map(b=>b.id);
 const assignments=ids.length?await db.from('brand_manager_assignments').select('brand_id,manager_user_id').in('brand_id',ids):{data:[],error:null};
 if(assignments.error)throw Error('Could not verify manager assignments.');
 return {scope:scope!,db,brands:(brands.data??[]).map(b=>({...b,name:b.display_name||b.name,canWrite:canWriteCohorts(scope,assignments.data?.find(a=>a.brand_id===b.id)?.manager_user_id??null)}))};
}
export async function GET(request:NextRequest){
 try{
  const ctx=await context();if(!ctx)return reply({error:'Not permitted'},403);
  const {scope,db,brands}=ctx;const slug=request.nextUrl.searchParams.get('brand');
  let selected=brands.find(b=>b.slug===slug)??(!slug?brands[0]:null);
  if(slug&&!selected)return reply({error:'Brand not in your access'},403);
  const configs=brands.length?await db.from('creator_role_sync_configs').select('brand_id,guild_id,role_id,role_name,revision').eq('tenant_id',scope.tenantId).in('brand_id',brands.map(b=>b.id)):{data:[],error:null};
  if(configs.error)throw Error('Discord cohort setup is not available yet.');
  if(!slug)selected=brands.find(b=>configs.data?.some(c=>c.brand_id===b.id))??selected;
  let run=null;let members:unknown[]=[];
  if(selected){
   const result=await db.from('creator_role_sync_runs').select('id,checked_at,applied_at,scanned,retained,missing_identities,actor_id,config_revision').eq('tenant_id',scope.tenantId).eq('brand_id',selected.id).order('checked_at',{ascending:false}).limit(1).maybeSingle();
   if(result.error)throw Error('Could not load the last Discord check.');run=result.data;
   if(run){const rows=await db.from('creator_role_sync_members').select('discord_id,display_name,roster_id,creator_id,creator_name,state,already_tagged',{count:'exact'}).eq('run_id',run.id).order('discord_id').limit(1001);if(rows.error||rows.count!==rows.data?.length||(rows.count??0)>1000)throw Error('Could not load the complete review queue.');members=rows.data??[];}
  }
  const canApply=!!run&&run.actor_id===scope.userId&&!!selected?.canWrite&&!run.applied_at&&new Date(run.checked_at).getTime()>Date.now()-15*60000&&run.config_revision===configs.data?.find(c=>c.brand_id===selected?.id)?.revision;
  const linkOptions=canApply&&selected? (await readRoster(db,scope.tenantId,selected.slug)).filter(r=>r.creator_id&&!identityClaims(r).length).map(r=>({id:r.id,name:r.real_name||`Creator ${r.id}`})):[];
  return reply({brands:brands.map(b=>({...b,config:configs.data?.find(c=>c.brand_id===b.id)??null})),selected:selected?.slug??null,run:run?{id:run.id,checked_at:run.checked_at,applied_at:run.applied_at,scanned:run.scanned,retained:run.retained,missing_identities:run.missing_identities,canApply}:null,members,linkOptions});
 }catch(e){return reply({error:e instanceof Error?e.message:'Could not load Discord cohorts.'},503);}
}
export async function POST(request:NextRequest){
 if(request.headers.get('origin')!==request.nextUrl.origin)return reply({error:'Invalid request origin.'},403);
 try{
  const ctx=await context();if(!ctx)return reply({error:'Not permitted'},403);
  const body=await request.json().catch(()=>null);
  if(!body||typeof body.brand!=='string'||!['inspect','configure','scan','apply','link'].includes(body.action))return reply({error:'Choose a brand and action.'},400);
  const brand=ctx.brands.find(b=>b.slug===body.brand);
  if(!brand||!brand.canWrite)return reply({error:'Only this brand’s accountable manager or an administrator can configure and import its cohort.'},403);
  const {scope,db}=ctx;
  const token=process.env.DISCORD_BOT_TOKEN;
  if(!token)return reply({error:'Tempo Bot connection is not configured.'},503);
  const read=discordReader(token,request.signal);
  if(body.action==='inspect'||body.action==='configure'){
   if(!snowflake(body.guildId))return reply({error:'Enter the Discord server ID.'},400);
   if(brand.discord_guild_id&&brand.discord_guild_id!==body.guildId)return reply({error:'This brand has a different saved server. Update brand setup first.'},409);
   const foreign=await db.from('brands_v2').select('id').eq('discord_guild_id',body.guildId).neq('id',brand.id).limit(1);
   if(foreign.error)throw Error('Could not verify server ownership.');if(foreign.data?.length)return reply({error:'This server is already assigned to another brand.'},409);
   const guild=await read(`/guilds/${body.guildId}`);const roles=await read(`/guilds/${body.guildId}/roles`);
   if(guild.status!==200||roles.status!==200||!Array.isArray(roles.body))return reply({error:'Tempo Bot cannot access this server. Ask the server administrator to install it.'},409);
   const options=(roles.body as DiscordRole[]).filter(r=>snowflake(r.id)&&!r.managed&&/^elites?$/i.test(r.name.trim()));
   const serverName=(guild.body as {name?:string})?.name||'Discord server';
   if(body.action==='inspect')return reply({serverName,roles:options.map(r=>({id:r.id,name:r.name}))});
   const selected=options.find(r=>r.id===body.roleId);if(!selected)return reply({error:'Choose the verified creator Elite role. Staff roles cannot be mapped.'},400);
   const saved=await db.rpc('save_creator_cohort_config',{p_actor:scope.userId,p_brand:brand.id,p_guild:body.guildId,p_role:selected.id,p_role_name:selected.name});
   if(saved.error)throw Error('Could not save this brand’s role mapping. Refresh and retry.');return reply({saved:true,serverName});
  }
  const configResult=await db.from('creator_role_sync_configs').select('*').eq('tenant_id',scope.tenantId).eq('brand_id',brand.id).maybeSingle();
  if(configResult.error)throw Error('Could not read role mapping.');const config=configResult.data;
  if(!config||config.guild_id!==brand.discord_guild_id)return reply({error:'Connect the server and map its Elite role first.'},409);
  if(body.action==='apply'||body.action==='link'){
   if(!uuid(body.runId))return reply({error:'Check Discord before importing.'},400);
   const run=await db.from('creator_role_sync_runs').select('id').eq('id',body.runId).eq('brand_id',brand.id).eq('tenant_id',scope.tenantId).eq('actor_id',scope.userId).maybeSingle();
   if(run.error||!run.data)return reply({error:'Scan not in your access.'},403);
   const roles=await read(`/guilds/${config.guild_id}/roles`);
   if(roles.status!==200||!Array.isArray(roles.body)||!(roles.body as DiscordRole[]).some(r=>r.id===config.role_id&&r.name===config.role_name&&!r.managed))return reply({error:'The mapped role could not be verified. Check Discord again.'},409);
   if(body.action==='link'){
    if(!snowflake(body.discordId)||!Number.isSafeInteger(body.rosterId)||body.rosterId<1)return reply({error:'Choose a creator and Discord member.'},400);
    const member=await read(`/guilds/${config.guild_id}/members/${body.discordId}`);
    if(member.status!==200||!Array.isArray((member.body as {roles?:unknown})?.roles)||!((member.body as {roles:string[]}).roles.includes(config.role_id)))return reply({error:'This person’s Elite role could not be verified. Check Discord again.'},409);
    const linked=await db.rpc('link_creator_cohort_member',{p_actor:scope.userId,p_run:body.runId,p_discord:body.discordId,p_roster:body.rosterId});
    if(linked.error)return reply({error:'The scan expired, this identity is already claimed, or the creator changed. Check Discord again and review the match.'},409);
    return reply({linked:true});
   }
   const applied=await db.rpc('apply_creator_cohort_scan',{p_actor:scope.userId,p_run:body.runId});
   if(applied.error)return reply({error:'The scan expired or the roster changed. Check Discord again before importing.'},409);
   return reply({updated:applied.data});
  }
  const inventory=await readEliteInventory(read,config.guild_id,config.role_id);
  if(inventory.members.length>1000)return reply({error:'This brand has more than 1,000 Elite members. No partial import was prepared.'},413);
  const roster=await readRoster(db,scope.tenantId,brand.slug);
  const review=reconcileElites(roster,inventory.members);
  const staged=await db.rpc('stage_creator_cohort_scan',{p_actor:scope.userId,p_brand:brand.id,p_revision:config.revision,p_scanned:inventory.scanned,p_missing:review.missingIdentities,p_members:review.members,p_retained:review.retained});
  if(staged.error)throw Error('Role mapping changed or the scan could not be saved. Check Discord again.');
  return reply({runId:staged.data,checked:true});
 }catch(e){return reply({error:e instanceof Error?e.message:'Discord check failed. Existing tags are preserved.'},e instanceof DiscordReadError?(e.status>=400&&e.status<600?e.status:503):503);}
}
