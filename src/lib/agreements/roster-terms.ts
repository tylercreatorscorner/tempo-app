import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
/** Call only after the caller has scoped the roster rows. The RPC also binds every ID to the tenant. */
export async function applyRosterAgreementTerms<T extends {id:string|number;retainer:number|string|null;monthly_post_requirement?:number|null}>(rows:T[],tenantId:string,asOf:string):Promise<void> {
 if(process.env.CREATOR_AGREEMENTS_ENABLED!=='true' || !rows.length) return;
 const admin=await createAdminClient();
 for(let from=0;from<rows.length;from+=200) {
  const batch=rows.slice(from,from+200);
  const {data,error}=await admin.rpc('get_roster_agreement_terms',{p_tenant:tenantId,p_ids:batch.map(r=>Number(r.id)),p_as_of:asOf});
  if(error) throw Error('Agreement terms are unavailable. Please retry after renewals complete.');
  const values=new Map((data ?? []).map((r:{managed_creator_id:number;agreement:{retainer:number;quota:number|null}|null})=>[String(r.managed_creator_id),r.agreement]));
  for(const row of batch) {const agreement=values.get(String(row.id)) as {retainer:number;quota:number|null}|undefined|null;if(agreement){row.retainer=agreement.retainer;if('monthly_post_requirement' in row)row.monthly_post_requirement=agreement.quota;}}
 }
}
