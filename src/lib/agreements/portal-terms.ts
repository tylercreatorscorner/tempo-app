import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RosterAgreement } from './roster-terms';
/** The caller must already authorize the brand UUID. Bind its slug/tenant before resolving private terms. */
export async function portalAgreementTenant(client:SupabaseClient,brandId:string,slug:string):Promise<string|null> {
 if(process.env.CREATOR_AGREEMENTS_ENABLED!=='true') return null;
 const {data,error}=await client.from('brands_v2').select('tenant_id').eq('id',brandId).eq('slug',slug).maybeSingle();
 if(error || !data?.tenant_id) throw Error('Agreement brand could not be verified.');
 return data.tenant_id;
}
/** Deliberately omit private revision actors, reasons and term rules. */
export function portalAgreementSummary(agreement?:RosterAgreement|null) {
 return {
  hasVerifiedAgreement:!!agreement,
  agreementPeriod:agreement?.periodStart && agreement.periodEnd ? `${agreement.periodStart}–${agreement.periodEnd}` : undefined,
  agreementStatus:agreement?.status,
 };
}
