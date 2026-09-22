export const pilotGuilds = {
  '1166776019655602236': {name:'Cata-Kor',slug:'catakor'},
  '1339335585776533708': {name:'JiYu',slug:'jiyu'},
  '1449103988627603659': {name:'LeeFar',slug:'leefar'},
  '1452033395587813428': {name:'Dr. Dent',slug:'dr_dent'},
  '1496923650560098565': {name:'Lemme',slug:'lemme'},
  '1512067155905085522': {name:'M3',slug:'m3'},
  '1524384421120053398': {name:'Bondie',slug:'bondie'},
} as const;
export type OpsMessage={id:string;author:string;authorId:string;bot:boolean;text:string;at:string;editedAt:string|null;attachments:number};
export type OpsAssessment={issue:string;category:'Payments'|'Posting blockers'|'Decisions & onboarding'|'Recognition'|'Community';action:'team'|'reply'|'wait'|'review';who:string;nextMove:string;draft:string|null;evidenceIds:string[];waitingSinceMessageId:string|null;waitingFromCreator?:boolean;preparedAt:string};
export type OpsSettings={firstOwner?:string;escalationOwner?:string;escalationHours?:number|null;voice?:string;priorities?:string;communityEnabled?:boolean;communityCategories?:string[];communityDailyLimit?:number};
export type OpsBrand={guild_id:string;name:string;slug:string;tenant_id:string;enabled:boolean;settings:OpsSettings;scanned_at:string|null;scan_error:string|null;updated_at:string};
export type OpsChannel={queueEvidence?:{creatorConfirmed:boolean;waitingFromCreator:boolean;latestFromCreator:boolean};channel_id:string;tenant_id:string;guild_id:string;name:string;kind:'ticket'|'community';enabled:boolean;messages:OpsMessage[];source_hash:string|null;assessment_hash:string|null;assessment:OpsAssessment|null;status:'open'|'waiting_team'|'waiting_creator'|'snoozed'|'resolved';owner_label:string|null;followup_at:string|null;note:string;draft:string;updated_at:string;synced_at:string|null;last_message_at:string|null;last_creator_at:string|null;error:string|null;reviewed_hash:string|null;metrics?:{creator_name:string|null;handles:string[];snapshot:Record<string,unknown>;imported_at:string}|null};
export const opsUrl=(guild:string,channel:string,message?:string)=>`https://discord.com/channels/${guild}/${channel}${message?'/'+message:''}`;
export function escalationDue(c:OpsChannel,b:OpsBrand,now=Date.now()){
  if(c.kind!=='ticket'||c.status==='resolved'||c.assessment?.action==='wait'||!b.settings.escalationHours)return false;
  const start=c.messages.find(m=>m.id===c.assessment?.waitingSinceMessageId)?.at;
  return !!start&&now-Date.parse(start)>=b.settings.escalationHours*3600000;
}
