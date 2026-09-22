import type { OpsMessage } from './model';

export function avatarIdentity(name:string,messages:OpsMessage[],metric:{discord_id?:string;snapshot?:{matchVersion?:number;matchError?:unknown}}|null,author:string|null) {
  // Explicit speaker lookups are restricted to authors in this authorized ticket.
  if(author)return messages.some(m=>m.authorId===author)?author:null;
  if(metric?.snapshot?.matchVersion===2&&!metric.snapshot.matchError&&/^\d{17,20}$/.test(metric.discord_id??''))return metric.discord_id!;
  // Display identity can be known even when no TikTok/GMV account is linked.
  const normalize=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
  const ticket=normalize(name);
  if(!ticket)return null;
  const matches=[...new Set(messages.filter(m=>!m.bot&&normalize(m.author)===ticket).map(m=>m.authorId))];
  return matches.length===1&&/^\d{17,20}$/.test(matches[0])?matches[0]:null;
}
