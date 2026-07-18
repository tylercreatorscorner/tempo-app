'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Users, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { PREBUILT_SEGMENTS } from '@/lib/data/prebuilt-segments';
import {
  criteriaToRosterParams,
  describeCriteria,
  type Segment,
  type SegmentFilterCriteria,
} from '@/lib/data/segments';
import { SegmentCreateModal } from '@/components/segments/segment-create-modal';

interface BrandOption { slug: string; label: string; }
interface MemberRow {
  id: string;
  real_name: string | null;
  handles?: string[];
  account_1?: string | null;
  gmv_period: number;
  posts_period: number;
}

const money = (n: number) => '$' + Math.round(n).toLocaleString();
const handleOf = (m: MemberRow) => (m.handles && m.handles[0]) || m.account_1 || '—';

export default function SegmentsPage() {
  const [customs, setCustoms] = useState<Segment[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, MemberRow[] | 'loading' | 'error'>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [segRes, brandRes] = await Promise.all([fetch('/api/segments'), fetch('/api/brands')]);
      const segJson = await segRes.json();
      const brandJson = await brandRes.json();
      setCustoms((segJson.segments ?? []) as Segment[]);
      setReadOnly(!!segJson.readOnly);
      const bopts = ((brandJson.brands ?? []) as Array<{
        slug: string; name: string; display_name: string | null; is_archived: boolean; parent_brand_id: string | null;
      }>)
        .filter((b) => !b.is_archived && !b.parent_brand_id)
        .map((b) => ({ slug: b.slug, label: b.display_name || b.name }));
      setBrands(bopts);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const fetchCount = useCallback(async (key: string, criteria: SegmentFilterCriteria) => {
    const qs = criteriaToRosterParams(criteria);
    qs.set('limit', '1');
    try {
      const res = await fetch(`/api/roster?${qs.toString()}`);
      // A 500/401 still parses as JSON ({error}), so without res.ok the count
      // silently falls to 0 — a segment that failed to load reads as "0
      // members." Guard, and render "—" (null), never a fake 0.
      if (!res.ok) throw new Error(`Count failed (${res.status})`);
      const json = await res.json();
      setCounts((prev) => ({ ...prev, [key]: typeof json.total === 'number' ? json.total : null }));
    } catch {
      setCounts((prev) => ({ ...prev, [key]: null }));
    }
  }, []);

  useEffect(() => {
    for (const p of PREBUILT_SEGMENTS) fetchCount(`pre:${p.key}`, p.criteria);
  }, [fetchCount]);
  useEffect(() => {
    for (const c of customs) fetchCount(`cus:${c.id}`, c.filter_criteria);
  }, [customs, fetchCount]);

  async function toggleMembers(key: string, criteria: SegmentFilterCriteria) {
    if (expanded === key) { setExpanded(null); return; }
    setExpanded(key);
    if (!members[key]) {
      setMembers((prev) => ({ ...prev, [key]: 'loading' }));
      const qs = criteriaToRosterParams(criteria);
      qs.set('limit', '50');
      try {
        const res = await fetch(`/api/roster?${qs.toString()}`);
        if (!res.ok) throw new Error(`Members failed (${res.status})`);
        const json = await res.json();
        setMembers((prev) => ({ ...prev, [key]: (json.data ?? []) as MemberRow[] }));
      } catch {
        // Don't render a load failure as "No creators match" — flag it.
        setMembers((prev) => ({ ...prev, [key]: 'error' }));
      }
    }
  }

  async function del(id: string) {
    setConfirming(null);
    const prev = customs;
    setCustoms((c) => c.filter((s) => s.id !== id));
    try {
      const res = await fetch(`/api/segments/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Delete failed (${res.status})`);
      }
    } catch (e) {
      setCustoms(prev); // revert — the delete didn't stick
      window.alert(e instanceof Error ? e.message : 'Failed to delete segment');
    }
  }

  function renderRow(opts: {
    rowKey: string; name: string; description?: string; criteria: SegmentFilterCriteria; deletableId?: string;
  }) {
    const { rowKey, name, description, criteria, deletableId } = opts;
    const count = counts[rowKey];
    const isOpen = expanded === rowKey;
    const mem = members[rowKey];
    return (
      <div key={rowKey} className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => toggleMembers(rowKey, criteria)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
            {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{name}</p>
              <p className="text-xs text-muted-foreground truncate">{description || describeCriteria(criteria)}</p>
            </div>
          </button>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-[var(--primary)] flex-shrink-0">
            <Users className="h-3 w-3" />
            {count === undefined ? '…' : count === null ? '—' : count.toLocaleString()}
          </span>
          {deletableId && (
            confirming === deletableId ? (
              <span className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => del(deletableId)} className="px-2 py-1 rounded-lg text-xs font-medium text-white bg-red-500 hover:bg-red-600">Delete</button>
                <button onClick={() => setConfirming(null)} className="px-2 py-1 rounded-lg text-xs text-muted-foreground hover:bg-muted">Cancel</button>
              </span>
            ) : (
              <button onClick={() => setConfirming(deletableId)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 flex-shrink-0" title="Delete segment">
                <Trash2 className="h-4 w-4" />
              </button>
            )
          )}
        </div>
        {isOpen && (
          <div className="border-t border-border bg-muted/50">
            {mem === 'loading' || mem === undefined ? (
              <p className="px-4 py-3 text-xs text-muted-foreground">Loading creators…</p>
            ) : mem === 'error' ? (
              <p className="px-4 py-3 text-xs text-[var(--pulse-warn)]">Couldn’t load creators for this segment. Try reopening it.</p>
            ) : mem.length === 0 ? (
              <p className="px-4 py-3 text-xs text-muted-foreground">No creators match this segment.</p>
            ) : (
              <div className="divide-y divide-border">
                {mem.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="font-medium text-foreground truncate">@{handleOf(m)}</span>
                    {m.real_name && <span className="text-muted-foreground truncate hidden sm:inline">{m.real_name}</span>}
                    <span className="ml-auto text-foreground tabular-nums flex-shrink-0">{money(m.gmv_period)}</span>
                    <span className="text-muted-foreground tabular-nums w-20 text-right flex-shrink-0">{m.posts_period} posts</span>
                  </div>
                ))}
                {mem.length >= 50 && <p className="px-4 py-2 text-[11px] text-muted-foreground">Showing first 50.</p>}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Layers className="h-5 w-5 text-[var(--primary)]" /> Segments
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Saved audiences you can reuse across the roster, messaging, and contests.</p>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-white bg-[var(--primary)] hover:brightness-[1.07] transition-all flex-shrink-0"
          >
            <Plus className="h-4 w-4" /> New Segment
          </button>
        )}
      </div>

      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Lifecycle</h2>
        <div className="space-y-2">
          {PREBUILT_SEGMENTS.map((p) =>
            renderRow({ rowKey: `pre:${p.key}`, name: p.name, description: p.description, criteria: p.criteria }),
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Your segments</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : customs.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">No saved segments yet.</p>
            {!readOnly && (
              <button onClick={() => setShowCreate(true)} className="mt-2 text-sm font-medium text-[var(--primary)] hover:underline">
                Create your first segment
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {customs.map((c) =>
              renderRow({
                rowKey: `cus:${c.id}`,
                name: c.name,
                description: c.description || undefined,
                criteria: c.filter_criteria,
                deletableId: readOnly ? undefined : c.id,
              }),
            )}
          </div>
        )}
      </section>

      {showCreate && (
        <SegmentCreateModal
          brands={brands}
          onClose={() => setShowCreate(false)}
          onCreated={(seg) => {
            setCustoms((prev) => [seg, ...prev]);
            fetchCount(`cus:${seg.id}`, seg.filter_criteria);
          }}
        />
      )}
    </div>
  );
}
