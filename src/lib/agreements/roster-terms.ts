import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { ensureAgreementPeriods } from './renewals';
import { agreementMonthEnd, type PeriodRevision } from './model';
export interface RosterAgreement {
 retainer:number; quota:number|null; periodStart?:string; periodEnd?:string;
 status:string; snapshot?:PeriodRevision;
}
export function isCalendarMonthAgreement(agreement:RosterAgreement,day:string):boolean {
 return agreement.status==='active' && agreement.periodStart===day.slice(0,7)+'-01'
  && agreement.periodEnd===agreementMonthEnd(day) && agreement.snapshot?.segments.length===1
  && agreement.snapshot.segments[0].from===agreement.periodStart
  && agreement.snapshot.segments[0].through===agreement.periodEnd;
}
/** Call only after the caller has scoped the roster rows. Every lookup also binds IDs to the tenant. */
export async function applyRosterAgreementTerms<T extends {id:string|number;retainer:number|string|null;monthly_post_requirement?:number|null;agreement?:RosterAgreement|null}>(rows:T[],tenantId:string,asOf:string):Promise<void> {
 if(process.env.CREATOR_AGREEMENTS_ENABLED!=='true' || !rows.length) return;
 const admin=await createAdminClient();
 for(let from=0;from<rows.length;from+=200) {
  const batch=rows.slice(from,from+200);
  if(process.env.CREATOR_AGREEMENTS_WRITES_ENABLED==='true') {
   const {data:links,error:linkError}=await admin.from('managed_creators').select('creator_id,brand').eq('tenant_id',tenantId).in('id',batch.map(r=>r.id));
   if(linkError) throw Error('Agreement scope could not be verified.');
   const slugs=[...new Set((links ?? []).map(r=>r.brand).filter(Boolean))];
   if(slugs.length) {
    const {data:brands,error:brandError}=await admin.from('brands_v2').select('id,slug').eq('tenant_id',tenantId).in('slug',slugs);
    if(brandError) throw Error('Agreement brands could not be verified.');
    const bySlug=new Map((brands ?? []).map(b=>[b.slug,b.id]));
    const pairs=(links ?? []).flatMap(link=> {
     const brandId=bySlug.get(link.brand);
     return brandId && link.creator_id ? [{brandId,creatorId:link.creator_id as string}] : [];
    });
    await ensureAgreementPeriods({tenantId,brandIds:[...new Set(pairs.map(p=>p.brandId))],creatorIds:[...new Set(pairs.map(p=>p.creatorId))],pairs});
   }
  }
  const {data,error}=await admin.rpc('get_roster_agreement_terms',{p_tenant:tenantId,p_ids:batch.map(r=>Number(r.id)),p_as_of:asOf});
  if(error) throw Error('Agreement terms are unavailable. Please retry.');
  const values=new Map<string,RosterAgreement|null>((data ?? []).map((r:{managed_creator_id:number;agreement:RosterAgreement|null})=>[String(r.managed_creator_id),r.agreement]));
  for(const row of batch) {
   const agreement=values.get(String(row.id));
   row.agreement=agreement ?? null;
   if(agreement){row.retainer=agreement.retainer;if('monthly_post_requirement' in row)row.monthly_post_requirement=agreement.quota;}
  }
 }
}
