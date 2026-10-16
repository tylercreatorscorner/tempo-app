'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
type Draft={id:string;brand_slug:string;report_type:string;period_start:string;period_end:string;recorded_days:number;expected_days:number;status:string;error:string|null};
export default function HistoricalReports(){
 const [rows,setRows]=useState<Draft[]>([]),[page,setPage]=useState(0),[total,setTotal]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const stopped=useRef(false);
 const load=useCallback(async()=>{const r=await fetch(`/api/client-reports/backfill?page=${page}`,{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);setRows(d.drafts);setTotal(d.total);return d.drafts as Draft[];},[page]);
 useEffect(()=>{void load().catch(e=>setMessage(e.message));return()=>{stopped.current=true;};},[load]);
 async function prepare(){setBusy(true);try{const r=await fetch('/api/client-reports/backfill',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'prepare'})});const d=await r.json();if(!r.ok)throw Error(d.error);setMessage(`${d.added} missing periods added. Existing shared reports preserved.`);await load();}catch(e){setMessage(e instanceof Error?e.message:'Could not prepare drafts.');}finally{setBusy(false);}}
 async function build(){
  setBusy(true);stopped.current=false;let built=0;
  try{
   for(let batch=0;!stopped.current;batch++){
    const list=await fetch(`/api/client-reports/backfill?page=${batch}`,{cache:'no-store'});
    const data=await list.json();if(!list.ok)throw Error(data.error);
    for(const row of (data.drafts as Draft[]).filter(r=>r.status!=='review')){
     if(stopped.current)break;
     setMessage(`Built ${built} this run. Building ${row.brand_slug}: ${row.period_start} to ${row.period_end}`);
     const response=await fetch('/api/client-reports/backfill',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'build',id:row.id})});
     if(!response.ok){const result=await response.json();throw Error(result.error);}
     built++;await load();
    }
    if((batch+1)*50>=data.total)break;
   }
   setMessage(stopped.current?`Stopped safely. ${built} drafts saved this run.`:`Generation finished. ${built} drafts saved this run for review.`);
  }catch(e){setMessage(e instanceof Error?e.message:'Connection interrupted. Saved drafts are preserved; resume to continue.');}
  finally{setBusy(false);await load().catch(()=>{});}
 }
 return <div className="space-y-5"><PageHeader title="Historical reports" subtitle="Private weekly and monthly drafts. Monday–Sunday weeks. Nothing is published automatically. Keep this tab open while generating."/><div className="flex flex-wrap items-center gap-3"><Button onClick={prepare} disabled={busy}>Find missing reports</Button><Button onClick={build} disabled={busy||total===0}>Build remaining drafts</Button>{busy&&<Button variant="ghost" onClick={()=>{stopped.current=true;setMessage('Stopping after the current draft finishes.');}}>Stop after current</Button>}<Link href="/reporting" className="text-sm text-muted-foreground">Back to reporting</Link></div><p role="status" className="text-sm text-muted-foreground">{message||`${total} historical periods. Saved reports are skipped; incomplete periods remain flagged.`}</p><div className="overflow-x-auto rounded-xl border border-border bg-card"><table className="w-full text-sm"><thead className="bg-muted/40 text-left"><tr>{['Brand','Period','Type','Recorded days','Draft'].map(h=><th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-t border-border"><td className="px-4 py-3">{r.brand_slug}</td><td className="px-4 py-3 whitespace-nowrap">{r.period_start} to {r.period_end}</td><td className="px-4 py-3 capitalize">{r.report_type}</td><td className="px-4 py-3">{r.recorded_days}/{r.expected_days}{r.recorded_days<r.expected_days?' · Incomplete':''}</td><td className="px-4 py-3">{r.status==='review'?<Link className="text-primary underline" href={`/reporting/historical/${r.id}`}>Review draft</Link>:r.error||r.status}</td></tr>)}</tbody></table></div><div className="flex items-center gap-3"><Button variant="ghost" disabled={busy||page===0} onClick={()=>setPage(p=>p-1)}>Previous</Button><span className="text-sm">Page {page+1} of {Math.max(1,Math.ceil(total/50))}</span><Button variant="ghost" disabled={busy||(page+1)*50>=total} onClick={()=>setPage(p=>p+1)}>Next</Button></div></div>;
}
