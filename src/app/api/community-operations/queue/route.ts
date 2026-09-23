import { avatarIdentity } from '@/lib/community-ops/avatar-identity';
import { z } from 'zod';

import { opsContext,opsReply,validOpsOrigin } from '@/lib/community-ops/server';

import { pilotGuilds } from '@/lib/community-ops/model';

import { runOpsCycle } from '@/lib/community-ops/worker';

export const maxDuration=300;

const id=z.string().regex(/^\d{17,20}$/);

const review=z.object({channelId:id,updatedAt:z.string(),status:z.enum(['open','waiting_team','waiting_creator','snoozed','resolved']),owner:z.string().max(120),followupAt:z.string().datetime().nullable(),note:z.string().max(3000),draft:z.string().max(3000)}).strict();

const preferences=z.object({guildId:id,updatedAt:z.string(),firstOwner:z.string().max(120),escalationOwner:z.string().max(120),escalationHours:z.number().min(1).max(720).nullable(),voice:z.string().max(3000),priorities:z.string().max(1500),communityEnabled:z.boolean(),communityCategories:z.array(z.enum(['recognition','top_videos','inspo','campaign'])).max(4).optional(),communityDailyLimit:z.number().int().min(1).max(8).optional()}).strict();

export async function GET(request:Request){

  try{

    const ctx=await opsContext();if(ctx.denied)return ctx.denied;

    const tenant=ctx.scope.tenantId;const channelId=new URL(request.url).searchParams.get('channel');

    if(channelId){if(!id.safeParse(channelId).success)return opsReply({error:'Invalid channel'},400);const result=await ctx.db.from('community_ops_channels').select('*').eq('tenant_id',tenant).in('guild_id',Object.keys(pilotGuilds)).eq('channel_id',channelId).eq('enabled',true).maybeSingle();if(result.error)throw result.error;return result.data?opsReply(result.data):opsReply({error:'Conversation unavailable'},404);}

    const [brands,channels,metrics]=await Promise.all([

      ctx.db.from('community_ops_brands').select('guild_id,name,slug,tenant_id,enabled,settings,scanned_at,scan_error,updated_at').eq('tenant_id',tenant).in('guild_id',Object.keys(pilotGuilds)),

      ctx.db.from('community_ops_channels').select('messages,channel_id,guild_id,name,kind,enabled,source_hash,assessment_hash,assessment,status,owner_label,followup_at,note,draft,updated_at,synced_at,last_message_at,last_creator_at,error,reviewed_hash').eq('tenant_id',tenant).in('guild_id',Object.keys(pilotGuilds)).eq('enabled',true).order('last_message_at',{ascending:false,nullsFirst:false}).limit(2000),

      ctx.db.from('community_ops_metrics').select('discord_id,channel_id,guild_id,creator_name,handles,snapshot,imported_at').eq('tenant_id',tenant).in('guild_id',Object.keys(pilotGuilds)).limit(2000)

    ]);

    if(brands.error||channels.error||metrics.error)throw Error('Queue unavailable');

    const metricMap=new Map((metrics.data??[]).filter(m=>m.snapshot?.matchVersion===2&&!m.snapshot?.matchError).map(m=>[m.guild_id+':'+m.channel_id,m]));

    return opsReply({brands:brands.data?.map(b=>({...b,updated_at:b.settings.workflowVersion??'initial'})),channels:(channels.data??[]).map(c=>{const metrics=metricMap.get(c.guild_id+':'+c.channel_id)??null;const identity=avatarIdentity(c.name,c.messages??[],metrics,null);const humans=(c.messages??[]).filter((m:{bot:boolean})=>!m.bot);const waiting=humans.find((m:{id:string})=>m.id===c.assessment?.waitingSinceMessageId);const {messages:omitted,...summary}=c;void omitted;return {...summary,last_creator_at:metrics?c.last_creator_at:null,metrics,queueEvidence:{creatorConfirmed:!!identity,waitingFromCreator:!!identity&&waiting?.authorId===identity,latestFromCreator:!!identity&&humans.at(-1)?.authorId===identity}};}),coverageLimited:channels.data?.length===2000});

  }catch{return opsReply({error:'Unable to load community operations.'},503);}

}

export async function PATCH(request:Request){

  try{

    const ctx=await opsContext(true);if(ctx.denied)return ctx.denied;

    if(!validOpsOrigin(request))return opsReply({error:'Invalid origin'},403);

    const body=await request.json();

    if(body.guildId){

      const p=preferences.parse(body);if(!(p.guildId in pilotGuilds))return opsReply({error:'Brand unavailable'},404);

      for(let attempt=0;attempt<3;attempt++){

        const existing=await ctx.db.from('community_ops_brands').select('settings,updated_at').eq('tenant_id',ctx.scope.tenantId).eq('guild_id',p.guildId).single();if(existing.error)throw existing.error;

        if((existing.data.settings.workflowVersion??'initial')!==p.updatedAt)return opsReply({error:'Settings changed. Reopen settings to load the latest version.'},409);

        const version=new Date().toISOString();

        const result=await ctx.db.from('community_ops_brands').update({settings:{...existing.data.settings,workflowVersion:version,firstOwner:p.firstOwner,escalationOwner:p.escalationOwner,escalationHours:p.escalationHours,voice:p.voice,priorities:p.priorities,communityEnabled:p.communityEnabled,...(p.communityCategories?{communityCategories:p.communityCategories}:{}),...(p.communityDailyLimit?{communityDailyLimit:p.communityDailyLimit}:{})},updated_at:version}).eq('tenant_id',ctx.scope.tenantId).eq('guild_id',p.guildId).eq('updated_at',existing.data.updated_at).select('guild_id');

        if(result.error)throw result.error;if(result.data?.length)return opsReply({saved:true,updatedAt:version});

      }

      return opsReply({error:'Settings are busy. Retry shortly.'},409);

    }

    const p=review.parse(body);

    const found=await ctx.db.from('community_ops_channels').select('*').eq('tenant_id',ctx.scope.tenantId).in('guild_id',Object.keys(pilotGuilds)).eq('channel_id',p.channelId).eq('enabled',true).single();if(found.error||!found.data)return opsReply({error:'Conversation unavailable'},404);

    const c=found.data;

    if(p.status==='resolved'&&(c.error||!c.synced_at||Date.now()-Date.parse(c.synced_at)>900000||c.assessment_hash!==c.source_hash))return opsReply({error:'Refresh this conversation before resolving it.'},409);

    if(p.status==='snoozed'&&(!p.followupAt||Date.parse(p.followupAt)<=Date.now()))return opsReply({error:'Choose a future follow-up.'},400);

    const result=await ctx.db.from('community_ops_channels').update({status:p.status,owner_label:p.owner||null,followup_at:p.followupAt,note:p.note,draft:p.draft,reviewed_hash:c.source_hash,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString(),...(p.note!==c.note?{assessment_hash:null}: {})}).eq('tenant_id',ctx.scope.tenantId).eq('channel_id',p.channelId).eq('updated_at',p.updatedAt).select('channel_id');

    if(result.error)throw result.error;if(!result.data?.length)return opsReply({error:'New activity arrived. Refresh before saving.'},409);

    // History is observational; failure must not imply the already-completed save failed.

    await ctx.db.from('community_ops_events').insert({tenant_id:ctx.scope.tenantId,channel_id:p.channelId,actor_id:ctx.scope.userId,action:'review',details:{status:p.status,owner:p.owner,followupAt:p.followupAt}});

    return opsReply({saved:true});

  }catch(e){return opsReply({error:e instanceof z.ZodError?'Check the review fields.':'Could not save this review.'},e instanceof z.ZodError?400:503);}

}

export async function POST(request:Request){

  const ctx=await opsContext(true);if(ctx.denied)return ctx.denied;

  if(!validOpsOrigin(request))return opsReply({error:'Invalid origin'},403);

  try{const text=await request.text();const target=text?z.object({channelId:id,refreshOnly:z.boolean().optional()}).strict().parse(JSON.parse(text)):undefined;const result=await runOpsCycle(target);if('busy' in result)return opsReply({error:'This brand is refreshing. Your edits are safe; retry shortly.'},409);return opsReply(result);}catch{return opsReply({error:'Scan could not complete. Previous results retained.'},503);}

}
