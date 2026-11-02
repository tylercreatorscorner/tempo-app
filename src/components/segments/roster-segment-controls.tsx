'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { BookmarkPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import { Input } from '@/components/ui/input';
import { PREBUILT_SEGMENTS } from '@/lib/data/prebuilt-segments';
import { describeCriteria, type Segment, type SegmentFilterCriteria } from '@/lib/data/segments';
import styles from './roster-segment-controls.module.css';

/** Applies stored criteria without changing their brand or period scope. */
export function RosterSegmentControls({ currentCriteria, onApply }: {
  currentCriteria: SegmentFilterCriteria;
  onApply: (criteria: SegmentFilterCriteria, name: string) => void;
}) {
  const [customs, setCustoms] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [readOnly, setReadOnly] = useState(true);
  const [saveCriteria, setSaveCriteria] = useState<SegmentFilterCriteria | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  const loadSegments = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setLoadError(false);
    setCustoms([]);
    setReadOnly(true);
    try {
      const response = await fetch('/api/segments', { signal: controller.signal, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.segments)) throw new Error('Could not load saved segments.');
      if (!controller.signal.aborted && mounted.current) {
        setCustoms(data.segments as Segment[]);
        setReadOnly(data.readOnly === true);
      }
    } catch {
      if (!controller.signal.aborted && mounted.current) {
        setLoadError(true);
        setReadOnly(true);
      }
    } finally {
      if (!controller.signal.aborted && mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void loadSegments();
    window.addEventListener('workspace-context-changed', loadSegments);
    return () => {
      mounted.current = false;
      controllerRef.current?.abort();
      window.removeEventListener('workspace-context-changed', loadSegments);
    };
  }, [loadSegments]);

  const options = [
    ...PREBUILT_SEGMENTS.map(segment => ({ value: `prebuilt:${segment.key}`, label: segment.name, description: segment.description, group: 'Lifecycle' })),
    ...customs.map(segment => ({ value: `custom:${segment.id}`, label: segment.name, description: segment.description || describeCriteria(segment.filter_criteria), group: 'Saved segments' })),
  ];
  function pick(value: string) {
    const prebuilt = PREBUILT_SEGMENTS.find(segment => value === `prebuilt:${segment.key}`);
    if (prebuilt) { onApply(prebuilt.criteria, prebuilt.name); return; }
    const custom = customs.find(segment => value === `custom:${segment.id}`);
    if (custom) onApply(custom.filter_criteria, custom.name);
  }

  return <Dialog.Root open={saveCriteria !== null} onOpenChange={open => { if (!open) setSaveCriteria(null); }}>
    <div className={styles.controls}>
      <div className={styles.picker}><ChoiceMenu compact label="Creator segments" value="" placeholder="Choose a segment" options={options} onChange={pick} /></div>
      <Dialog.Trigger asChild>
        <Button variant="outline" size="sm" className={styles.saveTrigger} disabled={loading || readOnly} onClick={() => setSaveCriteria({ ...currentCriteria })} title={readOnly && !loading ? 'Saving segments is unavailable in this workspace view' : 'Save the current filters as a segment'}><BookmarkPlus size={14} aria-hidden="true" />Save</Button>
      </Dialog.Trigger>
    </div>
    {loading && <p className={styles.status} role="status">Loading saved segments…</p>}
    {loadError && <div className={styles.loadError} role="alert"><span>Saved segments could not load. Lifecycle segments are available.</span><button type="button" onClick={() => void loadSegments()}>Retry</button></div>}
    {saveCriteria !== null && <SaveSegmentDialog criteria={saveCriteria} canSave={!readOnly && !loading} onSaved={() => { setSaveCriteria(null); void loadSegments(); }} />}
  </Dialog.Root>;
}

function SaveSegmentDialog({ criteria, canSave, onSaved }: {
  criteria: SegmentFilterCriteria;
  canSave: boolean;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const mounted = useRef(true);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function save() {
    if (savingRef.current || !canSave) return;
    if (!name.trim()) { setError('Give the segment a name.'); nameRef.current?.focus(); return; }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, filter_criteria: criteria }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save this segment.');
      if (mounted.current) onSaved();
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Could not save this segment.');
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return <Dialog.Portal>
    <Dialog.Overlay className={styles.overlay} />
    <Dialog.Content className={styles.dialog} data-lenis-prevent onOpenAutoFocus={event => { event.preventDefault(); nameRef.current?.focus(); }} onEscapeKeyDown={event => { if (saving) event.preventDefault(); }} onPointerDownOutside={event => { if (saving) event.preventDefault(); }}>
      <header className={styles.header}><Dialog.Title>Save creator segment</Dialog.Title><Dialog.Close asChild><button type="button" className={styles.close} disabled={saving} aria-label="Close save segment"><X size={16} aria-hidden="true" /></button></Dialog.Close></header>
      <Dialog.Description className={styles.description}>Keep these filters together so you can return to the same creator view.</Dialog.Description>
      <fieldset className={styles.fields} disabled={saving}>
        <label className={styles.field}>Name<Input ref={nameRef} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. October coaching cohort" autoComplete="off" /></label>
        <label className={styles.field}>Description <span className={styles.optional}>Optional</span><Input value={description} onChange={event => setDescription(event.target.value)} /></label>
        <div className={styles.criteria}><span>Saved filters</span><p>{describeCriteria(criteria)}</p></div>
      </fieldset>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!canSave && <p className={styles.error} role="alert">Saving segments is unavailable in this workspace view.</p>}
      {saving && <p className={styles.status} role="status">Saving creator segment…</p>}
      <footer className={styles.footer}><Dialog.Close asChild><Button variant="ghost" size="sm" disabled={saving}>Cancel</Button></Dialog.Close><Button size="sm" className={styles.primary} disabled={saving || !canSave || !name.trim()} onClick={() => void save()}>{saving ? 'Saving…' : 'Save segment'}</Button></footer>
    </Dialog.Content>
  </Dialog.Portal>;
}
