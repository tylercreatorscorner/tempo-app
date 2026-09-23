import type { OpsChannel } from './model';
import { needsReview, olderConversation, followupDue } from './queue-state';
export type QueueEvidence={creatorConfirmed:boolean;waitingFromCreator:boolean;latestFromCreator:boolean};
export type WorkLane='reply'|'decision'|'team'|'review'|'older'|'waiting';
export function workLane(c:OpsChannel):WorkLane {
  if(c.kind==='ticket'&&c.status==='waiting_team')return 'team';
  if(!needsReview(c))return 'waiting';
  if(olderConversation(c))return 'older';
  if(c.status==='waiting_team'||c.assessment?.action==='team')return 'team';
  const proof=c.queueEvidence;
  if(!proof?.creatorConfirmed||!proof.waitingFromCreator)return 'review';
  if(c.assessment?.action==='reply'&&proof.latestFromCreator&&c.draft.trim())return 'reply';
  if(c.assessment?.action==='review'&&c.assessment.category==='Decisions & onboarding'&&proof.latestFromCreator)return 'decision';
  return 'review';
}
export function dailyRank(a:OpsChannel,b:OpsChannel){
  return Number(followupDue(b))-Number(followupDue(a))||Date.parse(b.last_creator_at||b.last_message_at||'1970-01-01')-Date.parse(a.last_creator_at||a.last_message_at||'1970-01-01')||a.channel_id.localeCompare(b.channel_id);
}
export const laneLabels:Record<WorkLane,string>={reply:'Review reply',decision:'Decide',team:'Team follow-through',review:'Check context',older:'Older work',waiting:'Not in active queue'};
