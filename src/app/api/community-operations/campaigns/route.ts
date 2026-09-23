import { z } from 'zod';
import { opsContext,opsReply,validOpsOrigin } from '@/lib/community-ops/server';
import { pilotGuilds } from '@/lib/community-ops/model';
import { runOpsCycle } from '@/lib/community-ops/worker';
import { rewriteCampaign } from '@/lib/community-ops/campaigns';
import { randomUUID } from 'node:crypto';
export const maxDuration=300;
const id=z.string().regex(/^\d{17,20}$/);
export async function GET(){
 try{
  const ctx=await opsContext();if(ctx.denied)return ctx.denied;
  const scope={tenant:ctx.scope.tenantId,guilds:Object.keys(pilotGuilds)};
  const [posts,insights,channels]=await Promise.all([
   ctx.db.from('community_ops_campaigns').select('*').eq('tenant_id',scope.tenant).in('guild_id',scope.guilds).order('created_at',{ascending:false}).limit(400),
   ctx.db.from('community_ops_insights').select('*').eq('tenant_id',scope.tenant).in('guild_id',scope.guilds),
   ctx.db.from('community_ops_channels').select('channel_id,guild_id,name').eq('tenant_id',scope.tenant).in('guild_id',scope.guilds).eq('kind','community').eq('enabled',true).is('error',null)
  ]);
  if(posts.error||insights.error||channels.error)throw Error();
  return opsReply({posts:posts.data,insights:insights.data,channels:channels.data});
 }catch{return opsReply({error:'Community feed unavailable.'},503);}
}
export async function POST(request:Request){
 try{
  const ctx=await opsContext(true);if(ctx.denied)return ctx.denied;
  if(!validOpsOrigin(request))return opsReply({error:'Invalid origin'},403);
  const p=z.union([z.object({guildId:id}).strict(),z.object({id:z.string().uuid(),updatedAt:z.string(),direction:z.string().min(1).max(1000)}).strict()]).parse(await request.json());
  if('id' in p){
   const post=await ctx.db.from('community_ops_campaigns').select('*').eq('tenant_id',ctx.scope.tenantId).in('guild_id',Object.keys(pilotGuilds)).eq('id',p.id).maybeSingle();
   if(post.error||!post.data)return opsReply({error:'Post unavailable'},404);
   if(!Number.isFinite(Date.parse(p.updatedAt))||Date.parse(post.data.updated_at)!==Date.parse(p.updatedAt)||['published','dismissed'].includes(post.data.status))return opsReply({error:'Reload the current unpublished post before rewriting.'},409);
   const token=randomUUID();const lock=await ctx.db.rpc('claim_community_ops_brand',{p_tenant:ctx.scope.tenantId,p_guild:post.data.guild_id,p_token:token});
   if(lock.error||!lock.data)return opsReply({error:'This brand is preparing. Try again shortly.'},409);
   try{const brand=await ctx.db.from('community_ops_brands').select('settings').eq('tenant_id',ctx.scope.tenantId).eq('guild_id',post.data.guild_id).single();if(brand.error)throw Error();return opsReply(await rewriteCampaign(ctx.db,ctx.scope.tenantId,post.data,brand.data.settings.voice??'',p.direction));}
   finally{await ctx.db.from('community_ops_brands').update({lease_until:null,lease_token:null}).eq('tenant_id',ctx.scope.tenantId).eq('guild_id',post.data.guild_id).eq('lease_token',token);}
  }
  if(!(p.guildId in pilotGuilds))return opsReply({error:'Brand unavailable'},404);
  const result=await runOpsCycle({guildId:p.guildId,communityOnly:true});
  return 'busy' in result?opsReply({error:'This brand is already scanning. Try again shortly.'},409):opsReply(result);
 }catch(e){return opsReply({error:e instanceof z.ZodError?'Choose a valid brand.':'Community scan could not complete.'},e instanceof z.ZodError?400:503);}
}
export async function PATCH(request:Request){
 try{
  const ctx=await opsContext(true);if(ctx.denied)return ctx.denied;
  if(!validOpsOrigin(request))return opsReply({error:'Invalid origin'},403);
  const p=z.object({id:z.string().uuid(),updatedAt:z.string().datetime({offset:true}),draft:z.string().min(1).max(3000),status:z.enum(['ready','approved','scheduled','published','dismissed']),owner:z.string().max(120),plannedAt:z.string().datetime({offset:true}).nullable(),targetChannel:id.nullable()}).strict().parse(await request.json());
  const found=await ctx.db.from('community_ops_campaigns').select('guild_id').eq('tenant_id',ctx.scope.tenantId).in('guild_id',Object.keys(pilotGuilds)).eq('id',p.id).maybeSingle();
  if(found.error||!found.data)return opsReply({error:'Post unavailable'},404);
  if(p.status==='scheduled'&&(!p.plannedAt||Date.parse(p.plannedAt)<=Date.now()))return opsReply({error:'Choose a future planning time.'},400);
  if(['approved','scheduled','published'].includes(p.status)&&!p.targetChannel)return opsReply({error:'Choose the community channel.'},400);
  if(p.targetChannel){const target=await ctx.db.from('community_ops_channels').select('channel_id').eq('tenant_id',ctx.scope.tenantId).eq('guild_id',found.data.guild_id).eq('channel_id',p.targetChannel).eq('kind','community').eq('enabled',true).is('error',null).maybeSingle();if(target.error||!target.data)return opsReply({error:'Choose an accessible shared channel for this brand.'},400);}
  const result=await ctx.db.from('community_ops_campaigns').update({draft:p.draft,status:p.status,owner_label:p.owner,planned_at:p.plannedAt,target_channel:p.targetChannel,updated_at:new Date().toISOString()}).eq('tenant_id',ctx.scope.tenantId).eq('id',p.id).eq('updated_at',p.updatedAt).select('id');
  if(result.error)throw Error();if(!result.data?.length)return opsReply({error:'This post changed. Reload to review the newest version.'},409);
  await ctx.db.from('community_ops_events').insert({tenant_id:ctx.scope.tenantId,channel_id:p.targetChannel??found.data.guild_id,actor_id:ctx.scope.userId,action:'community_review',details:{postId:p.id,status:p.status}});
  return opsReply({saved:true});
 }catch(e){return opsReply({error:e instanceof z.ZodError?'Check the post fields.':'Could not save this post.'},e instanceof z.ZodError?400:503);}
}
