import { z } from 'zod';

const handle=z.string().regex(/^[a-z0-9_.]+$/);
const amount=z.number().finite();
export const communitySnapshot=z.object({
 version:z.literal(1),importedAt:z.string().datetime(),creatorDate:z.string().nullable(),videoDate:z.string().nullable(),previousDate:z.string().nullable(),coverage:z.string(),
 topCreators:z.array(z.object({handle,gmv:amount,rank:z.number().int().positive()})).max(5),
 improvements:z.array(z.object({handle,gmv:amount,previousGmv:amount})).max(3),
 topVideos:z.array(z.object({videoId:z.string().regex(/^\d{17,20}$/),handle,gmv:amount,postDate:z.string().nullable(),rank:z.number().int().positive(),url:z.string().url()})).max(5)
});
export type CommunitySnapshot=z.infer<typeof communitySnapshot>;
export type CampaignEvidence={id:string;source:'Tempo'|'Discord';label:string;text:string;at:string;url?:string};
export type Campaign={id:string;guild_id:string;source_key:string;subject_key:string;category:string;title:string;reason:string;draft:string;evidence:CampaignEvidence[];target_channel:string|null;status:'ready'|'approved'|'scheduled'|'published'|'dismissed';owner_label:string;planned_at:string|null;created_at:string;updated_at:string};
export function freshReport(day:string|null,now=Date.now()){if(!day)return false;const age=now-Date.parse(day+'T00:00:00Z');return age>=0&&age<=7*86400000;}
export function tempoEvidence(s:CommunitySnapshot):CampaignEvidence[]{
 const evidence:CampaignEvidence[]=[];
 if(freshReport(s.creatorDate)){
  for(const c of s.topCreators)evidence.push({id:`creator:${c.handle}:${s.creatorDate}`,source:'Tempo',label:`#${c.rank} reported account on ${s.creatorDate}`,text:`@${c.handle}: $${c.gmv.toFixed(2)} GMV earned on ${s.creatorDate}. Rank ${c.rank} among reported brand accounts for this date. Not a lifetime ranking or a verified managed-roster membership.`,at:s.creatorDate!,url:`https://www.tiktok.com/@${c.handle}`});
  for(const c of s.improvements)evidence.push({id:`improvement:${c.handle}:${s.creatorDate}`,source:'Tempo',label:'Reported day-over-day growth',text:`@${c.handle}: $${c.gmv.toFixed(2)} GMV on ${s.creatorDate}, compared with $${c.previousGmv.toFixed(2)} on ${s.previousDate}. Both dates have actual reports.`,at:s.creatorDate!,url:`https://www.tiktok.com/@${c.handle}`});
 }
 if(freshReport(s.videoDate))for(const v of s.topVideos)evidence.push({id:`video:${v.videoId}:${s.videoDate}`,source:'Tempo',label:`#${v.rank} reported video on ${s.videoDate}`,text:`@${v.handle}: video ${v.videoId} earned $${v.gmv.toFixed(2)} GMV on ${s.videoDate}, rank ${v.rank} among reported brand videos that day. Posted ${v.postDate??'date unknown'}. The video has not been watched; no claims about hooks or editing.`,at:s.videoDate!,url:`https://www.tiktok.com/@${v.handle}/video/${v.videoId}`});
 return evidence;
}
export const generatedCampaigns=z.object({posts:z.array(z.object({category:z.enum(['recognition','top_videos','inspo','campaign']),title:z.string().min(1).max(120),reason:z.string().min(1).max(500),draft:z.string().min(1).max(2200),evidenceIds:z.array(z.string()).min(1).max(4)}).strict()).max(4)}).strict();
export function validateCampaigns(value:unknown,evidence:CampaignEvidence[]){
 const data=generatedCampaigns.parse(value);const byId=new Map(evidence.map(e=>[e.id,e]));
 return data.posts.map(p=>{
  if(p.evidenceIds.some(id=>!byId.has(id))||/[\u2013\u2014]/.test(p.draft))throw Error('Unsupported campaign evidence or voice');
  const selected=p.evidenceIds.map(id=>byId.get(id)!);
  const dollars=(s:string)=>[...s.matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/g)].map(m=>Number(m[1].replaceAll(',','')));
  const supported=new Set(selected.flatMap(e=>dollars(e.text)));
  if(dollars(p.draft).some(n=>!supported.has(n)))throw Error('Unverified monetary claim');
  if(selected.some(e=>e.id.startsWith('video:')&&p.draft.includes(e.id.split(':')[1])))throw Error('Raw video identifier in draft');
  if(p.category==='top_videos'&&!selected.some(e=>e.source==='Tempo'&&e.id.startsWith('video:')))throw Error('Video ranking requires Tempo evidence');
  // Links are rendered separately from trusted source records, never invented by a model.
  if(/https?:\/\//i.test(p.draft))throw Error('Links must use source records');
  return {...p,evidence:selected};
 });
}
