'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { DATE_PRESETS, type DatePreset } from '@/lib/data/date-utils';
import type { Segment, SegmentFilterCriteria } from '@/lib/data/segments';

interface BrandOption { slug: string; label: string; }

const HEALTH_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Any health' },
  { value: 'healthy', label: 'Healthy' },
  { value: 'behind', label: 'Behind pace' },
  { value: 'silent', label: 'Going silent' },
  { value: 'low_roi', label: 'Low ROI' },
  { value: 'churned', label: 'Churned' },
  { value: 'no_data', label: 'No data' },
];

const VIEW_OPTIONS: { value: 'managed' | 'all' | 'unmanaged'; label: string }[] = [
  { value: 'managed', label: 'Managed creators' },
  { value: 'all', label: 'All (managed + unmanaged)' },
  { value: 'unmanaged', label: 'Unmanaged only' },
];

export function SegmentCreateModal({
  brands,
  onClose,
  onCreated,
}: {
  brands: BrandOption[];
  onClose: () => void;
  onCreated: (segment: Segment) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [brand, setBrand] = useState('all');
  const [view, setView] = useState<'managed' | 'all' | 'unmanaged'>('managed');
  const [health, setHealth] = useState('');
  const [minGmv, setMinGmv] = useState('');
  const [minPosts, setMinPosts] = useState('');
  const [range, setRange] = useState<DatePreset>('last30');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) { setError('Give the segment a name.'); return; }
    setSaving(true);
    setError(null);
    const criteria: SegmentFilterCriteria = {
      brand,
      view,
      health: health || null,
      range,
      min_gmv: minGmv.trim() ? Number(minGmv) : null,
      min_posts: minPosts.trim() ? Number(minPosts) : null,
    };
    try {
      const res = await fetch('/api/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, filter_criteria: criteria }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      onCreated(json.segment as Segment);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save segment');
    } finally {
      setSaving(false);
    }
  }

  const field = 'w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/20';
  const labelCls = 'block text-xs font-medium text-muted-foreground mb-1';

  return (
    <ModalOverlay onClose={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
        <div
          onClick={(e) => e.stopPropagation()}
          data-lenis-prevent
          className="w-full max-w-lg bg-card rounded-2xl shadow-xl border border-border max-h-[85vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card rounded-t-2xl">
            <h2 className="text-base font-semibold text-foreground">New Segment</h2>
            <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4">
            <div>
              <label className={labelCls}>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CC June cohort" className={field} autoFocus />
            </div>
            <div>
              <label className={labelCls}>Description <span className="text-muted-foreground">(optional)</span></label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this segment for?" className={field} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Brand</label>
                <select value={brand} onChange={(e) => setBrand(e.target.value)} className={field}>
                  <option value="all">All my brands</option>
                  {brands.map((b) => <option key={b.slug} value={b.slug}>{b.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Audience</label>
                <select value={view} onChange={(e) => setView(e.target.value as 'managed' | 'all' | 'unmanaged')} className={field}>
                  {VIEW_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Health</label>
                <select value={health} onChange={(e) => setHealth(e.target.value)} className={field}>
                  {HEALTH_OPTIONS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Period</label>
                <select value={range} onChange={(e) => setRange(e.target.value as DatePreset)} className={field}>
                  {DATE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Min GMV <span className="text-muted-foreground">($)</span></label>
                <input value={minGmv} onChange={(e) => setMinGmv(e.target.value)} inputMode="numeric" placeholder="e.g. 10000" className={field} />
              </div>
              <div>
                <label className={labelCls}>Min posts</label>
                <input value={minPosts} onChange={(e) => setMinPosts(e.target.value)} inputMode="numeric" placeholder="e.g. 1" className={field} />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border sticky bottom-0 bg-card rounded-b-2xl">
            <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted">Cancel</button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[var(--primary)] hover:brightness-[1.07] transition-all disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Create Segment'}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
