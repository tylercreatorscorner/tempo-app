import type { OpsBrand, OpsChannel } from './model';
export function followupDue(c:OpsChannel,now=Date.now()){
  return c.status!=='resolved'&&!!c.followup_at&&Date.parse(c.followup_at)<=now;
}
export function scheduledLater(c:OpsChannel,now=Date.now()){
  return !!c.followup_at&&Date.parse(c.followup_at)>now;
}
export function needsReview(c:OpsChannel,now=Date.now()){
  if(c.status==='resolved'||scheduledLater(c,now))return false;
  return followupDue(c,now)||(['open','waiting_team'].includes(c.status)&&!!c.assessment&&c.assessment_hash===c.source_hash&&c.assessment.action!=='wait');
}
export function olderConversation(c:OpsChannel,now=Date.now()){
  const activity=c.last_creator_at||c.last_message_at;
  return needsReview(c,now)&&!followupDue(c,now)&&!!activity&&now-Date.parse(activity)>30*86400000;
}
export function isEscalated(c:OpsChannel,b?:OpsBrand,now=Date.now()){
  const since=(c.assessment as (NonNullable<OpsChannel['assessment']>&{waitingSince?:string|null}))?.waitingSince;
  return c.kind==='ticket'&&needsReview(c,now)&&!olderConversation(c,now)&&c.status!=='waiting_creator'&&c.assessment?.waitingFromCreator===true&&!!since&&!!b?.settings.escalationHours&&now-Date.parse(since)>=b.settings.escalationHours*3600000;
}
export function nextChannelId(channels:Pick<OpsChannel,'channel_id'>[],current:string){
  const index=channels.findIndex(c=>c.channel_id===current);
  return index>=0?channels[index+1]?.channel_id??null:null;
}
export function statusAfterAssessment(c:OpsChannel,action:string,now=Date.now()):OpsChannel['status']{
  if(scheduledLater(c,now)||action==='wait'||c.reviewed_hash===c.source_hash)return c.status;
  return ['resolved','waiting_creator'].includes(c.status)?'open':c.status;
}
