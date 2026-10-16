'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Database } from 'lucide-react';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import { DateField } from '@/components/ui/date-field';
import { Button, buttonVariants } from '@/components/ui/button';

const sources = [
  { value:'creator_compass', label:'Creator report API', detail:'Creator-level affiliate metrics from TikTok’s separate Compass report service.' },
  { value:'video_analytics', label:'Video analytics API', detail:'Paginated video IDs, creator attribution and metadata. Its broader shop GMV is kept out of affiliate reporting.' },
  { value:'affiliate_orders', label:'Affiliate orders API', detail:'Order records with creator and content attribution, captured for financial reconciliation.' },
];
export function RecoveryClient({brands,latest,initialResults}:{brands:{slug:string;name:string;connected:boolean}[];latest:string;initialResults:Record<string,unknown>[]}) {
  const [brand,setBrand]=useState(brands.find(b=>b.connected)?.slug ?? brands[0]?.slug ?? '');
  const [date,setDate]=useState(latest);
  const [busy,setBusy]=useState<string|null>(null);
  const [results,setResults]=useState<Record<string,unknown>[]>(initialResults);
  const [error,setError]=useState<string|null>(null);
  const connected=brands.find(b=>b.slug===brand)?.connected;
  async function capture(source:string) {
    setBusy(source);setError(null);
    try {
      const response=await fetch('/api/tiktok/recovery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({brand,date,source})});
      const body=await response.json();
      setResults(prev=>[{brand,date,source,...body},...prev]);
      if(!response.ok) setError(body.error ?? 'Source capture did not complete.');
    } catch { setError('The source check did not finish. Captured pages remain separate; no performance data was changed.'); }
    finally { setBusy(null); }
  }
  return <>
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <ChoiceMenu compact label="Recovery brand" value={brand} onChange={setBrand} disabled={!!busy} options={brands.map(b=>({value:b.slug,label:b.name}))} />
        <div className="w-44"><DateField aria-label="Report date" value={date} max={latest} onValueChange={setDate} disabled={!!busy}/></div>
        <span className="text-xs text-muted-foreground">One completed day, in the shop’s report timezone.</span>
      </div>
      {!connected && <div className="mt-4 rounded-lg border border-border bg-muted/50 p-3 text-sm">This brand needs a TikTok Shop connection before API recovery can run. <Link href="/workflows/integrations#tiktok-shop" className={buttonVariants({variant:'outline',size:'sm'})}>Shop connections</Link></div>}
    </section>
    <div className="grid gap-3 lg:grid-cols-3">{sources.map(s=><section key={s.value} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2"><Database size={16} className="text-primary"/><h2 className="text-sm font-semibold">{s.label}</h2></div>
      <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{s.detail}</p>
      <Button size="sm" variant="outline" disabled={!!busy||!connected||!date} onClick={()=>capture(s.value)}>{busy===s.value?<><Loader2 className="animate-spin"/>Capturing source…</>:'Inspect source'}</Button>
    </section>)}</div>
    {busy && <p role="status" className="text-sm text-muted-foreground">Requesting and saving source pages. Large days can take several minutes. This does not replace saved performance data.</p>}
    {error && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    <section className="rounded-xl border border-border bg-card p-4"><h2 className="text-sm font-semibold">Capture results</h2><p className="mt-1 text-xs text-muted-foreground">Captured means the source was retrieved. It does not mean the figures have been approved for reporting or billing.</p>
      {!results.length && <p className="mt-4 text-sm text-muted-foreground">Choose a source to inspect its available data.</p>}
      <div className="mt-3 space-y-3">{results.map((r,i)=><div key={String(r.runId ?? i)} className="rounded-lg bg-muted/40 p-3">
        <p className="text-sm font-medium">{String(r.brand)} · {String(r.date)} · {String(r.source).replaceAll('_',' ')}</p>
        <p className="mt-1 text-xs">{String(r.status ?? (r.error?'Failed':'Result'))}{typeof r.rows==='number'?` · ${r.rows.toLocaleString()} rows`:''}{typeof r.pages==='number'?` · ${r.pages} pages`:''}</p>
        <p className="mt-1 text-xs text-muted-foreground">{String(r.message ?? r.error ?? '')}</p>
        {typeof r.runId==='string' && <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">Capture {r.runId}</p>}
      </div>)}</div>
    </section>
  </>;
}
