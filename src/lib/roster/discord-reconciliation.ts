export const JIYU_ROLE = {tenantId:'00000000-0000-0000-0000-000000000001',brand:'jiyu',guildId:'1339335585776533708',roleId:'1494792342069186620',roleName:'Elites'} as const;
export type MemberState = 'aligned'|'missing_role'|'missing_identity'|'identity_conflict'|'not_in_server'|'unavailable';
export type ComparisonRow = {id:number;name:string;discordId:string|null;state:MemberState};
export type IdentityRow = {id:number;real_name:string|null;discord_id:string|null;discord_user_id:string|null;canonicalDiscordId:string|null};
export function resolveIdentities(rows:IdentityRow[]):ComparisonRow[]{
 const identities=rows.map(row=>{
  const values=[row.discord_id,row.discord_user_id,row.canonicalDiscordId].filter((v):v is string=>!!v?.trim()).map(v=>v.trim());
  const unique=[...new Set(values)];
  const valid=unique.length===1 && /^\d{17,20}$/.test(unique[0]);
  return {id:row.id,name:row.real_name||`Creator ${row.id}`,discordId:valid?unique[0]:null,state:(unique.length===0?'missing_identity':valid?'unavailable':'identity_conflict') as MemberState};
 });
 const counts=new Map<string,number>();
 // Count every claimed ID, including claims on already-conflicted records.
 // Otherwise a clean-looking row could reuse an account from an ambiguous row.
 for(const row of rows){
  const claims=new Set([row.discord_id,row.discord_user_id,row.canonicalDiscordId].filter((v):v is string=>!!v?.trim()).map(v=>v.trim()));
  for(const id of claims)counts.set(id,(counts.get(id)||0)+1);
 }
 return identities.map(row=>row.discordId && (counts.get(row.discordId)??0)>1?{...row,state:'identity_conflict',discordId:null}:row);
}
export function memberState(status:number,roles:unknown):MemberState{
 if(status===404)return 'not_in_server';
 if(status!==200 || !Array.isArray(roles) || roles.some(r=>typeof r!=='string'))return 'unavailable';
 return roles.includes(JIYU_ROLE.roleId)?'aligned':'missing_role';
}
