import { createHash, randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

import { z } from 'zod';

import { pilotGuilds, type OpsBrand, type OpsChannel, type OpsMessage } from './model';

import { morningInstructions } from '../discord-tickets/morning';

import { responseDraft } from '../discord-tickets/drafts';

import { communityInstructions } from '../discord-tickets/community';

import { refreshOpsMetrics } from './metrics';
import { statusAfterAssessment } from './queue-state';
import { prepareCampaigns } from './campaigns';


type DiscordChannel={id:string;guild_id:string;parent_id:string|null;name:string;type:number;last_message_id?:string;permission_overwrites?:{id:string;type:number;allow:string;deny:string}[]};

type DiscordMessage={id:string;author:{id:string;username:string;bot?:boolean};content:string;timestamp:string;edited_timestamp:string|null;attachments:unknown[]};

const assessmentSchema=z.object({issue:z.string().min(1).max(500),category:z.enum(['Payments','Posting blockers','Decisions & onboarding','Recognition','Community']),action:z.enum(['team','reply','wait','review']),who:z.string().max(120),nextMove:z.string().max(700),draft:z.string().max(3000).nullable(),evidenceIds:z.array(z.string().regex(/^\d{17,20}$/)).min(1).max(5),waitingSinceMessageId:z.string().nullable()});

// Verified existing general creator audience roles, not staff or elite-only groups.
const creatorAudiences:Record<string,string>={
 '1166776019655602236':'1424750842845724755', '1339335585776533708':'1428807310570164450',
 '1449103988627603659':'1482813691199094926', '1452033395587813428':'1452033395587813434',
 '1496923650560098565':'1496928124829569186', '1512067155905085522':'1512090665205371002',
 '1524384421120053398':'1524388990709665842'
};
export function sharedCommunityChannel(c:DiscordChannel,roles:{id:string;name:string;permissions:string}[],guild:string){

  if(!c.permission_overwrites)return false;

  const everyone=roles.find(r=>r.id===guild);if(!everyone)return false;

  const audiences=[everyone,...roles.filter(r=>r.id===creatorAudiences[guild]||/^creators?$/i.test(r.name.trim()))];
  return audiences.some(role=>{

    let permissions=BigInt(everyone.permissions)|BigInt(role.permissions);

    const base=c.permission_overwrites!.find(o=>o.id===guild&&o.type===0);

    if(base)permissions=(permissions&~BigInt(base.deny))|BigInt(base.allow);

    if(role.id!==guild){const grant=c.permission_overwrites!.find(o=>o.id===role.id&&o.type===0);if(grant)permissions=(permissions&~BigInt(grant.deny))|BigInt(grant.allow);}

    return (permissions&BigInt(1024))!==BigInt(0);

  });

}

export function classifyChannel(c:DiscordChannel,categories:Map<string,string>):'ticket'|'community'|null {

  if(![0,5].includes(c.type)||!c.parent_id)return null;
  const parent=(categories.get(c.parent_id)??'').toLowerCase();

  if(/staff|team|internal/.test(parent))return null;

  if(/welcome|start.?here|get.?paid|content.?brief|tap.?link/.test(c.name))return null;

  if(/community|kormmunity|learning|creators hang out/.test(parent)&&/announcements|wins|cooking|inspo|inspiration|breakdown|replay|creator.?chat/.test(c.name))return 'community';
  if(/creators|creator chats|onboarding|waiting on first post|elite creators|affiliates/.test(parent))return 'ticket';

  return null;

}

export function validateAssessment(value:unknown,messages:OpsMessage[]){

  const a=assessmentSchema.parse(value);const ids=new Set(messages.map(m=>m.id));

  if(a.evidenceIds.some(id=>!ids.has(id))||(a.waitingSinceMessageId&&!ids.has(a.waitingSinceMessageId)))throw Error('Unverified evidence');

  if(/[\u2013\u2014]/.test(a.draft??''))throw Error('Voice validation failed');

  if(a.action!=='reply')a.draft=null;

  return {...a,preparedAt:new Date().toISOString()};

}

async function discord<T>(path:string):Promise<T>{

  const res=await fetch('https://discord.com/api/v10/'+path,{headers:{Authorization:'Bot '+process.env.DISCORD_TICKET_BOT_TOKEN},signal:AbortSignal.timeout(15000),cache:'no-store'});

  if(!res.ok)throw Error(res.status===429?'Discord rate limit; retry next cycle':'Discord access unavailable');

  return res.json();

}

export async function runOpsCycle(target?:{channelId?:string;guildId?:string;refreshOnly?:boolean;communityOnly?:boolean}){
  const url=process.env.COMMUNITY_OPS_DATABASE_URL??'';

  if(new URL(url).hostname!=='otwssgedcnxamcglqpnn.supabase.co')throw Error('Isolated preview required');

  const tenant=process.env.COMMUNITY_OPS_SOURCE_TENANT_ID;

  if(!tenant||!process.env.DISCORD_TICKET_BOT_TOKEN||!process.env.COMMUNITY_OPS_DATABASE_KEY)throw Error('Worker configuration missing');

  const db=createClient(url,process.env.COMMUNITY_OPS_DATABASE_KEY,{auth:{persistSession:false}});

  const operator=process.env.DISCORD_TICKET_OPERATOR_ID;

  if(!operator||!(process.env.DISCORD_TICKET_PILOT_USER_IDS??'').split(',').includes(operator))throw Error('Worker operator unavailable');

  const actor=await db.from('user_profiles').select('role,role_id').eq('tenant_id',tenant).eq('user_id',operator).maybeSingle();

  if(actor.error||!actor.data||!['owner','admin'].includes(actor.data.role))throw Error('Worker operator unavailable');

  const roleQuery=db.from('roles').select('id').eq('tenant_id',tenant);

  const role=await(actor.data.role_id?roleQuery.eq('id',actor.data.role_id):roleQuery.eq('key',actor.data.role)).maybeSingle();

  if(role.error||!role.data)throw Error('Worker role unavailable');

  const permission=await db.from('role_permissions').select('role_id').eq('role_id',role.data.id).eq('screen','messages').eq('level','read').maybeSingle();

  if(permission.error||!permission.data)throw Error('Worker permission unavailable');

  const {data:brands,error}=await db.from('community_ops_brands').select('*').eq('tenant_id',tenant).eq('enabled',true).in('guild_id',Object.keys(pilotGuilds)).order('scanned_at',{ascending:true,nullsFirst:true});

  if(error)throw Error('Brand configuration unavailable');

  let targetGuild:string|undefined=target?.guildId;
  if(targetGuild&&!Object.hasOwn(pilotGuilds,targetGuild))throw Error('Target unavailable');
  if(target?.channelId){const row=await db.from('community_ops_channels').select('guild_id').eq('tenant_id',tenant).eq('channel_id',target.channelId).eq('enabled',true).maybeSingle();if(row.error||!row.data||!Object.hasOwn(pilotGuilds,row.data.guild_id))throw Error('Target unavailable');targetGuild=row.data.guild_id;}
  let brand:OpsBrand|undefined;const token=randomUUID();

  for(const b of (brands??[]).filter(b=>!targetGuild||b.guild_id===targetGuild)){const lock=await db.rpc('claim_community_ops_brand',{p_tenant:tenant,p_guild:b.guild_id,p_token:token});if(lock.error)throw Error('Worker lease unavailable');if(lock.data){brand=b;break;}}

  if(!brand)return {busy:true};

  let scanned=0,prepared=0;const started=Date.now();

  try {

    const channels=await discord<DiscordChannel[]>('guilds/'+brand.guild_id+'/channels');

    const parents=new Map(channels.filter(c=>c.type===4).map(c=>[c.id,c.name]));

    const roles=await discord<{id:string;name:string;permissions:string}[]>('guilds/'+brand.guild_id+'/roles');

    const eligible=channels.map(c=>({...c,kind:classifyChannel(c,parents)})).filter(c=>c.kind&&(c.kind!=='community'||sharedCommunityChannel(c,roles,brand!.guild_id)));

    const previous=await db.from('community_ops_channels').select('channel_id,kind,enabled,error').eq('tenant_id',tenant).eq('guild_id',brand.guild_id);
    if(previous.error)throw Error('Previous channel scope unavailable');

    const previousKinds=new Map((previous.data??[]).map(c=>[c.channel_id,c.kind]));

    const rows=eligible.map(c=>({tenant_id:tenant,guild_id:brand!.guild_id,channel_id:c.id,name:c.name,parent_id:c.parent_id,kind:c.kind}));
    if(rows.length){const result=await db.from('community_ops_channels').upsert(rows,{onConflict:'channel_id'});if(result.error)throw Error('Discovery storage failed');}

    const recovered=eligible.filter(c=>previous.data?.find(p=>p.channel_id===c.id)?.error==='Channel moved, removed or outside collection scope').map(c=>c.id);
    if(recovered.length){const restored=await db.from('community_ops_channels').update({enabled:true,error:null}).eq('tenant_id',tenant).in('channel_id',recovered).eq('error','Channel moved, removed or outside collection scope');if(restored.error)throw Error('Channel recovery failed');}

    // A scope change invalidates all earlier context, including private review notes.

    const reclassified=eligible.filter(c=>previousKinds.has(c.id)&&previousKinds.get(c.id)!==c.kind).map(c=>c.id);

    if(reclassified.length){

      const reset=await db.from('community_ops_channels').update({messages:[],source_hash:null,assessment:null,assessment_hash:null,draft:'',note:'',reviewed_hash:null,reviewed_at:null,synced_at:null,status:'open',owner_label:null,followup_at:null,updated_at:new Date().toISOString()}).eq('tenant_id',tenant).in('channel_id',reclassified);

      if(reset.error)throw Error('Channel scope reset failed');

    }

    const existing=await db.from('community_ops_channels').select('*').eq('tenant_id',tenant).eq('guild_id',brand.guild_id).eq('enabled',true).limit(2000);

    if(existing.error)throw Error('Channel queue unavailable');

    const map=new Map(eligible.map(c=>[c.id,c]));

    for(const c of (existing.data??[]) as OpsChannel[]){if(!map.has(c.channel_id))await db.from('community_ops_channels').update({enabled:false,error:'Channel moved, removed or outside collection scope'}).eq('channel_id',c.channel_id).eq('tenant_id',tenant);}

    const ordered=(existing.data??[]).filter(c=>map.has(c.channel_id)).sort((a,b)=>{

      const changed=(c:typeof a)=>map.get(c.channel_id)?.last_message_id!==c.discord_last_id;

      if(changed(a)!==changed(b))return changed(a)?-1:1;

      return (a.synced_at??'').localeCompare(b.synced_at??'') || (BigInt(map.get(a.channel_id)?.last_message_id??'0')>BigInt(map.get(b.channel_id)?.last_message_id??'0')?-1:1);

    });

    const communityToSync=[...ordered].filter(c=>c.kind==='community').sort((a,b)=>(a.synced_at??'').localeCompare(b.synced_at??''))[0];

    const candidates=target?.channelId?ordered.filter(c=>c.channel_id===target.channelId):target?.communityOnly?ordered.filter(c=>c.kind==='community').slice(0,12):[...(communityToSync?[communityToSync]:[]),...ordered.filter(c=>c.channel_id!==communityToSync?.channel_id)].slice(0,15);
    for(const c of candidates){

      if(Date.now()-started>190000)break;

      try{

        const messages=(await discord<DiscordMessage[]>('channels/'+c.channel_id+'/messages?limit=50')).reverse().map(m=>({id:m.id,author:m.author.username,authorId:m.author.id,bot:!!m.author.bot,text:m.content.slice(0,4000),at:m.timestamp,editedAt:m.edited_timestamp,attachments:m.attachments.length}));

        const humans=messages.filter(m=>!m.bot);const hash=createHash('sha256').update(JSON.stringify(humans)).digest('hex');

        const changed=c.source_hash!==hash;

        const result=await db.from('community_ops_channels').update({messages,source_hash:hash,discord_last_id:map.get(c.channel_id)?.last_message_id??null,last_message_at:humans.at(-1)?.at??null,synced_at:new Date().toISOString(),error:null,...(changed?{assessment:null,assessment_hash:null,updated_at:new Date().toISOString()}: {})}).eq('channel_id',c.channel_id).eq('tenant_id',tenant).eq('updated_at',c.updated_at);

        if(result.error)throw Error('Sync storage failed');scanned++;

      }catch{await db.from('community_ops_channels').update({error:'Sync could not complete; access or rate limit needs checking'}).eq('channel_id',c.channel_id).eq('tenant_id',tenant);}

    }

    if(target?.channelId&&scanned!==1)throw Error('Target refresh failed');
    if(target?.refreshOnly)return {refreshed:true,prepared:0};

    if(!target?.channelId&&Date.now()-started<100000)await prepareCampaigns(db,tenant,brand);
    if(target?.communityOnly)return {brand:brand.name,scanned,community:true};
    let metricsError=false;

    try{await refreshOpsMetrics(db,tenant,brand.guild_id);}catch{metricsError=true;}

    const sendRows=await db.from('community_ops_sends').select('discord_message_id').eq('tenant_id',tenant).eq('guild_id',brand.guild_id).eq('status','sent');
    const assistantReplies=new Set((sendRows.data??[]).map(r=>r.discord_message_id));
    const metricRows=await db.from('community_ops_metrics').select('*').eq('tenant_id',tenant).eq('guild_id',brand.guild_id);

    if(metricRows.error)throw Error('Metrics context unavailable');

    const metricMap=new Map((metricRows.data??[]).filter(m=>m.snapshot?.matchVersion===2&&!m.snapshot?.matchError).map(m=>[m.channel_id,m]));

    const pending=await db.from('community_ops_channels').select('*').eq('tenant_id',tenant).eq('guild_id',brand.guild_id).eq('enabled',true).not('source_hash','is',null).is('error',null).order('last_message_at',{ascending:false,nullsFirst:false}).limit(2000);

    if(pending.error)throw Error('Preparation queue unavailable');

    const contextKey=(channel:OpsChannel)=>createHash('sha256').update(JSON.stringify({version:4,voice:brand!.settings.voice,priorities:brand!.settings.priorities,owner:channel.owner_label||brand!.settings.firstOwner,note:channel.note,metrics:metricMap.get(channel.channel_id)?.snapshot,day:channel.kind==='community'?new Date().toISOString().slice(0,10):null})).digest('hex');

    const allRows=(pending.data??[]) as OpsChannel[];

    const pendingRows=allRows.filter(c=>(!target||c.channel_id===target.channelId)&&(!c.assessment_hash||(c.assessment as typeof c.assessment&{contextKey?:string})?.contextKey!==contextKey(c)));

    const community=pendingRows.find(c=>c.kind==='community');

    const batch=[...(community?[community]:[]),...pendingRows.filter(c=>c!==community)].slice(0,target?1:4);

    for(const channel of batch){

      if(Date.now()-started>225000||!process.env.DISCORD_TICKET_OPENAI_API_KEY)break;

      if(channel.kind==='community'&&brand.settings.communityEnabled===false)continue;

      const messages=channel.messages.filter(m=>!m.bot||assistantReplies.has(m.id));if(!messages.length)continue;

      // Durable, per-brand daily budget. Only the lease holder changes these counters.

      const fresh=await db.from('community_ops_brands').select('settings,updated_at').eq('guild_id',brand.guild_id).eq('tenant_id',tenant).single();

      if(fresh.error)throw Error('Preparation budget unavailable');

      const today=new Date().toISOString().slice(0,10);const settings=fresh.data.settings;

      const used=settings.aiDay===today?Number(settings.aiCount??0):0;if(used>=80)break;

      const reserve=await db.from('community_ops_brands').update({settings:{...settings,aiDay:today,aiCount:used+1},updated_at:new Date().toISOString()}).eq('guild_id',brand.guild_id).eq('tenant_id',tenant).eq('updated_at',fresh.data.updated_at).select('guild_id');

      if(reserve.error||!reserve.data?.length)break;

      try{

        const instructions=channel.kind==='community'?`${communityInstructions.slice(communityInstructions.indexOf('Select at most'))}

You serve ${brand.name}. Return one JSON object only: issue, category (Community or Recognition), action (reply or wait), who, nextMove, draft, evidenceIds, waitingSinceMessageId (null). Choose at most one opportunity. Zero opportunities means action wait and draft null. Never reuse a past Friday/weekend deadline as current. Prefer date-neutral wording unless the future date is explicitly verified. Reviewed community suggestions are supplied for deduplication. Do not repeat them without materially new evidence.`:`${morningInstructions}

Add category: Payments, Posting blockers, Decisions & onboarding, or Recognition. Draft as the configured draftingIdentity, not as another staff member. Never claim 'I sent', 'I paid', or 'I updated' for an action reported by someone else.

Messages marked bot in this context are verified replies sent by the brand assistant through Tempo and count as team answers. A substantive staff answer or explicit report of completion is enough to stop a duplicate reply. Do not require the creator to acknowledge every answer. If staff says the invitation was sent and asks the creator to report trouble, action wait, draft null, unless a LATER message reports it still failed. If staff answers that a service is unavailable for this brand, action wait, not another copy of that answer. Unverified payment completion may need internal review, never a redundant creator reply. A thank-you does not reopen a completed task.

Use verifiedCreatorSnapshot for the saved account and performance facts, respecting coverage and source dates. Do not ask the creator to reconfirm that same saved account without conflicting evidence. If speaker roles are uncertain, use review, not an invented assignment. For an awaited creator response, use wait; an unanswered creator question requiring team action is team or reply.`;

        const metric=metricMap.get(channel.channel_id);

        const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+process.env.DISCORD_TICKET_OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.DISCORD_TICKET_OPENAI_MODEL||'gpt-5.4-mini',store:false,max_output_tokens:2000,instructions,input:JSON.stringify({now:new Date().toISOString(),brand:brand.name,historyIsPartial:true,assignedFollowThroughOwner:channel.owner_label||settings.firstOwner||null,approvedVoiceExample:settings.voice??'',priorities:settings.priorities??'',managerCorrection:channel.note,draftingIdentity:{role:'reviewing manager; never assume the identity of the message author'},verifiedCreatorSnapshot:channel.kind==='ticket'&&metric?{name:metric.creator_name,discordId:metric.discord_id,handles:metric.handles,...metric.snapshot}:null,reviewedCommunitySuggestions:channel.kind==='community'?allRows.filter(c=>c.kind==='community'&&c.reviewed_hash).map(c=>({draft:c.draft,evidenceIds:c.assessment?.evidenceIds})).slice(0,20):[],messages:messages.slice(-35)})}),signal:AbortSignal.timeout(40000)});

        if(!response.ok)throw Error('AI unavailable');

        const brief=validateAssessment(JSON.parse(responseDraft(await response.json())),messages);

        const assessment={...brief,contextKey:contextKey(channel),waitingSince:messages.find(m=>m.id===brief.waitingSinceMessageId)?.at??null,waitingFromCreator:!!metric?.discord_id&&messages.find(m=>m.id===brief.waitingSinceMessageId)?.authorId===metric.discord_id};

        const result=await db.from('community_ops_channels').update({assessment,assessment_hash:channel.source_hash,status:statusAfterAssessment(channel,assessment.action),draft:channel.reviewed_hash&&channel.draft?channel.draft:assessment.draft??'',updated_at:new Date().toISOString()}).eq('tenant_id',tenant).eq('channel_id',channel.channel_id).eq('source_hash',channel.source_hash).eq('updated_at',channel.updated_at);
        if(result.error)throw Error('Assessment storage failed');prepared++;

      }catch{/* Keep this channel pending. A later cycle can retry without inventing a draft. */}

    }

    await db.from('community_ops_brands').update({scanned_at:new Date().toISOString(),scan_error:metricsError?'Conversation scan succeeded; performance refresh needs attention':null}).eq('guild_id',brand.guild_id).eq('tenant_id',tenant).eq('lease_token',token);

    return {brand:brand.name,discovered:eligible.length,scanned,prepared};

  }catch(e){await db.from('community_ops_brands').update({scanned_at:new Date().toISOString(),scan_error:'Scan failed; previous results retained'}).eq('guild_id',brand.guild_id).eq('tenant_id',tenant).eq('lease_token',token);throw e;}

  finally{await db.from('community_ops_brands').update({lease_until:null,lease_token:null}).eq('guild_id',brand.guild_id).eq('tenant_id',tenant).eq('lease_token',token);}

}
