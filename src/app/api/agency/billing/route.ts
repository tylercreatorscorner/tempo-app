import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceScope } from '@/lib/auth/workspace-scope';
import { createAdminClient } from '@/lib/supabase/server';
import { canAccessAgency } from '@/lib/agency/access';
import { agencyMonthBounds, AgencyValidationError, calculateServiceRevenue, type ClientRecord } from '@/lib/agency/model';
import { transitionBilling, validateBillingMutation } from '@/lib/agency/billing-transitions';
import type { AgencyBillingRecord, BillingEvidence } from '@/lib/agency/billing-types';
export const runtime = 'nodejs';
export const maxDuration = 60;
const reply = (body: unknown, status=200) => NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const missing = (e: {code?:string}|null) => Boolean(e && ['PGRST202','42883','42P01'].includes(e.code ?? ''));
const monthNow = () => { const p = new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit'}).formatToParts(new Date()); return `${p.find(v=>v.type==='year')!.value}-${p.find(v=>v.type==='month')!.value}`; };
const validMonth = (v:string) => /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(v) && v < monthNow();
export async function GET(request: NextRequest) {
  const scope = await getWorkspaceScope();
  if (!canAccessAgency(scope)) return reply({error:'Agency access is restricted to authorized leadership.'},scope?403:401);
  const month=request.nextUrl.searchParams.get('month');
  if (month && !validMonth(month)) return reply({error:'Choose a completed service month.'},400);
  try {
    const db=await createAdminClient();
    const result=await db.rpc('agency_billing_list',{p_tenant_id:scope.tenantId,p_month:month ? `${month}-01`:null});
    if (result.error) return missing(result.error) ? reply({records:[],history:[],storageReady:false,canEdit:false}) : reply({error:'Billing history could not be loaded.'},503);
    return reply({...result.data,storageReady:true,canEdit:canAccessAgency(scope,true)});
  } catch { return reply({error:'Billing history could not be loaded.'},503); }
}
export async function POST(request: NextRequest) {
  const scope=await getWorkspaceScope();
  if (!canAccessAgency(scope,true)) return reply({error:'You do not have permission to change agency billing.'},scope?403:401);
  if(request.headers.get('origin')!==request.nextUrl.origin) return reply({error:'Invalid request origin.'},403);
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply({error:'Send a JSON billing request.'},415);
  try {
    const raw=await request.text();
    if(raw.length>20000) return reply({error:'Billing request is too large.'},413);
    let parsed:unknown; try{parsed=JSON.parse(raw);}catch{return reply({error:'Invalid JSON.'},400);}
    const input=validateBillingMutation(parsed);
    if(!validMonth(input.month)) return reply({error:'Choose a completed service month.'},400);
    const db=await createAdminClient();
    // Canonical field ordering makes request retries insensitive to JSON key order.
    const canonical=JSON.stringify(Object.fromEntries(Object.entries(input).sort(([a],[b])=>a.localeCompare(b))));
    const requestHash=createHash('sha256').update(canonical).digest('hex');
    const retry=await db.from('agency_billing_revisions').select('request_hash,actor_id,snapshot').eq('tenant_id',scope.tenantId).eq('request_id',input.requestId).maybeSingle();
    if(retry.error) return reply({error:'Billing storage is not available.'},503);
    if(retry.data) return retry.data.request_hash===requestHash && retry.data.actor_id===scope.userId ? reply(retry.data.snapshot) : reply({error:'This request ID was already used. Reload before saving.'},409);
    const previousResult=await db.from('agency_billing_revisions').select('snapshot').eq('tenant_id',scope.tenantId).eq('client_id',input.clientId).eq('service_month',`${input.month}-01`).order('revision',{ascending:false}).limit(1).maybeSingle();
    if(previousResult.error) return reply({error:'Billing record could not be loaded.'},503);
    const previous=(previousResult.data?.snapshot ?? null) as AgencyBillingRecord|null;
    let source: {evidence:BillingEvidence;calculatedCents:number|null}|undefined;
    if(input.action==='review'||input.action==='correct_review') {
      const [clientResult,performance]=await Promise.all([
        db.rpc('agency_business_list_clients',{p_tenant_id:scope.tenantId}),
        db.rpc('agency_business_month_performance',{p_tenant_id:scope.tenantId,p_month:`${input.month}-01`})
      ]);
      if(clientResult.error||performance.error) return reply({error:'Could not verify the source calculation.'},503);
      const client=(clientResult.data as ClientRecord[]).find(c=>c.id===input.clientId);
      if(!client) return reply({error:'Client is not available in this agency.'},404);
      const rows=(performance.data ?? []) as {brand_id:string;managed_gmv:number|string|null;complete:boolean;recorded_through:string|null}[];
      const linked=client.brandIds.map(id=>rows.find(r=>r.brand_id===id));
      const complete=linked.length>0&&linked.every(r=>r?.complete===true&&r.managed_gmv!==null);
      const totals=linked.map(r=>r?.managed_gmv===null||r?.managed_gmv===undefined?null:Math.round(Number(r.managed_gmv)*100));
      const sum=totals.every(v=>v!==null&&Number.isSafeInteger(v))?totals.reduce<number>((s,v)=>s+(v??0),0):null;
      const gmv=sum!==null&&Number.isSafeInteger(sum)?sum:null;
      const period=agencyMonthBounds(input.month);
      const calculation=calculateServiceRevenue({client,month:input.month,periodStart:period.start,periodEnd:period.end,gmvCents:gmv,gmvComplete:complete});
      if(!calculation.terms || (calculation.revenueCents===null && !(calculation.status==='review_required' && 'manualReviewedCents' in input && input.manualReviewedCents !== undefined))) return reply({error:'Resolve client dates, terms, or GMV coverage before review.'},400);
      const through=linked.map(r=>r?.recorded_through??null);
      source={calculatedCents:calculation.revenueCents,evidence:{calculationStatus:calculation.status,client,terms:calculation.terms,periodStart:period.start,periodEnd:period.end,managedGmvCents:gmv,gmvComplete:complete,recordedThrough:through.length&&through.every(Boolean)?(through as string[]).sort()[0]:null,calculatedAt:new Date().toISOString()}};
    }
    const snapshot=transitionBilling(previous,input,scope.userId,new Date().toISOString(),source);
    const saved=await db.rpc('agency_billing_append',{p_tenant_id:scope.tenantId,p_actor_id:scope.userId,p_client_id:input.clientId,p_month:`${input.month}-01`,p_expected_revision:input.expectedRevision,p_request_id:input.requestId,p_request_hash:requestHash,p_snapshot:snapshot,p_client_revision:source?.evidence.client.revision??null});
    if(saved.error) {
      if(/changed|already used|reference already/i.test(saved.error.message)) return reply({error:'Billing or client details changed, or that reference is already recorded. Reload before saving.'},409);
      return reply({error:'Billing update could not be saved. Please try again.'},503);
    }
    return reply(saved.data);
  }catch(e){return e instanceof AgencyValidationError?reply({error:e.message},/changed/.test(e.message)?409:400):reply({error:'Billing update could not be saved.'},503);}
}
