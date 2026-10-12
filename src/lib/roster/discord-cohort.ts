export const snowflake = (value: unknown): value is string => typeof value === 'string' && /^\d{17,20}$/.test(value);
export interface CohortIdentity { id:number; real_name:string|null; creator_id:string|null; discord_id:string|null; discord_user_id:string|null; canonicalDiscordId:string|null; tags:string[]|null }
export interface DiscordElite { discordId:string; name:string }
export interface CohortMatch extends DiscordElite { rosterId:number|null; creatorId:string|null; creatorName:string|null; state:'matched'|'conflict'|'unmatched'; alreadyTagged:boolean; identityClaims:string[] }
export function identityClaims(row:CohortIdentity):string[] {
 return [...new Set([row.discord_id,row.discord_user_id,row.canonicalDiscordId].map(v=>v?.trim()).filter((v):v is string=>!!v))].sort();
}
export function reconcileElites(roster:CohortIdentity[],members:DiscordElite[]) {
 const claims=new Map<string,CohortIdentity[]>();
 for(const row of roster) for(const id of identityClaims(row)) claims.set(id,[...(claims.get(id)??[]),row]);
 const matches:CohortMatch[]=members.map(member=>{
  const candidates=claims.get(member.discordId)??[];
  const row=candidates.length===1?candidates[0]:null;
  const ids=row?identityClaims(row):[];
  const safe=!!row && !!row.creator_id && ids.length===1 && snowflake(ids[0]);
  return {...member,rosterId:safe?row!.id:null,creatorId:safe?row!.creator_id:null,creatorName:safe?row!.real_name:null,state:safe?'matched':candidates.length?'conflict':'unmatched',alreadyTagged:safe && (row!.tags??[]).some(t=>t.trim().toLowerCase()==='elite'),identityClaims:safe?ids:[]};
 });
 const found=new Set(matches.filter(m=>m.state==='matched').map(m=>m.rosterId));
 const retained=roster.filter(r=>(r.tags??[]).some(t=>t.trim().toLowerCase()==='elite') && !found.has(r.id)).map(r=>({id:r.id,name:r.real_name||`Creator ${r.id}`,reason:identityClaims(r).length===0?'Discord identity missing':'Not verified in the Discord Elite group'}));
 return {members:matches,retained,missingIdentities:roster.filter(r=>!identityClaims(r).length).length};
}

export interface DiscordRole {id:string;name:string;managed:boolean}
type ReadResult={status:number;body:unknown};
export class DiscordReadError extends Error { constructor(public status:number,message:string){super(message);} }
/** Only GET requests. No role grants, invitations, channels or messages. */
export function discordReader(token:string,signal?:AbortSignal,deadline=Date.now()+45000) {
 return async (path:string):Promise<ReadResult>=>{
  for(let attempt=0;attempt<3;attempt++){
   if(Date.now()>=deadline || signal?.aborted) throw new DiscordReadError(504,'Discord check timed out. Retry; no partial scan was saved.');
   const response=await fetch(`https://discord.com/api/v10${path}`,{method:'GET',headers:{Authorization:`Bot ${token}`},cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,Math.min(8000,deadline-Date.now())))]):AbortSignal.timeout(Math.max(1,Math.min(8000,deadline-Date.now())))});
   if(response.status!==429) return {status:response.status,body:response.ok?await response.json():null};
   const body=await response.json().catch(()=>null);const seconds=Number(body?.retry_after);
   const delay=Number.isFinite(seconds)&&seconds>=0?Math.ceil(seconds*1000)+150:1000;
   if(attempt===2 || Date.now()+delay>=deadline) throw new DiscordReadError(429,'Discord is busy. Retry shortly; no partial scan was saved.');
   await new Promise(resolve=>setTimeout(resolve,delay));
  }
  throw new DiscordReadError(429,'Discord is busy. Retry shortly.');
 };
}
export async function readEliteInventory(read:(path:string)=>Promise<ReadResult>,guild:string,role:string) {
 if(!snowflake(guild)||!snowflake(role))throw new DiscordReadError(400,'Invalid Discord configuration.');
 const roles=await read(`/guilds/${guild}/roles`);
 if(roles.status!==200 || !Array.isArray(roles.body)) throw new DiscordReadError(roles.status,'Tempo Bot cannot read this server’s roles. Check its installation.');
 const selected=(roles.body as DiscordRole[]).find(r=>r.id===role);
 if(!selected || selected.managed || !/^elites?$/i.test(selected.name.trim())) throw new DiscordReadError(409,'The mapped Elite role changed. Choose the creator Elite role again. Staff roles cannot be used.');
 const seen=new Set<string>();const members:DiscordElite[]=[];let after='0';let scanned=0;
 for(let page=0;page<20;page++){
  const result=await read(`/guilds/${guild}/members?limit=1000&after=${after}`);
  if(result.status!==200 || !Array.isArray(result.body)) throw new DiscordReadError(result.status,result.status===403?'Member-list access is unavailable. The bot owner must enable Server Members Intent in Discord Developer Portal. Existing Tempo tags are preserved.':'Discord member inventory failed. No partial scan was saved.');
  const list=result.body as {user?:{id?:string;bot?:boolean;global_name?:string;username?:string};nick?:string;roles?:unknown}[];
  if(list.length>1000)throw new DiscordReadError(502,'Discord returned an invalid inventory.');
  for(const member of list){
   const id=member.user?.id;
   if(!snowflake(id)||!Array.isArray(member.roles)||member.roles.some(r=>!snowflake(r))||seen.has(id)||BigInt(id)<=BigInt(after))throw new DiscordReadError(502,'Discord inventory was inconsistent. Retry; no partial scan was saved.');
   seen.add(id);scanned++;
   if(!member.user?.bot && member.roles.includes(role)) members.push({discordId:id,name:member.nick||member.user?.global_name||member.user?.username||id});
  }
  if(list.length<1000)return {members,scanned,roleName:selected.name};
  const next=list.reduce((highest,m)=>BigInt(m.user!.id!)>BigInt(highest)?m.user!.id!:highest,after);
  if(next===after)throw new DiscordReadError(502,'Discord inventory did not advance.');after=next;
 }
 throw new DiscordReadError(413,'This server needs a larger background scan. No partial membership was imported.');
}
