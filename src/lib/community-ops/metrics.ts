import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OpsChannel } from './model';
const exported=z.object({creators:z.array(z.object({discordId:z.string().regex(/^\d{17,20}$/),name:z.string().nullable(),handles:z.array(z.string().regex(/^[a-z0-9_.]+$/)).max(10),snapshot:z.object({gmv30:z.number().finite().nullable(),lastPost:z.string().nullable(),through:z.string().nullable(),coverage:z.string(),source:z.string(),match:z.string()})})).max(100),importedAt:z.string(),limited:z.boolean()});
export async function refreshOpsMetrics(db:SupabaseClient,tenant:string,guild:string){
  const url=process.env.COMMUNITY_OPS_METRICS_URL,token=process.env.COMMUNITY_OPS_METRICS_TOKEN;
  if(!url||!token)return;
  if(url!=='https://elrsgxlyejlkzjcnhmak.supabase.co/functions/v1/community-ops-metrics')throw Error('Unrecognized metrics source');
  const [channels,metrics]=await Promise.all([
    db.from('community_ops_channels').select('channel_id,name,messages').eq('tenant_id',tenant).eq('guild_id',guild).eq('enabled',true).eq('kind','ticket').not('synced_at','is',null).order('last_message_at',{ascending:false}).limit(500),
    db.from('community_ops_metrics').select('*').eq('tenant_id',tenant).eq('guild_id',guild).limit(500)
  ]);
  if(channels.error||metrics.error)throw Error('Metrics context unavailable');
  const fresh=new Set((metrics.data??[]).filter(m=>m.snapshot?.matchVersion===2&&Date.now()-Math.max(Date.parse(m.imported_at),Date.parse(m.snapshot?.checkedAt??m.imported_at))<6*3600000).map(m=>m.channel_id));
  const batch=((channels.data??[]) as Pick<OpsChannel,'channel_id'|'name'|'messages'>[]).filter(c=>!fresh.has(c.channel_id)).slice(0,15);
  const ids=[...new Set(batch.flatMap(c=>c.messages.filter(m=>!m.bot).map(m=>m.authorId)))].slice(0,100);if(!ids.length)return;
  const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({guildId:guild,discordIds:ids}),signal:AbortSignal.timeout(45000),cache:'no-store'});
  if(!response.ok)throw Error('Metrics source unavailable');
  const data=exported.parse(await response.json());
  for(const channel of batch){
    const authors=new Set(channel.messages.filter(m=>!m.bot).map(m=>m.authorId));
    // Staff can also appear in the creator roster. Participation alone does not
    // establish who owns a ticket: require its name to corroborate the exact ID.
    const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
    const ticketName=normalize(channel.name);
    const matches=data.creators.filter(c=>authors.has(c.discordId)&&ticketName&&[
      c.name??'',...c.handles,...channel.messages.filter(m=>m.authorId===c.discordId).map(m=>m.author)
    ].some(name=>normalize(name)===ticketName));
    if(matches.length!==1){
      const old=(metrics.data??[]).find(m=>m.channel_id===channel.channel_id);
      const snapshot={...(old?.snapshot??{gmv30:null,lastPost:null,coverage:'No unambiguous creator/account match observed.'}),matchVersion:2,checkedAt:data.importedAt,matchError:'Account match needs review'};
      if(old)await db.from('community_ops_metrics').update({snapshot}).eq('tenant_id',tenant).eq('guild_id',guild).eq('channel_id',channel.channel_id);
      else await db.from('community_ops_metrics').insert({tenant_id:tenant,guild_id:guild,channel_id:channel.channel_id,snapshot,imported_at:data.importedAt});
      continue;
    }
    const c=matches[0];const result=await db.from('community_ops_metrics').upsert({tenant_id:tenant,guild_id:guild,channel_id:channel.channel_id,creator_name:c.name,discord_id:c.discordId,handles:c.handles,snapshot:{...c.snapshot,matchVersion:2},imported_at:data.importedAt},{onConflict:'tenant_id,guild_id,channel_id'});
    if(result.error)throw Error('Metrics storage failed');
    const last=channel.messages.filter(m=>m.authorId===c.discordId).at(-1)?.at??null;
    await db.from('community_ops_channels').update({last_creator_at:last}).eq('tenant_id',tenant).eq('guild_id',guild).eq('channel_id',channel.channel_id);
  }
}
