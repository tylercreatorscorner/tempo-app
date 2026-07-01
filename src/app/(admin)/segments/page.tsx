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
  const [expanded, setExpanded] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, MemberRow[] | 'loading'>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [segRes, brandRes] = await Promise.all([fetch('/api/segments'), fetch('/api/brands')]);
      const segJson = await segRes.json();
      const brandJson = await brandRes.json();
      setCustoms((segJson.segments ?? []) as Segment[]);
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
      const json = await res.json();
      setCounts((prev) => ({ ...prev, [key]: typeof json.total === 'number' ? json.total : 0 }));
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
        const json = await res.json();
        setMembers((prev) => ({ ...prev, [key]: (json.data ?? []) as MemberRow[] }));
      } catch {
        setMembers((prev) => ({ ...prev, [key]: [] }));
      }
    }
  }

  async function del(id: string) {
    if (!window.confirm('Delete this segment?')) return;
    setCustoms((prev) => prev.filter((s) => s.id !== id));
    await fetch(`/api/segments/${id}`, { method: 'DELETE' });
  }

  function renderRow(opts: {
    rowKey: string; name: string; description?: string; criteria: SegmentFilterCriteria; onDelete?: () => void;
  }) {
    const { rowKey, name, description, criteria, onDelete } = opts;
    const count = counts[rowKey];
    const isOpen = expanded === rowKey;
    const mem = members[rowKey];
    return (
      <div key={rowKey} className="border border-gray-200 rounded-xl bg-white overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => toggleMembers(rowKey, criteria)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
            {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
              <p className="text-xs text-gray-400 truncate">{description || describeCriteria(criteria)}</p>
            </div>
          </button>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-pink-50 text-[#FF4D8D] flex-shrink-0">
            <Users className="h-3 w-3" />
            {count === undefined ? '…' : count === null ? '—' : count.toLocaleString()}
          </span>
          {onDelete && (
            <button onClick={onDelete} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 flex-shrink-0" title="Delete segment">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
        {isOpen && (
          <div className="border-t border-gray-100 bg-gray-50/50">
            {mem === 'loading' || mem === undefined ? (
              <p className="px-4 py-3 text-xs text-gray-400">Loading creators…</p>
            ) : mem.length === 0 ? (
              <p className="px-4 py-3 text-xs text-gray-400">No creators match this segment.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {mem.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="font-medium text-gray-800 truncate">@{handleOf(m)}</span>
                    {m.real_name && <span className="text-gray-400 truncate hidden sm:inline">{m.real_name}</span>}
                    <span className="ml-auto text-gray-700 tabular-nums flex-shrink-0">{money(m.gmv_period)}</span>
                    <span className="text-gray-400 tabular-nums w-20 text-right flex-shrink-0">{m.posts_period} posts</span>
                  </div>
                ))}
                {mem.length >= 50 && <p className="px-4 py-2 text-[11px] text-gray-400">Showing first 50.</p>}
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
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Layers className="h-5 w-5 text-[#FF4D8D]" /> Segments
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Saved audiences you can reuse across the roster, messaging, and contests.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-white bg-[#FF4D8D] hover:bg-[#e63e7c] flex-shrink-0"
        >
          <Plus className="h-4 w-4" /> New Segment
        </button>
      </div>

      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Lifecycle</h2>
        <div className="space-y-2">
          {PREBUILT_SEGMENTS.map((p) =>
            renderRow({ rowKey: `pre:${p.key}`, name: p.name, description: p.description, criteria: p.criteria }),
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Your segments</h2>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : customs.length === 0 ? (
          <div className="border border-dashed border-gray-200 rounded-xl px-4 py-8 text-center">
            <p className="text-sm text-gray-500">No saved segments yet.</p>
            <button onClick={() => setShowCreate(true)} className="mt-2 text-sm font-medium text-[#FF4D8D] hover:underline">
              Create your first segment
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {customs.map((c) =>
              renderRow({
                rowKey: `cus:${c.id}`,
                name: c.name,
                description: c.description || undefined,
                criteria: c.filter_criteria,
                onDelete: () => del(c.id),
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
