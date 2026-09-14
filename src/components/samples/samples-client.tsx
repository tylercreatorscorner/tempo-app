'use client';
import { useState } from 'react';
import { SAMPLE_STATUSES, type SamplePage, type SampleFulfillment } from '@/lib/tiktok/samples';

const label = (s: string) => s.toLowerCase().replaceAll('_', ' ');
const date = (n: number | null) => n === null ? '—' : new Date(n * 1000).toLocaleString();
const count = (n: number | null) => n === null ? '—' : n.toLocaleString();
export function SamplesClient({ brands }: { brands: { slug: string; name: string }[] }) {
  const [brand, setBrand] = useState(brands[0]?.slug ?? '');
  const [status, setStatus] = useState('');
  const [username, setUsername] = useState('');
  const [page, setPage] = useState<SamplePage | null>(null);
  const [tokens, setTokens] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<{ applicationId: string; format: string; rows: SampleFulfillment[] } | null>(null);
  const reset = () => { setPage(null); setTokens([]); setContent(null); setError(null); };
  async function load(token = '') {
    setBusy(true); setError(null); setContent(null);
    try {
      const res = await fetch('/api/tiktok/samples?' + new URLSearchParams({ brand, status, username, pageToken: token }), { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Unable to load requests');
      if (payload.nextPageToken && (token ? [...tokens, token] : []).includes(payload.nextPageToken)) throw new Error('TikTok repeated a page. Refresh the request list.');
      setPage(payload); setTokens(token ? [...tokens, token] : []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load requests'); }
    finally { setBusy(false); }
  }
  async function details(applicationId: string, format: 'VIDEO' | 'LIVE') {
    setBusy(true); setError(null); setContent(null);
    try {
      const res = await fetch('/api/tiktok/samples?' + new URLSearchParams({ brand, applicationId, format }), { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Unable to load content');
      setContent({ applicationId, format, rows: payload.fulfillments });
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load content'); }
    finally { setBusy(false); }
  }
  const input = 'rounded-lg border border-border bg-background p-2 text-sm';
  return <div className="space-y-4">
    <form className="flex flex-wrap gap-3 items-end" onSubmit={e => { e.preventDefault(); void load(); }}>
      <label className="grid gap-1 text-sm">Brand<select className={input} value={brand} disabled={busy}
        onChange={e => { setBrand(e.target.value); reset(); }}>{brands.map(b => <option key={b.slug} value={b.slug}>{b.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Status<select className={input} value={status} disabled={busy}
        onChange={e => { setStatus(e.target.value); reset(); }}><option value="">All statuses</option>
        {SAMPLE_STATUSES.map(s => <option key={s} value={s}>{label(s)}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Creator<input className={input} value={username} maxLength={100} disabled={busy}
        onChange={e => { setUsername(e.target.value); reset(); }} placeholder="TikTok username" /></label>
      <button className={input} disabled={busy || !brand}>{busy ? 'Loading…' : 'Load requests'}</button>
    </form>
    <p className="text-sm text-muted-foreground">Viewing requests only. Review and approve samples in TikTok Affiliate Center.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}{page ? ' Previously loaded results remain below.' : ''}</p>}
    {page && <div className="space-y-3">
      <p className="text-sm">{page.totalCount === null ? '' : count(page.totalCount) + ' matching requests · '}{page.applications.length} shown on this page</p>
      {page.applications.length === 0 ? <p>No requests on this page.</p> :
      <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-sm">
        <thead><tr>{['Creator / product','Status','Commission','Deadlines','Shipping','Delivered content'].map(h => <th key={h} className="p-3 text-left">{h}</th>)}</tr></thead>
        <tbody>{page.applications.map(a => <tr key={a.id} className="border-t border-border">
          <td className="p-3 min-w-52"><p>{a.creator ?? 'Creator unavailable'}</p><p className="text-xs text-muted-foreground">{a.product ?? a.productId ?? 'Product unavailable'}</p><p className="text-xs">{a.sku}</p></td>
          <td className="p-3">{a.status ? label(a.status) : 'Unknown'}{a.fulfillmentStatus && <p className="text-xs">{label(a.fulfillmentStatus)}</p>}</td>
          <td className="p-3">{a.commissionRate === null ? '—' : (a.commissionRate * 100).toLocaleString(undefined,{maximumFractionDigits:2}) + '%'}</td>
          <td className="p-3 text-xs"><p>Review: {date(a.approvalDeadline)}</p><p>Ship: {date(a.shipmentDeadline)}</p></td>
          <td className="p-3 text-xs"><p>Order: {a.orderId ?? '—'}</p><p>Tracking: {a.trackingNumber ?? '—'}</p></td>
          <td className="p-3"><div className="flex gap-2">{(['VIDEO','LIVE'] as const).map(f => <button key={f} className={input} disabled={busy} onClick={() => void details(a.id,f)}>{label(f)}</button>)}</div></td>
        </tr>)}</tbody>
      </table></div>}
      <div className="flex gap-3"><button className={input} disabled={busy} onClick={() => void load()}>Refresh from first page</button>
        {page.nextPageToken && <button className={input} disabled={busy} onClick={() => void load(page.nextPageToken!)}>Next page</button>}</div>
    </div>}
    {content && <section className="border border-border rounded-lg p-4 space-y-2" aria-label="Sample fulfillment content">
      <h2 className="font-semibold">{label(content.format)} content · request {content.applicationId}</h2>
      <p className="text-xs text-muted-foreground">Cumulative engagement. Product-link time may differ from the original posting time. Zero sales do not exclude content.</p>
      {content.rows.length === 0 ? <p className="text-sm">TikTok returned no matching fulfillment content.</p> :
        content.rows.map((c,i) => <div key={c.id + ':' + i} className="border-t border-border pt-2 text-sm">
          <p>{c.description ?? c.id}</p><p className="text-xs">ID: {c.id} · Product linked: {date(c.productLinkedAt)}</p>
          <p>Views {count(c.views)} · Likes {count(c.likes)} · Comments {count(c.comments)} · Paid orders {count(c.paidOrders)}</p>
        </div>)}
    </section>}
  </div>;
}
