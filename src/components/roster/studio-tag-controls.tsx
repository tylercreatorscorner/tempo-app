'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dialog, Popover } from 'radix-ui';
import { ChevronDown, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { normalizeCreatorTag } from '@/lib/roster/creator-tags';
import styles from './studio-tag-controls.module.css';

type TagMode = 'any' | 'all';
type TagContextValue = {
  brand: string;
  tags: string[];
  canWrite: boolean;
  loading: boolean;
  error: string | null;
  reload: () => void;
};
type TagResult = { key: string; tags: string[]; canWrite: boolean; error: string | null };
const TagContext = createContext<TagContextValue | null>(null);
const EMPTY_TAGS: string[] = [];

function useRosterTags() {
  const value = useContext(TagContext);
  if (!value) throw new Error('Roster tag controls require RosterTagsProvider');
  return value;
}

/** One permission-aware definition read for this roster, never a cross-user cache. */
export function RosterTagsProvider({ brand, children }: { brand: string; children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<TagResult | null>(null);
  const key = `${brand}:${version}`;
  const hasBrand = Boolean(brand && brand !== 'all');
  const reload = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    window.addEventListener('workspace-context-changed', reload);
    return () => window.removeEventListener('workspace-context-changed', reload);
  }, [reload]);
  useEffect(() => {
    if (!hasBrand) return;
    const controller = new AbortController();
    fetch(`/api/roster/tags?brand=${encodeURIComponent(brand)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.tags)) throw new Error('Could not load creator tags.');
        const tags = [...new Set<string>(data.tags.map(normalizeCreatorTag).filter((tag: string | null): tag is string => Boolean(tag)))].sort();
        if (!controller.signal.aborted) setResult({ key, tags, canWrite: data.canWrite === true, error: null });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, tags: [], canWrite: false, error: 'Could not load creator tags.' });
      });
    return () => controller.abort();
  }, [brand, hasBrand, key]);
  const current = result?.key === key ? result : null;
  const value = useMemo<TagContextValue>(() => ({
    brand,
    tags: hasBrand ? current?.tags ?? EMPTY_TAGS : EMPTY_TAGS,
    canWrite: hasBrand && current?.canWrite === true,
    loading: hasBrand && !current,
    error: hasBrand ? current?.error ?? null : null,
    reload,
  }), [brand, hasBrand, current, reload]);
  return <TagContext.Provider value={value}>{children}</TagContext.Provider>;
}

export function RosterTagFilter({ selected, mode, onChange }: {
  selected: string[];
  mode: TagMode;
  onChange: (tags: string[], mode: TagMode) => void;
}) {
  const { brand, tags, loading, error, reload } = useRosterTags();
  const [search, setSearch] = useState('');
  const disabled = !brand || brand === 'all';
  const choices = [...new Set([...selected, ...tags])].filter(tag => tag.toLowerCase().includes(search.trim().toLowerCase()));
  return <Popover.Root>
    <Popover.Trigger asChild>
      <button type="button" className={styles.filterTrigger} disabled={disabled} aria-label="Filter by creator tags" title={disabled ? 'Choose a brand to filter its tags' : undefined}>
        <span>Tags{selected.length ? ` (${selected.length})` : ''}</span><ChevronDown size={14} aria-hidden="true" />
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content aria-label="Creator tags" align="start" sideOffset={6} collisionPadding={12} className={styles.filterPopover} data-lenis-prevent>
        <div className={styles.popoverHeading}><strong>Creator tags</strong>{selected.length > 0 && <button type="button" onClick={() => onChange([], mode)}>Clear</button>}</div>
        {tags.length > 6 && <SearchInput className={styles.search} aria-label="Find a creator tag" placeholder="Find a tag" value={search} onChange={event => setSearch(event.target.value)} onClear={() => setSearch('')} />}
        {loading ? <p className={styles.hint} role="status">Loading tags…</p> : error ? <div className={styles.error} role="alert"><span>{error}</span><Button size="sm" variant="ghost" onClick={reload}>Retry</Button></div> : <>
          <div className={styles.tagChoices}>
            {choices.map(tag => <label key={tag} className={styles.checkOption}>
              <input type="checkbox" checked={selected.includes(tag)} onChange={() => onChange(selected.includes(tag) ? selected.filter(value => value !== tag) : [...selected, tag], mode)} />
              <span>{tag}</span>
            </label>)}
          </div>
          {!choices.length && <p className={styles.hint}>{search ? 'No matching tags.' : 'No tags assigned to this brand yet.'}</p>}
        </>}
        {selected.length > 1 && <div className={styles.matchMode}><ChoiceMenu compact label="Match creator tags" value={mode} options={[{ value: 'any', label: 'Match any tag' }, { value: 'all', label: 'Match all tags' }]} onChange={value => onChange(selected, value as TagMode)} /></div>}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}

export function RosterRowTags({ id, brand, tags, isManaged = true, onEditRequest }: {
  id: string;
  brand: string | null;
  tags: string[];
  isManaged?: boolean;
  onEditRequest?: (id: string) => void;
}) {
  const context = useRosterTags();
  const values = [...new Set(tags.map(normalizeCreatorTag).filter((tag): tag is string => Boolean(tag)))];
  const canEdit = context.canWrite && context.brand === brand && isManaged && /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0 && Boolean(onEditRequest);
  const content = values.length ? <>{values.slice(0, 2).map(tag => <span className={styles.tag} key={tag}>{tag}</span>)}{values.length > 2 && <span className={styles.moreTags}>+{values.length - 2}</span>}</> : canEdit ? <span className={styles.addTag}><Plus size={13} aria-hidden="true" />Add tags</span> : <span className={styles.noTags}>No tags</span>;
  return canEdit ? <button type="button" className={styles.rowTags} aria-label={`Edit creator tags${values.length ? `: ${values.join(', ')}` : ''}`} title={values.join(', ') || 'Add a creator tag'} onClick={event => { event.stopPropagation(); onEditRequest?.(id); }} onKeyDown={event => event.stopPropagation()}>{content}</button>
    : <span className={styles.rowTagsReadOnly} title={context.brand === 'all' ? 'Choose a brand to edit creator tags' : values.join(', ')}>{content}</span>;
}

export function RosterTagEditor({ ids, open, onOpenChange, onSaved, onChanged }: {
  ids: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onChanged?: () => void;
}) {
  const { brand } = useRosterTags();
  return open ? <TagEditorSession key={`${brand}:${ids.join(',')}`} ids={ids} onOpenChange={onOpenChange} onSaved={onSaved} onChanged={onChanged} /> : null;
}

function TagEditorSession({ ids, onOpenChange, onSaved, onChanged }: { ids: string[]; onOpenChange: (open: boolean) => void; onSaved: () => void; onChanged?: () => void }) {
  const { brand, tags, canWrite, loading, error: definitionError, reload } = useRosterTags();
  const [tag, setTag] = useState('');
  const [action, setAction] = useState<'add' | 'remove'>('add');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const opener = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : document.activeElement as HTMLElement);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const normalized = normalizeCreatorTag(tag);
  const validIds = ids.length > 0 && ids.length <= 100 && ids.every(id => /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0);
  const numericIds = validIds ? [...new Set(ids.map(Number))] : [];
  const matchingTags = tags.filter(value => value.includes(tag.trim().toLowerCase()));
  async function save() {
    if (busyRef.current || !canWrite || !normalized || !numericIds.length) return;
    busyRef.current = true;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/roster/tags', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, ids: numericIds, tag: normalized, action }),
      });
      const result = await response.json();
      if (!mounted.current) return;
      const confirmed = Array.isArray(result.updated) ? result.updated.length : 0;
      if (confirmed) { reload(); onChanged?.(); }
      if (!response.ok) throw new Error(confirmed
        ? `${confirmed} of ${numericIds.length} creators saved. The remaining changes could not be confirmed. Choose Save tag to retry safely.`
        : result.error || 'Could not update creator tags.');
      onSaved();
      onOpenChange(false);
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Could not update creator tags.');
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return <Dialog.Root open onOpenChange={next => { if (!busy) onOpenChange(next); }}>
    <Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} />
      <Dialog.Content className={styles.editor} data-lenis-prevent onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }} onCloseAutoFocus={event => { event.preventDefault(); if (opener.current?.isConnected) opener.current.focus(); }}>
        <header className={styles.editorHeader}><Dialog.Title>Edit creator tags</Dialog.Title><Dialog.Close asChild><button type="button" className={styles.close} disabled={busy} aria-label="Close tag editor"><X size={16} aria-hidden="true" /></button></Dialog.Close></header>
        <Dialog.Description className={styles.description}>Apply a brand-specific tag to {numericIds.length || ids.length} {ids.length === 1 ? 'creator' : 'creators'}. Changes are saved only when you choose Save tag.</Dialog.Description>
        {loading ? <p className={styles.hint} role="status">Checking tag access…</p> : definitionError ? <div className={styles.error} role="alert"><span>{definitionError}</span><Button size="sm" variant="ghost" onClick={reload}>Retry</Button></div> : !canWrite ? <p className={styles.hint}>Choose a brand where you have permission to edit creator tags.</p> : !validIds ? <p className={styles.error} role="alert">Select up to 100 managed creators from this brand.</p> : <fieldset className={styles.fields} disabled={busy}>
          <div className={styles.action}><span>Action</span><ChoiceMenu compact label="Tag action" value={action} onChange={value => setAction(value as 'add' | 'remove')} options={[{ value: 'add', label: 'Add tag' }, { value: 'remove', label: 'Remove tag' }]} disabled={busy} /></div>
          <label className={styles.fieldLabel}>Tag name<Input value={tag} onChange={event => setTag(event.target.value)} maxLength={40} placeholder="Choose or create a tag" autoComplete="off" aria-describedby="roster-tag-guidance" /></label>
          <p id="roster-tag-guidance" className={styles.hint}>Use 1–40 characters. Tags can include spaces, but not commas.</p>
          {matchingTags.length > 0 && <div className={styles.existingTags} aria-label="Existing creator tags">{matchingTags.map(value => <button type="button" key={value} className={`${styles.existingTag} ${normalized === value ? styles.selectedTag : ''}`} aria-pressed={normalized === value} onClick={() => setTag(value)}>{value}</button>)}</div>}
        </fieldset>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {busy && <p className={styles.hint} role="status">Saving creator tags…</p>}
        <footer className={styles.editorFooter}><Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button><Button size="sm" className={styles.save} onClick={() => void save()} disabled={busy || loading || !canWrite || !validIds || !normalized}>Save tag</Button></footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
