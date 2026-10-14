// Isolated V2 interaction fixture. Requests never leave this in-memory adapter.
import { createRoot } from 'react-dom/client';
import { BillingWorkspace } from '../../src/app/(admin)/agency/billing-workspace';
import { AgencyWorkspace } from '../../src/app/(admin)/agency/workspace';
import { useState } from 'react';
import { agencyMonthBounds, calculateServiceRevenue, type ClientRecord } from '../../src/lib/agency/model';
import type { AgencyBusinessResponse } from '../../src/app/(admin)/agency/workspace';
import type { AgencyBillingRecord, BillingResponse } from '../../src/lib/agency/billing-types';
import { transitionBilling, validateBillingMutation } from '../../src/lib/agency/billing-transitions';
import './agency-workspace.css';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const clients: ClientRecord[] = [
  { id: id(1), revision: 1, name: 'Northstar Beauty', brandIds: [id(101)], serviceStart: '2026-01-01', serviceEnd: null, exitReason: null, terms: [{effectiveMonth:'2026-01',monthlyRetainer:3000,revSharePercent:5,feeModel:'additive'}], updatedAt:null },
  { id: id(2), revision: 1, name: 'Everyday Wellness', brandIds: [id(102)], serviceStart: '2026-05-01', serviceEnd: null, exitReason: null, terms: [{effectiveMonth:'2026-05',monthlyRetainer:6000,revSharePercent:3,feeModel:'minimum'}], updatedAt:null },
  { id: id(3), revision: 1, name: 'Silverline Essentials', brandIds: [id(103)], serviceStart: '2025-03-01', serviceEnd: '2026-09-15', exitReason: 'Service completed', terms: [{effectiveMonth:'2025-03',monthlyRetainer:0,revSharePercent:7,feeModel:'share'}], updatedAt:null },
  { id: id(4), revision: 1, name: 'New Client', brandIds: [id(104)], serviceStart: null, serviceEnd: null, exitReason: null, terms: [], updatedAt:null },
];
const history: AgencyBillingRecord[] = [];
let failNext = false;
let storageReady = true;
let readOnly = false;
function business(month: string): AgencyBusinessResponse {
 const period = agencyMonthBounds(month), d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth()-1);
 const prior = agencyMonthBounds(d.toISOString().slice(0,7));
 return { month, periodStart:period.start, periodEnd:period.end, priorPeriodStart:prior.start, priorPeriodEnd:prior.end, clients,
 brands:clients.map(c=>({id:c.brandIds[0],slug:c.id,name:c.name,logoUrl:null,archived:false})),
 performance:[82500,135900,988400,null].map((gmv,i)=>({brandId:id(101+i),managedGmv:gmv,priorManagedGmv:gmv===null?null:gmv*.89,complete:gmv!==null,priorComplete:gmv!==null,recordedThrough:period.end})),storageReady:true,canEdit:!readOnly };
}
// Seed one billed example; other rows remain ready for interactive review.
{
 const client=clients[1], data=business('2026-09'), at='2026-10-01T18:00:00Z';
 const evidence={client,terms:client.terms[0],periodStart:data.periodStart,periodEnd:data.periodEnd,managedGmvCents:13590000,gmvComplete:true,recordedThrough:data.periodEnd,calculatedAt:at,calculationStatus:'calculated' as const};
 const reviewed=transitionBilling(null,{action:'review',clientId:client.id,month:data.month,expectedRevision:0,requestId:id(501),clientRevision:1,adjustmentCents:0,expectedCalculatedCents:600000},id(999),at,{evidence,calculatedCents:600000});
 const billed=transitionBilling(reviewed,{action:'invoice',clientId:client.id,month:data.month,expectedRevision:1,requestId:id(502),reference:'SAMPLE-2026-09',issuedOn:'2026-10-01',dueOn:'2026-10-15'},id(999),at);
 const received=transitionBilling(billed,{action:'receipt',clientId:client.id,month:data.month,expectedRevision:2,requestId:id(503),reference:'SAMPLE-RECEIPT',receivedOn:'2026-10-01',amountCents:200000},id(999),at);
 history.push(reviewed,billed,received);
}
window.fetch = async (input, init) => {
 const url = new URL(String(input),location.origin);
 if (url.pathname === '/api/agency/business') return Response.json(business(url.searchParams.get('month') || '2026-09'));
 if (url.pathname === '/api/agency/billing') {
  if(init?.method === 'POST') {
   if(failNext) { failNext=false; return Response.json({error:'Fixture save failure. Your draft is preserved.'},{status:503}); }
   try {
    const input=validateBillingMutation(JSON.parse(String(init.body)));
    const prior=history.filter(r=>r.clientId===input.clientId&&r.month===input.month).at(-1)??null;
    const client=clients.find(c=>c.id===input.clientId)!;
    const data=business(input.month), performance=data.performance.find(p=>p.brandId===client.brandIds[0]);
    const gmv=performance?.managedGmv===null?null:Math.round((performance?.managedGmv??0)*100);
    const calculated=calculateServiceRevenue({client,month:input.month,periodStart:data.periodStart,periodEnd:data.periodEnd,gmvCents:gmv,gmvComplete:performance?.complete??false});
    const at=new Date().toISOString();
    const saved=transitionBilling(prior,input,id(999),at,calculated.terms?{calculatedCents:calculated.revenueCents,evidence:{client,terms:calculated.terms,periodStart:data.periodStart,periodEnd:data.periodEnd,managedGmvCents:gmv,gmvComplete:performance?.complete??false,recordedThrough:data.periodEnd,calculatedAt:at,calculationStatus:calculated.status}}:undefined);
    history.push(saved);return Response.json(saved);
   } catch(error){return Response.json({error:error instanceof Error?error.message:'Fixture failure'},{status:400});}
  }
  const month=url.searchParams.get('month');
  const selected=history.filter(r=>!month||r.month===month);
  const records=[...new Map(selected.map(r=>[`${r.clientId}:${r.month}`,r])).values()];
  return Response.json({records,history:selected,storageReady,canEdit:!readOnly} satisfies BillingResponse);
 }
 return Response.json({error:'No network access in fixture'},{status:404});
};
function App(){
 const [overview,setOverview]=useState(false), [key,setKey]=useState(0);
 return <><div className="fixtureToolbar"><strong>LOCAL FIXTURE · Sample data · No live writes</strong><button onClick={()=>setOverview(!overview)}>{overview?'Billing':'Overview'}</button><button onClick={()=>{document.documentElement.classList.toggle('dark');}}>Theme</button><button onClick={()=>{failNext=true;}}>Fail next save</button><button onClick={()=>{storageReady=!storageReady;setKey(k=>k+1);}}>Storage readiness</button><button onClick={()=>{readOnly=!readOnly;setKey(k=>k+1);}}>Read-only</button></div><main className="fixtureMain" key={key}>{overview?<AgencyWorkspace view="overview" initialMonth="2026-09"/>:<BillingWorkspace initialMonth="2026-09"/>}</main></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
