'use client';
import { useEffect, useRef, useState } from 'react';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import { AgreementPreview, type AgreementFormRevision, type AgreementFormTerms } from './agreement-preview';
import type { AgreementCommand, AgreementLedger, AgreementTerms } from '@/lib/agreements/model';
import styles from './agreement-preview.module.css';
interface SavedAgreement { id:string; version:number; state:AgreementLedger }
interface Brand {value:string;label:string}
function formTerms(terms:AgreementTerms,ledger:AgreementLedger,brand:string):AgreementFormTerms {
 return {brand,kind:ledger.kind,amount:String(terms.feeCents/100),posts:String(terms.requiredPosts),start:ledger.start,firstPeriodEnd:ledger.firstPeriodEnd,end:ledger.deadline ?? '',renewal:terms.renewal==='automatic'?'auto':'manual',proration:terms.payment==='prorated_posts'?'posts':'full',credits:terms.priorPeriodCredits==='approval_required'?'review':'none'};
}
function commandFor(revision:AgreementFormRevision):AgreementCommand {
 const t=revision.terms;
 const terms:AgreementTerms={feeCents:Math.round(Number(t.amount)*100),requiredPosts:Number(t.posts),renewal:t.kind==='monthly' && t.renewal==='auto'?'automatic':'manual',payment:t.proration==='posts'?'prorated_posts':'full_fee',priorPeriodCredits:t.credits==='review'?'approval_required':'not_allowed'};
 if(revision.action==='new') return {action:'create',kind:t.kind as AgreementLedger['kind'],start:t.start,firstPeriodEnd:t.firstPeriodEnd,deadline:t.kind==='monthly'?null:t.end,terms,reason:revision.reason.trim() || 'Agreement terms confirmed at creation'};
 if(revision.action==='end') return {action:'end',finalDate:revision.effective,reason:revision.reason};
 return {action:'change',effective:revision.effective,scope:revision.scope==='future'?'future':'period',terms,reason:revision.reason};
}
async function fetchAgreements(creatorId:string,brandId:string,signal?:AbortSignal):Promise<SavedAgreement[]> {
 const response=await fetch(`/api/creator-agreements?${new URLSearchParams({creatorId,brandId})}`,{signal,cache:'no-store'});
 const result=await response.json();
 if(!response.ok) throw Error(result.error || 'Agreements unavailable');
 return result.agreements;
}
export function AgreementWorkspace({creatorId,brands,today,canWrite,canSave}:{creatorId:string;brands:Brand[];today:string;canWrite:boolean;canSave:boolean}) {
 const [brand,setBrand]=useState(brands[0]?.value ?? '');
 return <div className={styles.root}><div className={styles.heading}><div><span className={styles.kicker}>Agreement history</span><h2>Terms that stay with their period</h2></div><ChoiceMenu label="Agreement brand" value={brand} options={brands} onChange={setBrand}/></div>{brand && <BrandAgreements key={brand} creatorId={creatorId} brand={brands.find(b=>b.value===brand)!} today={today} canWrite={canWrite} canSave={canSave}/>}</div>;
}
function BrandAgreements({creatorId,brand,today,canWrite,canSave}:{creatorId:string;brand:Brand;today:string;canWrite:boolean;canSave:boolean}) {
 const [rows,setRows]=useState<SavedAgreement[]|null>(null);
 const [error,setError]=useState('');
 const [selected,setSelected]=useState('');
 const [periodStart,setPeriodStart]=useState('');
 const [generation,setGeneration]=useState(0);
 const [renewReview,setRenewReview]=useState(false);
 const [renewBusy,setRenewBusy]=useState(false);
 const [renewError,setRenewError]=useState('');
 const request=useRef<{fingerprint:string;id:string;requestId:string}|null>(null);
 async function load() {const next=await fetchAgreements(creatorId,brand.value);setRows(next);setError('');}
 useEffect(()=>{const controller=new AbortController();
 void fetchAgreements(creatorId,brand.value,controller.signal).then(next=>{if(!controller.signal.aborted){setRows(next);setError('');}}).catch(error=>{if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Unable to load agreements');});
 return()=>controller.abort();},[creatorId,brand.value]);
 const row=rows?.find(row=>row.id===selected) ?? (selected==='new'?undefined:rows?.[0]);
 const period=row?.state.periods.find(p=>p.start===periodStart) ?? row?.state.periods.at(-1);
 const revision=period?.revisions.at(-1);
 const currentTerms=revision?.segments.at(-1)?.terms ?? row?.state.rules.at(-1)?.terms;
 const current:AgreementFormRevision|undefined=row && currentTerms?{terms:formTerms(currentTerms,row.state,brand.value),action:row.state.finalDate?'end':'change',effective:period?.start ?? row.state.start,scope:'future',reason:''}:undefined;
 const renewalDate=period?new Date(new Date(period.through+'T00:00:00Z').getTime()+86400000).toISOString().slice(0,10):today;
 const renewal=row?.state.rules.toReversed().find(rule=>rule.from<=renewalDate && (!rule.through || rule.through>=renewalDate))?.terms;
 async function submitCommand(command:AgreementCommand,preview:boolean) {
  const fingerprint=JSON.stringify({id:row?.id,version:row?.version,command});
  if(request.current?.fingerprint!==fingerprint) request.current={fingerprint,id:row?.id ?? crypto.randomUUID(),requestId:crypto.randomUUID()};
  const response=await fetch('/api/creator-agreements',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({creatorId,brandId:brand.value,id:request.current.id,version:row?.version ?? 0,requestId:request.current.requestId,command,preview})});
  const result=await response.json();
  if(!response.ok) throw Error(result.error || 'Agreement could not be saved');
  if(!preview){setSelected(result.id);await load();setGeneration(value=>value+1);}
 }
 async function submit(form:AgreementFormRevision,preview:boolean) {await submitCommand(commandFor(form),preview);}
 const lastPeriod=row?.state.periods.at(-1);
 const nextPeriod=lastPeriod?new Date(new Date(lastPeriod.through+'T00:00:00Z').getTime()+86400000).toISOString().slice(0,10):null;
 const nextTerms=row?.state.rules.toReversed().find(rule=>nextPeriod && rule.from<=nextPeriod && (!rule.through || rule.through>=nextPeriod))?.terms;
 const canRenew=canWrite && row?.state.kind==='monthly' && nextPeriod && nextPeriod<=today && (!row.state.finalDate || nextPeriod<=row.state.finalDate) && nextTerms?.renewal==='manual';
 async function renew() {
  setRenewBusy(true);setRenewError('');
  try {await submitCommand({action:'renew',through:today,reason:'Manual renewal confirmed for '+nextPeriod},!renewReview);setRenewReview(!renewReview);}
  catch(error){setRenewError(error instanceof Error?error.message:'Renewal unavailable');}
  finally{setRenewBusy(false);}
 }
 if(error) return <div className={styles.review} role="alert"><p>{error}</p><button onClick={()=>void load().catch(error=>setError(error.message))}>Retry</button></div>;
 if(!rows) return <div className={styles.review} role="status">Loading agreement history...</div>;
 return <div>
   <div className={styles.footer}>
    {rows.length>0 && <ChoiceMenu label="Agreement" value={row?.id ?? 'new'} options={[...rows.map(r=>({value:r.id,label:`${r.state.start} · ${r.state.kind}`})),...(canWrite?[{value:'new',label:'New agreement'}]:[])]} onChange={value=>{setSelected(value);setPeriodStart('');}}/>}
    {row && <ChoiceMenu label="Agreement period" value={period!.start} options={row.state.periods.map(p=>({value:p.start,label:`${p.start} to ${p.through}`})).reverse()} onChange={setPeriodStart}/>}
   </div>
   {canRenew && <div className={styles.review}><strong>{renewReview?'Confirm renewal':'Awaiting renewal'}</strong><p>{nextPeriod} starts the next period at ${(nextTerms.feeCents/100).toLocaleString()} for {nextTerms.requiredPosts} posts. Earlier periods stay unchanged. This does not approve payment.</p><button className={styles.primary} disabled={renewBusy || (renewReview && !canSave)} onClick={()=>void renew()}>{renewBusy?'Checking...':renewReview?'Confirm renewal':'Review renewal'}</button>{renewReview && <button disabled={renewBusy} onClick={()=>setRenewReview(false)}>Cancel</button>}{renewError && <p role="alert">{renewError}</p>}</div>}
   {!rows.length && <p className={styles.review}>No verified agreements recorded yet. Current roster terms have not been copied into historical periods.</p>}
   <AgreementPreview key={`${row?.id ?? 'new'}-${row?.version ?? 0}-${period?.start ?? ''}-${generation}`} brands={[brand]} today={today} integration={{current,renewalTerms:row && renewal?formTerms(renewal,row.state,brand.value):undefined,periodStart:period?.start,periodEnd:period?.through,readOnly:!canWrite,canSave,ended:Boolean(row?.state.finalDate),onReview:form=>submit(form,true),onSave:form=>submit(form,false)}}/>
   {period && <div className={styles.history}><h3>Recorded revisions</h3>{[...period.revisions].reverse().map(rev=><div className={styles.event} key={rev.version}><span>v{rev.version}</span><div><strong>{rev.reason}</strong><p>{new Date(rev.recordedAt).toLocaleString()} · {rev.actor==='system:renewal'?'Automatic renewal':'Team member'}</p>{rev.cancelled?<p>Cancelled period · retained for history</p>:rev.segments.map(segment=><p key={segment.from}>{segment.from} to {segment.through} · ${(segment.terms.feeCents/100).toLocaleString()} · {segment.terms.requiredPosts} posts</p>)}{rev.paymentReviewRequired && <p>Payment calculation requires review.</p>}</div></div>)}</div>}
 </div>;
}
