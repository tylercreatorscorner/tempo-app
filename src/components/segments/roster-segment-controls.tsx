'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Layers, ChevronDown, BookmarkPlus, X } from 'lucide-react';
import { ModalOverlay } from '@/components/ui/modal-overlay';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
        <Button variant="outline" size="md" onClick={() => setOpen((o) => !o)}>
          <Layers /> Segments <ChevronDown className="opacity-60" />
        </Button>
        {open && (
          <Card className="absolute right-0 top-full mt-1 w-72 z-50">
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
          </Card>
        )}
      </div>

      <Button
        variant="outline"
        size="md"
        onClick={() => setShowSave(true)}
        title="Save the current filters as a segment"
      >
        <BookmarkPlus /> Save
      </Button>

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

  return (
    <ModalOverlay onClose={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
        <Card onClick={(e) => e.stopPropagation()} data-lenis-prevent className="w-full max-w-md">
          <CardHeader className="border-b border-border">
            <CardTitle>Save current filters as a segment</CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
          </CardHeader>
          <div className="px-5 py-4 space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CC June cohort" autoFocus />
            </div>
            <div>
              <Label>Description <span className="text-muted-foreground/70">(optional)</span></Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">{describeCriteria(criteria)}</p>
            {error && <p className="text-sm text-[var(--pulse-neg)]">{error}</p>}
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
            <Button variant="ghost" size="md" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="md" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save segment'}
            </Button>
          </div>
        </Card>
      </div>
    </ModalOverlay>
  );
}
