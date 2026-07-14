'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Layers, ChevronDown, BookmarkPlus, X } from 'lucide-react';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { PREBUILT_SEGMENTS } from '@/lib/data/prebuilt-segments';
import { describeCriteria, type Segment, type SegmentFilterCriteria } from '@/lib/data/segments';

/**
 * Roster filter-bar controls for Segments: a picker dropdown (prebuilt +
 * saved) that applies a segment's filters to the roster, and a "Save" button
 * that snapshots the current filters into a new segment.
 */
export function RosterSegmentControls({
  currentCriteria,
  onApply,
}: {
  currentCriteria: SegmentFilterCriteria;
  onApply: (criteria: SegmentFilterCriteria, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customs, setCustoms] = useState<Segment[]>([]);
  const [showSave, setShowSave] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadSegments = useCallback(async () => {
    try {
      const res = await fetch('/api/segments');
      const json = await res.json();
      setCustoms((json.segments ?? []) as Segment[]);
    } catch { /* non-fatal — prebuilts still work */ }
  }, []);
  useEffect(() => { loadSegments(); }, [loadSegments]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function pick(criteria: SegmentFilterCriteria, name: string) {
    setOpen(false);
    onApply(criteria, name);
  }

  return (
    <div className="flex items-center gap-2 self-start" ref={ref}>
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-2.5 rounded-xl border border-border hover:bg-muted text-muted-foreground transition-colors"
        >
          <Layers className="h-4 w-4" /> Segments <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 w-72 bg-card border border-border rounded-xl shadow-lg z-50">
            <div data-lenis-prevent className="max-h-[60vh] overflow-y-auto overscroll-contain py-1">
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Lifecycle</p>
              {PREBUILT_SEGMENTS.map((p) => (
                <button key={p.key} onClick={() => pick(p.criteria, p.name)} className="w-full text-left px-3 py-2 hover:bg-muted">
                  <p className="text-sm font-medium text-foreground">{p.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.description}</p>
                </button>
              ))}
              {customs.length > 0 && (
                <>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-t border-border mt-1">Your segments</p>
                  {customs.map((c) => (
                    <button key={c.id} onClick={() => pick(c.filter_criteria, c.name)} className="w-full text-left px-3 py-2 hover:bg-muted">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.description || describeCriteria(c.filter_criteria)}</p>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={() => setShowSave(true)}
        className="flex items-center gap-1.5 text-sm font-medium px-3 py-2.5 rounded-xl border border-border hover:bg-muted text-muted-foreground transition-colors"
        title="Save the current filters as a segment"
      >
        <BookmarkPlus className="h-4 w-4" /> Save
      </button>

      {showSave && (
        <SaveModal
          criteria={currentCriteria}
          onClose={() => setShowSave(false)}
          onSaved={() => { setShowSave(false); loadSegments(); }}
        />
      )}
    </div>
  );
}

function SaveModal({
  criteria, onClose, onSaved,
}: {
  criteria: SegmentFilterCriteria;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) { setError('Give the segment a name.'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, filter_criteria: criteria }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed (${res.status})`);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save segment');
      setSaving(false);
    }
  }

  const field = 'w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/20';

  return (
    <ModalOverlay onClose={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
        <div onClick={(e) => e.stopPropagation()} data-lenis-prevent className="w-full max-w-md bg-card rounded-2xl shadow-xl border border-border">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-base font-semibold text-foreground">Save current filters as a segment</h2>
            <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CC June cohort" className={field} autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Description <span className="text-muted-foreground">(optional)</span></label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className={field} />
            </div>
            <p className="text-xs text-muted-foreground">{describeCriteria(criteria)}</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
            <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted">Cancel</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#E91E8C] hover:bg-[#d1177d] disabled:opacity-50">
              {saving ? 'Saving…' : 'Save segment'}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
