'use client';

/**
 * Drops — selected Discord post formats, with independent progress and results.
 *
 * Replaces the Create panel's "Creator post" mode, which was a dropdown over
 * three of the seven formats that exist. The other four (Movers, Rookies,
 * Month to Date, Milestones) shipped and were never reachable. Worse, the
 * three that WERE reachable are the three that rank by absolute GMV, so the
 * same creators won every week and the feed read stale.
 *
 * Users choose formats; each selected format shows what it found independently.
 * Growth-ranked formats lead; size-ranked ones sit below them. A format with
 * nothing to say renders an empty card instead of being padded, and a format
 * that THREW renders an error card, because "broke" and "found nothing" must
 * never look the same.
 *
 * Copy only. The Discord bot has been down since March, so nothing here claims
 * to post for you.
 */

import { DateField } from '@/components/ui/date-field';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Clipboard, Clock3, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChoiceMenu } from '@/components/ui/choice-menu';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SegmentedControl } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { DROP_FORMATS, type DropFormat, type DropFormatId } from '@/lib/data/drop-formats';
import { DROP_SELECTION_KEY, loadDropBoard, parseDropSelection } from '@/lib/data/drop-board-client';
import { useBrandSelect, BrandListWarning } from '../reporting/use-report-brands';
import { renderDiscordMarkdown } from '../reporting/message-preview';
import { DropFormatPicker } from './drop-format-picker';
import styles from './workspace.module.css';

interface DropCard {
  id: string;
  label: string;
  what: string;
  growthRanked: boolean;
  acceptsWindow: boolean;
  windowLabel: string;
  text: string | null;
  mentionMap: Record<string, string>;
  qualified: string | null;
  empty: boolean;
  error: string | null;
}

type Preset = '7d' | '30d' | 'custom';

export default function DropsPage() {
  const { brand, setBrand, options: brandOptions, error: brandsError } =
    useBrandSelect({ collapseUmbrella: true });

  const [preset, setPreset] = useState<Preset>('7d');
  const [startDate, setStartDate] = useState(() => new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const today = new Date().toISOString().slice(0, 10);
  const rangeValid = preset !== 'custom' || startDate <= endDate;
  const [selected, setSelected] = useState<DropFormatId[]>(() => DROP_FORMATS.map(f => f.id));
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [active, setActive] = useState<DropFormatId[]>([]);
  const selectedFormats = DROP_FORMATS.filter(f => selected.includes(f.id));

  useEffect(() => {
    try {
      const saved = parseDropSelection(localStorage.getItem(DROP_SELECTION_KEY));
      setSelected(saved);
    } catch { /* Storage may be unavailable. */ }
    setPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    try { localStorage.setItem(DROP_SELECTION_KEY, JSON.stringify(selected)); } catch { /* Selection still works without storage. */ }
  }, [selected, preferencesReady]);

  const [cards, setCards] = useState<DropCard[] | null>(null);
  const [meta, setMeta] = useState<{ brandName: string; rangeLabel: string; found: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A slow board must not repopulate after the operator changed brand or range.
  const runSeq = useRef(0);
  const request = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    if (!selected.length) return;
    const seq = ++runSeq.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    setCards([]);
    setMeta(null);
    setActive([]);
    try {
      const params = new URLSearchParams({ brand, period: preset });
      if (preset === 'custom') { params.set('start', startDate); params.set('end', endDate); }
      const completed = new Map<string, DropCard>();
      await loadDropBoard(params, controller.signal, (card, brandName, rangeLabel) => {
        if (seq !== runSeq.current) return;
        completed.set(card.id, card);
        setActive(previous => previous.filter(id => id !== card.id));
        const ordered = DROP_FORMATS.flatMap(f => completed.has(f.id) ? [completed.get(f.id)!] : []);
        setCards(ordered);
        setMeta(previous => ({
          brandName: brandName ?? previous?.brandName ?? brand,
          rangeLabel: rangeLabel ?? previous?.rangeLabel ?? '',
          found: ordered.filter(c => c.text !== null).length,
          total: selected.length,
        }));
      }, {
        formats: selected,
        onStart: id => { if (seq === runSeq.current) setActive(previous => [...previous, id]); },
      });
    } catch (err) {
      if (seq !== runSeq.current) return;
      setError(err instanceof Error ? err.message : 'Failed to build the board');
    } finally {
      if (seq === runSeq.current) setLoading(false);
    }
  }, [brand, preset, startDate, endDate, selected]);

  // Changing the selection invalidates the board it describes.
  useEffect(() => {
    runSeq.current += 1;
    request.current?.abort();
    setLoading(false);
    setActive([]);
    setCards(null);
    setMeta(null);
    setError(null);
    return () => { runSeq.current += 1; request.current?.abort(); };
  }, [brand, preset, startDate, endDate, selected]);

  const readyCount = cards?.filter(c => c.text !== null && !c.error).length ?? 0;
  const failedCount = cards?.filter(c => c.error).length ?? 0;
  const emptyCount = cards?.filter(c => c.text === null && !c.error).length ?? 0;

  return (
    <div className={styles.page}>
      <PageHeader title="Creator drops" subtitle="Build and copy Discord posts for your brands."
        actions={<div className={styles.headerActions}><span>{selected.length} formats selected</span><DropFormatPicker selected={selected} onChange={setSelected} disabled={loading}/></div>} />

      <div className={styles.workspace}>
        <aside className={styles.builder} aria-label="Board settings">
          <div className={styles.builderHeading}><h2>Build board</h2><span className={styles.saved}>Preferences saved</span></div>
          <div className={styles.field}>
            <Label htmlFor="dr-brand">Brand</Label>
            <ChoiceMenu compact id="dr-brand" label="Discord post brand" value={brand} onChange={setBrand} options={brandOptions} triggerClassName="w-full" />
            <BrandListWarning show={brandsError} />
          </div>
          <div className={styles.field}>
            <Label>Reporting window</Label>
            <SegmentedControl<Preset> ariaLabel="Window" size="sm" options={[{ value: '7d', label: 'Last 7d' }, { value: '30d', label: 'Last 30d' }, { value: 'custom', label: 'Custom' }]} value={preset} onValueChange={setPreset} />
          </div>
          {preset === 'custom' && <div className={styles.dates}>
            <div className={styles.field}><Label htmlFor="dr-start">From</Label><DateField id="dr-start" value={startDate} max={endDate} onValueChange={setStartDate}/></div>
            <div className={styles.field}><Label htmlFor="dr-end">To</Label><DateField id="dr-end" value={endDate} min={startDate} max={today} onValueChange={setEndDate}/></div>
          </div>}
          {!rangeValid && <p className={styles.errorText}>Start date must be on or before the end date.</p>}
          {preset === 'custom' && <p className={styles.hint}>Daily Drop, Month to Date and Milestones use their own windows. Each result shows its dates.</p>}
          <Button className={styles.buildButton} onClick={run} disabled={loading || !rangeValid || !selected.length || !preferencesReady}>
            {loading ? <><Loader2 className="animate-spin"/>Building {cards?.length ?? 0}/{selected.length}</> : <><Sparkles/>Build board ({selected.length})</>}
          </Button>
          {!selected.length && <p className={styles.hint}>Choose at least one format using Customize build.</p>}
          <details className={styles.formatList}><summary>Included formats ({selected.length})</summary>{selectedFormats.map(format=><div key={format.id}><Check size={13}/><span>{format.label}</span><small>{format.acceptsWindow ? 'Selected window' : format.ownWindowLabel}</small></div>)}</details>
          <p className={styles.hint}>Copy completed posts while the remaining formats load.</p>
        </aside>

        <section className={styles.results} aria-label="Board results">
          <div className={styles.resultsHeading}><div><h2>{cards === null ? 'Your board' : loading ? 'Building your board' : 'Board results'}</h2><p>{meta ? meta.brandName+' · '+meta.rangeLabel : 'Selected formats appear here as they finish.'}</p></div>{cards !== null && <span className={styles.resultCount}>{cards.length}/{selected.length} checked</span>}</div>

          {cards !== null && <div role="status" aria-live="polite" className={styles.progress}>
            <div>{loading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true"/> : <Check className="h-4 w-4" aria-hidden="true"/>}<strong>{loading ? 'Posts are still loading' : 'Board finished'}</strong><span>{readyCount} ready · {emptyCount} with no results · {failedCount} failed</span></div>
            {loading && <progress aria-label="Board progress" value={cards.length} max={selected.length}/>}
          </div>}

          {error && <div role="alert" className={styles.error}><AlertCircle className="h-4 w-4 shrink-0"/><span>{error}</span></div>}

          {cards === null && !error && <div className={styles.previews}>
            {selectedFormats.map(format=><article key={format.id} className={styles.formatPreview}>
              <div><h3>{format.label}</h3><Badge variant={format.growthRanked ? 'positive' : 'neutral'} size="sm">{format.growthRanked ? 'Growth' : 'Size'}</Badge></div>
              <p>{format.what}</p><small>{format.acceptsWindow ? 'Uses your selected reporting window' : format.ownWindowLabel}</small>
            </article>)}
            {!selectedFormats.length && <div className={styles.noFormats}><Sparkles size={22}/><h3>Choose your post formats</h3><p>Customize the build to include the boards your team uses.</p></div>}
          </div>}

          {cards !== null && <div className={styles.board}>
            {selectedFormats.map(format=>{
              const card=cards.find(item=>item.id===format.id);
              return card ? <DropTile key={format.id} card={card} brand={brand}/> : loading ? <PendingDropTile key={format.id} format={format} active={active.includes(format.id)}/> : null;
            })}
          </div>}
        </section>
      </div>
    </div>
  );
}

function PendingDropTile({ format, active }: { format: DropFormat; active: boolean }) {
  return (
    <Card aria-busy="true" className="flex min-h-[200px] flex-col overflow-hidden">
      <div className="space-y-1 border-b border-border px-4 py-3">
        <h3 className="text-sm font-bold text-foreground">{format.label}</h3>
        <p className="text-xs text-muted-foreground">{format.what}</p>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-2 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {active ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Clock3 aria-hidden="true" className="h-4 w-4" />}
          {active ? 'Building this post…' : 'Waiting to start'}
        </div>
        <p className="text-xs text-muted-foreground">{active ? 'We’re gathering the results. Your post will appear here when it’s ready.' : 'This format is queued and will start automatically.'}</p>
        <div aria-hidden="true" className="mt-2 space-y-2"><Skeleton className="h-2 w-4/5" /><Skeleton className="h-2 w-3/5" /></div>
      </div>
    </Card>
  );
}

function DropTile({ card, brand }: { card: DropCard; brand: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copyError, setCopyError] = useState(false);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    if (!card.text) return;
    try {
      await navigator.clipboard.writeText(card.text);
    } catch {
      setCopyError(true);
      return;
    }
    setCopyError(false);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);

    // Log the send so it stays in the outbox history. Fire-and-forget: a failed
    // log must never block the copy that just happened.
    fetch('/api/report-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportType: card.id, format: null, brand,
        periodLabel: card.windowLabel, destination: 'manual',
      }),
    }).catch(() => {});
  };

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="space-y-1 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold tracking-tight text-foreground">{card.label}</h3>
          {card.growthRanked
            ? <Badge variant="positive" size="sm">Ranks by growth</Badge>
            : <Badge variant="neutral" size="sm">Ranks by size</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{card.what}</p>
        <p className="text-[11px] text-muted-foreground">
          {!card.acceptsWindow && (
            <span className="font-semibold text-foreground">Own window: </span>
          )}
          {card.windowLabel}
          {card.qualified && <> · {card.qualified}</>}
        </p>
      </div>

      {card.error ? (
        // A format that broke must never read as a format that found nothing.
        <div className="flex flex-1 flex-col gap-1.5 bg-[var(--pulse-neg-bg)] px-4 py-5">
          <p className="text-xs font-bold text-[var(--pulse-neg)]">This format failed to build.</p>
          <p className="text-[11px] text-[var(--pulse-neg)]">{card.error}</p>
          <p className="text-[11px] text-muted-foreground">It found nothing because it errored, not because there was nothing.</p>
        </div>
      ) : card.text === null ? (
        <div className="flex flex-1 flex-col gap-1.5 bg-secondary/60 px-4 py-5">
          <p className="text-xs font-bold text-foreground">Nothing qualified this window.</p>
          <p className="text-[11px] text-muted-foreground">
            The card stays empty rather than reaching further back for something to say.
          </p>
        </div>
      ) : (
        <div className="max-h-[300px] flex-1 overflow-auto bg-[#36393f] p-4">
          <div className="whitespace-pre-wrap text-[12.5px] leading-[1.5rem] text-[#dcddde]">
            {renderDiscordMarkdown(card.text, card.mentionMap)}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
        {copyError && <span className="text-[11px] text-[var(--pulse-neg)]">Clipboard blocked, select the text above</span>}
        <span className="flex-1" />
        <Button
          size="sm"
          variant={card.text ? 'primary' : 'outline'}
          disabled={!card.text}
          onClick={copy}
          className={cn(!card.text && 'opacity-50')}
          style={copied ? { backgroundImage: 'none', backgroundColor: 'var(--pulse-pos)' } : undefined}
        >
          {copied ? <><Check />Copied</> : <><Clipboard />{card.text ? 'Copy' : 'Nothing to copy'}</>}
        </Button>
      </div>
    </Card>
  );
}
