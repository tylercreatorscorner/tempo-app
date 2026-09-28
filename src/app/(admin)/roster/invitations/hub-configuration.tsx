'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Loader2, Plus } from 'lucide-react';
import { ChoiceMenu } from '@/components/ui/choice-menu';

export type HubConfiguredItem = {
  id: string; kind: 'video' | 'reading' | 'link' | 'acknowledgement'; title: string;
  body: string; url: string | null; required: boolean; active: boolean; sortOrder: number; version: number;
};

const empty = (): Omit<HubConfiguredItem, 'id' | 'version'> => ({
  kind: 'reading', title: '', body: '', url: null, required: true, active: true, sortOrder: 0,
});

export function HubConfiguration({ brandId, brandSlug, items, canConfigure }: {
  brandId: string; brandSlug: string; items: HubConfiguredItem[]; canConfigure: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<HubConfiguredItem | Omit<HubConfiguredItem, 'id' | 'version'>>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const editing = 'id' in draft;
  function select(item: HubConfiguredItem) { setSelectedId(item.id); setDraft(item); setError(''); }
  function newItem(kind: HubConfiguredItem['kind'] = 'reading') { setSelectedId('new'); setDraft({ ...empty(), kind, sortOrder: items.length * 10 }); setError(''); }
  function change<K extends keyof HubConfiguredItem>(key: K, value: HubConfiguredItem[K]) {
    setDraft(current => ({ ...current, [key]: value }));
  }
  async function save() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/creator-hub/items', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId, itemId: editing ? draft.id : null, expectedVersion: editing ? draft.version : null,
          kind: draft.kind, title: draft.title, body: draft.body, url: draft.url,
          required: draft.required, active: draft.active, sortOrder: draft.sortOrder,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not publish Hub item.');
      setSelectedId(null); setDraft(empty()); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not publish Hub item.'); }
    finally { setBusy(false); }
  }
  return <section className="rounded-xl border border-border bg-card p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-sm font-semibold">Creator Hub</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Build this brand’s Hub at your own pace. Add one or several videos, resources, and required steps. New approvals receive a snapshot; completed acknowledgments keep the accepted version and time.</p></div>
      <div className="flex flex-wrap gap-2">
        <a href={`/creator-hub-preview?brand=${encodeURIComponent(brandSlug)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted/40">Preview creator view <ExternalLink size={13} /></a>
        {canConfigure && <button type="button" onClick={() => newItem('video')} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted/40"><Plus size={14} /> Add video</button>}
        {canConfigure && <button type="button" onClick={() => newItem()} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted/40"><Plus size={14} /> Add other step</button>}
      </div>
    </div>
    {items.length ? <div className="mt-4 divide-y divide-border rounded-lg border border-border">{items.map(item => <button type="button" key={item.id} onClick={() => select(item)} className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/30"><span className="min-w-0"><span className="block truncate text-sm font-medium">{item.title}</span><span className="text-xs text-muted-foreground">{item.kind} · version {item.version}</span></span><span className="flex gap-1.5 text-[11px]"><span className={`rounded-full px-2 py-1 ${item.required ? 'bg-violet-100 text-violet-800' : 'bg-muted text-muted-foreground'}`}>{item.required ? 'Required' : 'Optional'}</span>{!item.active && <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">Inactive</span>}</span></button>)}</div>
      : <p className="mt-4 rounded-lg bg-muted/25 px-3 py-4 text-xs text-muted-foreground">No Hub steps yet. Add payment and deliverable expectations before inviting a creator to onboard.</p>}
    {selectedId && <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
      <div className="sm:col-span-2 flex items-center justify-between"><h4 className="text-sm font-semibold">{editing ? 'Publish a new version' : 'New Hub step'}</h4><button type="button" onClick={() => setSelectedId(null)} className="text-xs text-muted-foreground">Close</button></div>
      <div><label className="text-xs font-medium">Type</label><ChoiceMenu compact label="Hub step type" value={draft.kind} options={[
        { value: 'reading', label: 'Reading' }, { value: 'video', label: 'Video' },
        { value: 'link', label: 'Link' }, { value: 'acknowledgement', label: 'Acknowledgment' },
      ]} onChange={value => change('kind', value as HubConfiguredItem['kind'])} disabled={editing || !canConfigure} /></div>
      <label className="text-xs font-medium">Title<input value={draft.title} onChange={event => change('title', event.target.value)} maxLength={200} disabled={!canConfigure} className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Payment and deliverable expectations" /></label>
      <label className="sm:col-span-2 text-xs font-medium">{draft.kind === 'acknowledgement' ? 'Terms to accept' : 'Instructions or description'}<textarea value={draft.body} onChange={event => change('body', event.target.value)} rows={3} disabled={!canConfigure} className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>
      {(draft.kind === 'video' || draft.kind === 'link') && <label className="sm:col-span-2 text-xs font-medium">Secure resource URL<input type="url" value={draft.url ?? ''} onChange={event => change('url', event.target.value || null)} disabled={!canConfigure} placeholder="https://" className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>}
      <label className="text-xs font-medium">Display order<input type="number" min={0} max={1000} step={1} value={draft.sortOrder} onChange={event => change('sortOrder', Number(event.target.value))} disabled={!canConfigure} className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /><span className="mt-1 block font-normal text-muted-foreground">Lower numbers appear first. The first video is featured on the Hub home.</span></label>
      <div className="flex flex-wrap gap-4 text-xs"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.required} onChange={event => change('required', event.target.checked)} disabled={!canConfigure} />Required</label><label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.active} onChange={event => change('active', event.target.checked)} disabled={!canConfigure} />Active for new enrollments</label></div>
      {canConfigure && <div className="flex justify-end"><button type="button" disabled={busy} onClick={save} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">{busy && <Loader2 size={13} className="animate-spin" />}Publish version</button></div>}
      {error && <p role="alert" className="sm:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>}
    </div>}
  </section>;
}
